'use server'

/**
 * اکشن‌های پنل مدیریت.
 *
 * ═══ سه قاعده در کل فایل ═══
 *
 * ۱. **هر اکشن با `requireAdminActor` شروع می‌شود.** بررسی نقش در صفحه کافی
 *    نیست: اکشن‌ها endpoint واقعی‌اند و مستقیم قابل صدا زدن.
 * ۲. **در حالت «مشاهده به‌عنوان» هیچ نوشتنی مجاز نیست** — حتی برای ادمین.
 * ۳. **هر تغییر در `audit_log` ثبت می‌شود.** ادمین قوی‌ترین نقش است؛ بدون رد
 *    پا، اشتباهش قابل پیدا کردن نیست.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSession } from '@/core/auth/currentUser'
import { startViewAs, VIEW_AS_READONLY } from '@/core/auth/impersonation'
import { generatePassword, hashPassword, MAX_PASSWORD_LENGTH } from '@/core/auth/password'
import { normalizePhone } from '@/core/auth/phone'
import {
  createUser,
  countActiveAdmins,
  findUserById,
  findUserByPhone,
  findUserByUsername,
  grantPlaceRole,
  isUsernameTaken,
  revokePlaceRole,
  revokeAllSessions,
  setCredentials,
  setUserBlocked,
  setUserRole,
} from '@/core/auth/userRepo'
import { purgeOldPageViews, rollupDay } from '@/core/analytics/track'
import { recordAudit, refreshPlaceDerived, type Actor } from '@/core/places/manage'
import { invalidateReferenceCache, invalidateSiteMean } from '@/core/places/queries'
import { reviewEditSuggestion } from '@/core/places/suggestions'
import { getAuthPolicy } from '@/core/settings/policies'
import { SETTING_DEFS } from '@/core/settings/registry'
import { getSettings, invalidateSettings, resetSettings, saveSettings } from '@/core/settings/store'
import { recalcPlaceRating } from '@/core/user/userData'
import { getDb } from '@/db/client'
import {
  auditLog,
  appUser,
  bloggerProfile,
  district as districtTable,
  menuItem as menuItemTable,
  place as placeTable,
  placeSubmission,
  review as reviewTable,
  reviewReply,
} from '@/db/schema'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { normalizeFa } from '@/core/text/normalize'
import { cleanUserText, normalizeInstagram } from '@/core/security/input'
import { paths } from '@/routes'
import { startTopMenuSync } from '@/core/sync/topMenuSync'
import { parseTopMenuSelection } from '@/core/sync/topMenuSelection'
import type { AdminActionState } from './state'
import { runManagedWrite } from '@/core/places/managedWrite'

function str(form: FormData, key: string): string {
  const value = form.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

export async function moderateReplyAction(_previous: AdminActionState, form: FormData): Promise<AdminActionState> {
  return runManagedWrite(async () => {
    const guard = await requireAdminActor()
    if (!guard.ok) return { ok: false, error: guard.error }
    const id = num(form, 'replyId'), decision = str(form, 'decision')
    if (!id || !['approved', 'rejected'].includes(decision)) return { ok: false, error: 'پاسخ یا تصمیم معتبر نیست.' }
    const [row] = await getDb().select({ status: reviewReply.status, slug: placeTable.slug }).from(reviewReply)
      .innerJoin(reviewTable, eq(reviewTable.id, reviewReply.reviewId)).innerJoin(placeTable, eq(placeTable.id, reviewTable.placeId))
      .where(eq(reviewReply.id, id)).limit(1).for('update')
    if (!row || row.status !== 'pending') return { ok: false, error: 'این پاسخ دیگر در انتظار بررسی نیست؛ صفحه را تازه کنید.' }
    await getDb().update(reviewReply).set({ status: decision as 'approved' | 'rejected' }).where(and(eq(reviewReply.id, id), eq(reviewReply.status, 'pending')))
    await recordAudit(guard.actor, `review.reply.${decision}`, 'review_reply', id, row.status, decision)
    revalidatePath(paths.cafe(row.slug)); revalidatePath(paths.admin)
    return { ok: true, message: decision === 'approved' ? 'پاسخ کافه‌دار منتشر شد.' : 'پاسخ کافه‌دار رد شد.' }
  })
}

function num(form: FormData, key: string): number | null {
  const raw = str(form, key)
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

async function requireAdminActor(): Promise<
  { ok: true; actor: Actor } | { ok: false; error: string }
> {
  const { user, actor } = await getSession()
  if (!user) return { ok: false, error: 'ابتدا وارد شوید.' }
  if (actor) return { ok: false, error: VIEW_AS_READONLY }
  if (user.role !== 'admin') return { ok: false, error: 'دسترسی ندارید.' }
  const account = await findUserById(user.id)
  if (!account || account.blocked) return { ok: false, error: 'حساب فعال پیدا نشد.' }
  if (account.mustChangePassword) return { ok: false, error: 'پیش از ادامه، رمز موقت را تغییر دهید.' }
  return { ok: true, actor: { userId: user.id, label: user.name || user.phone || user.id } }
}

async function archiveState(placeId: number) {
  const [row] = await getDb().select().from(auditLog).where(and(eq(auditLog.entity, 'place'), eq(auditLog.entityId, String(placeId)), inArray(auditLog.action, ['place.archive', 'place.restore']))).orderBy(desc(auditLog.id)).limit(1)
  return row?.action === 'place.archive' ? row : null
}

export async function archivePlaceAction(_previous: AdminActionState, form: FormData): Promise<AdminActionState> {
  return runManagedWrite(async () => {
    const guard = await requireAdminActor(); if (!guard.ok) return { ok: false, error: guard.error }
    const id = num(form, 'placeId'); if (!id) return { ok: false, error: 'مجموعه مشخص نیست.' }
    const [before] = await getDb().select().from(placeTable).where(eq(placeTable.id, id)).limit(1).for('update')
    if (!before || await archiveState(id)) return { ok: false, error: 'مجموعه پیدا نشد یا قبلاً آرشیو شده است.' }
    await getDb().update(placeTable).set({ status: 'draft', revision: sql`${placeTable.revision}+1` }).where(eq(placeTable.id, id))
    await recordAudit(guard.actor, 'place.archive', 'place', id, { status: before.status, name: before.name }, { status: 'draft' })
    invalidateReferenceCache(); revalidatePath('/', 'layout')
    return { ok: true, message: 'مجموعه از نمایش عمومی خارج و آرشیو شد؛ منو، کاربران و اطلاعات حفظ شدند و قابل بازیابی‌اند.' }
  })
}

export async function restorePlaceAction(_previous: AdminActionState, form: FormData): Promise<AdminActionState> {
  return runManagedWrite(async () => {
    const guard = await requireAdminActor(); if (!guard.ok) return { ok: false, error: guard.error }
    const id = num(form, 'placeId'); if (!id) return { ok: false, error: 'مجموعه مشخص نیست.' }
    const [place] = await getDb().select({ id: placeTable.id }).from(placeTable).where(eq(placeTable.id, id)).limit(1).for('update')
    const archive = await archiveState(id)
    if (!place || !archive) return { ok: false, error: 'آرشیو قابل بازیابی پیدا نشد.' }
    const status = (archive.before as { status?: string } | null)?.status ?? 'draft'
    if (!['published', 'draft', 'temporarily_closed', 'permanently_closed'].includes(status)) return { ok: false, error: 'وضعیت قبلی معتبر نیست.' }
    await getDb().update(placeTable).set({ status: status as typeof placeTable.$inferInsert.status, revision: sql`${placeTable.revision}+1` }).where(eq(placeTable.id, id))
    await recordAudit(guard.actor, 'place.restore', 'place', id, { archiveId: archive.id, status: 'draft' }, { status })
    invalidateReferenceCache(); revalidatePath('/', 'layout')
    return { ok: true, message: 'مجموعه با اطلاعات و وضعیت قبلی بازیابی شد.' }
  })
}

// ═══════════════════════════════════════════════════════════════════════
// تأیید نظر
// ═══════════════════════════════════════════════════════════════════════

async function moderateReviewActionImpl(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const guard = await requireAdminActor()
  if (!guard.ok) return { ok: false, error: guard.error }

  const reviewId = num(form, 'reviewId')
  const decision = str(form, 'decision')
  if (!reviewId) return { ok: false, error: 'نظر مشخص نیست.' }
  if (!['approved', 'rejected', 'spam'].includes(decision)) {
    return { ok: false, error: 'تصمیم نامعتبر است.' }
  }

  const db = getDb()
  const [review] = await db
    .select({ id: reviewTable.id, placeId: reviewTable.placeId, status: reviewTable.status })
    .from(reviewTable)
    .where(eq(reviewTable.id, reviewId))
    .limit(1)
  if (!review) return { ok: false, error: 'این نظر پیدا نشد.' }

  const rejectReason = str(form, 'reason') || null
  await db
    .update(reviewTable)
    .set({
      status: decision as 'approved' | 'rejected' | 'spam',
      moderatedByUserId: guard.actor.userId,
      moderatedAt: new Date(),
      // دلیل رد به کاربر نشان داده می‌شود؛ ردِ بی‌توضیح، مشارکت را می‌کشد.
      rejectReason: decision === 'approved' ? null : rejectReason,
    })
    .where(eq(reviewTable.id, reviewId))

  // امتیاز مکان فقط از نظرهای تأییدشده ساخته می‌شود، پس هر تغییر وضعیت
  // باید بازمحاسبه شود — چه تأیید و چه رد.
  await recalcPlaceRating(review.placeId)
  await recordAudit(guard.actor, `review.${decision}`, 'review', reviewId, review.status, decision)

  const [place] = await db
    .select({ slug: placeTable.slug })
    .from(placeTable)
    .where(eq(placeTable.id, review.placeId))
    .limit(1)
  if (place) revalidatePath(paths.cafe(place.slug))
  revalidatePath(paths.admin)
  revalidatePath(paths.reviewedCafes)
  revalidatePath('/sitemap.xml')
  revalidatePath(paths.search)

  return { ok: true, message: decision === 'approved' ? 'نظر منتشر شد.' : 'نظر رد شد.' }
}

// ═══════════════════════════════════════════════════════════════════════
// بررسی کافه‌ی ثبت‌شده
// ═══════════════════════════════════════════════════════════════════════

interface SubmissionPayload {
  address?: string
  districtId?: string | null
  phone?: string
  instagram?: string
  lat?: number | null
  lng?: number | null
  kind?: string
  note?: string
}

/**
 * تأیید یک کافه‌ی ثبت‌شده → ساخت مکان واقعی.
 *
 * مکان با وضعیت **`draft`** ساخته می‌شود، نه منتشرشده: داده‌ی کاربر ناقص است
 * (معمولاً فقط نام و آدرس) و انتشار فوری یعنی یک صفحه‌ی خالی در سایت. ادمین
 * بعد از کامل‌کردن، دستی منتشرش می‌کند.
 */
async function reviewSubmissionActionImpl(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const guard = await requireAdminActor()
  if (!guard.ok) return { ok: false, error: guard.error }

  const submissionId = num(form, 'submissionId')
  const decision = str(form, 'decision')
  if (!submissionId) return { ok: false, error: 'مورد مشخص نیست.' }

  const db = getDb()
  const [submission] = await db
    .select()
    .from(placeSubmission)
    .where(eq(placeSubmission.id, submissionId))
    .limit(1)
  if (!submission) return { ok: false, error: 'این مورد پیدا نشد.' }

  if (decision === 'rejected') {
    await db
      .update(placeSubmission)
      .set({
        status: 'rejected',
        reviewedByUserId: guard.actor.userId,
        reviewedAt: new Date(),
        note: str(form, 'reason') || submission.note,
      })
      .where(eq(placeSubmission.id, submissionId))
    await recordAudit(guard.actor, 'submission.reject', 'place_submission', submissionId, null, null)
    revalidatePath(paths.admin)
    return { ok: true, message: 'رد شد.' }
  }

  if (decision !== 'approved') return { ok: false, error: 'تصمیم نامعتبر است.' }

  const payload = (submission.payload ?? {}) as SubmissionPayload
  const name = cleanUserText(submission.name, 200)
  const allowedKinds = new Set(['cafe', 'cafe_restaurant', 'restaurant', 'bakery', 'lounge', 'shop'])
  const kind = allowedKinds.has(payload.kind ?? '') ? payload.kind! : 'cafe'
  const address = cleanUserText(payload.address, 500)
  const about = cleanUserText(payload.note, 2_000) || null
  const instagram = normalizeInstagram(payload.instagram)

  // slug از نام ساخته می‌شود و اگر گرفته بود، پسوند عددی می‌گیرد.
  const base =
    normalizeFa(name).replace(/\s+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'cafe'
  let slug = base
  for (let index = 2; index < 100; index++) {
    const [taken] = await db
      .select({ id: placeTable.id })
      .from(placeTable)
      .where(eq(placeTable.slug, slug))
      .limit(1)
    if (!taken) break
    slug = `${base}-${index}`
  }

  const hasCoords =
    typeof payload.lat === 'number' && Number.isFinite(payload.lat) &&
    typeof payload.lng === 'number' && Number.isFinite(payload.lng) &&
    payload.lat >= -90 && payload.lat <= 90 && payload.lng >= -180 && payload.lng <= 180 &&
    payload.lat !== 0

  let districtId: string | null = null
  if (payload.districtId) {
    const [district] = await db
      .select({ id: districtTable.id })
      .from(districtTable)
      .where(eq(districtTable.id, payload.districtId))
      .limit(1)
    districtId = district?.id ?? null
  }

  const [created] = await db
    .insert(placeTable)
    .values({
      slug,
      name,
      nameNormalized: normalizeFa(name),
      kind: kind as 'cafe',
      // draft، نه published — دلیلش بالای تابع.
      status: 'draft',
      address,
      districtId,
      lat: hasCoords ? payload.lat!.toFixed(7) : null,
      lng: hasCoords ? payload.lng!.toFixed(7) : null,
      geoStatus: hasCoords ? 'ok' : 'missing',
      instagram,
      about,
      source: 'user',
      createdByUserId: submission.userId,
    })
    .$returningId()

  await db
    .update(placeSubmission)
    .set({
      status: 'approved',
      placeId: created!.id,
      reviewedByUserId: guard.actor.userId,
      reviewedAt: new Date(),
    })
    .where(eq(placeSubmission.id, submissionId))

  await refreshPlaceDerived(created!.id)
  await recordAudit(guard.actor, 'submission.approve', 'place', created!.id, null, { slug, name })
  invalidateReferenceCache()
  revalidatePath(paths.admin)

  return {
    ok: true,
    message: `«${name}» ساخته شد (پیش‌نویس). برای انتشار، اطلاعاتش را کامل کنید.`,
  }
}

// ═══════════════════════════════════════════════════════════════════════
// اصلاحِ پیشنهادیِ کاربر
// ═══════════════════════════════════════════════════════════════════════

/**
 * بستنِ یک پیشنهادِ اصلاح.
 *
 * ═══ چرا «اعمال شد» خودش داده را عوض نمی‌کند ═══
 *
 * متنِ کاربر ساختار ندارد: «شنبه تا چهارشنبه ۹ تا ۲۳» باید به ردیف‌های
 * `place_hour` تبدیل شود و «۳۶.۳۱۶، ۵۹.۵۶۷» باید اعتبارسنجی جغرافیایی شود.
 * تحلیلِ حدسی این متن‌ها داده‌ی خراب می‌سازد، که از داده‌ی بیات بدتر است.
 *
 * پس این دکمه فقط پیشنهاد را از صف بیرون می‌برد. اعمالِ واقعی را ادمین در تب
 * «مجموعه‌ها» یا کافه‌دار در پنل خودش انجام می‌دهد — همان‌جایی که فرمِ درست با
 * اعتبارسنجیِ درست هست.
 */
async function reviewSuggestionActionImpl(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const guard = await requireAdminActor()
  if (!guard.ok) return { ok: false, error: guard.error }

  const suggestionId = num(form, 'suggestionId')
  const decision = str(form, 'decision')
  if (!suggestionId) return { ok: false, error: 'پیشنهاد مشخص نیست.' }
  if (decision !== 'applied' && decision !== 'rejected') {
    return { ok: false, error: 'تصمیم نامعتبر است.' }
  }

  const { placeSlug } = await reviewEditSuggestion(suggestionId, decision, guard.actor.userId)

  await recordAudit(
    guard.actor,
    'suggestion.review',
    'edit_suggestion',
    suggestionId,
    'pending',
    decision,
  )

  if (placeSlug) revalidatePath(paths.cafe(placeSlug))
  revalidatePath(paths.admin)
  revalidatePath(paths.contribute)

  return {
    ok: true,
    message: decision === 'applied' ? 'به‌عنوان اعمال‌شده بسته شد.' : 'رد شد.',
  }
}

// ═══════════════════════════════════════════════════════════════════════
// وضعیت انتشار مکان
// ═══════════════════════════════════════════════════════════════════════

async function setPlaceStatusActionImpl(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const guard = await requireAdminActor()
  if (!guard.ok) return { ok: false, error: guard.error }

  const placeId = num(form, 'placeId')
  const status = str(form, 'status')
  if (!placeId) return { ok: false, error: 'مجموعه مشخص نیست.' }
  if (!['draft', 'published', 'temporarily_closed', 'permanently_closed'].includes(status)) {
    return { ok: false, error: 'وضعیت نامعتبر است.' }
  }

  const db = getDb()
  const [before] = await db
    .select({ status: placeTable.status, slug: placeTable.slug })
    .from(placeTable)
    .where(eq(placeTable.id, placeId))
    .limit(1).for('update')
  if (!before) return { ok: false, error: 'این مجموعه پیدا نشد.' }
  if (await archiveState(placeId)) return {ok:false,error:'این کافه آرشیو است؛ ابتدا آن را از بخش آرشیو بازیابی کنید.'}

  await db
    .update(placeTable)
    .set({ status: status as 'published', revision:sql`${placeTable.revision}+1` })
    .where(eq(placeTable.id, placeId))

  await recordAudit(guard.actor, 'place.status', 'place', placeId, before.status, status)
  // شمارش facet و محله فقط مکان‌های منتشرشده را می‌شمارد، پس کش باید بریزد.
  invalidateReferenceCache()
  revalidatePath(paths.cafe(before.slug))
  revalidatePath(paths.admin)

  return { ok: true, message: 'وضعیت عوض شد.' }
}

// ═══════════════════════════════════════════════════════════════════════
// ساخت و حذف مجموعه
// ═══════════════════════════════════════════════════════════════════════

async function createPlaceActionImpl(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const guard = await requireAdminActor()
  if (!guard.ok) return { ok: false, error: guard.error }

  const name = cleanUserText(str(form, 'name'), 200)
  const kind = str(form, 'kind') || 'cafe'
  const status = str(form, 'status') || 'draft'
  const address = cleanUserText(str(form, 'address'), 500)
  const districtId = str(form, 'districtId') || null
  const instagramRaw = str(form, 'instagram')
  const instagram = normalizeInstagram(instagramRaw)
  const lat = num(form, 'lat')
  const lng = num(form, 'lng')
  const kinds = ['cafe', 'cafe_restaurant', 'restaurant', 'bakery', 'lounge', 'shop'] as const
  if (name.length < 2 || name.length > 200) return { ok: false, error: 'نام مجموعه باید بین ۲ تا ۲۰۰ نویسه باشد.' }
  if (instagramRaw && !instagram) return { ok: false, error: 'آدرس یا نام کاربری اینستاگرام معتبر نیست.' }
  if (!kinds.includes(kind as (typeof kinds)[number])) return { ok: false, error: 'نوع مجموعه معتبر نیست.' }
  if (status !== 'draft' && status !== 'published') return { ok: false, error: 'وضعیت اولیه معتبر نیست.' }
  if ((lat === null) !== (lng === null)) return { ok: false, error: 'عرض و طول جغرافیایی را با هم وارد کنید.' }
  if (lat !== null && (lat < -90 || lat > 90 || lng! < -180 || lng! > 180)) return { ok: false, error: 'مختصات معتبر نیست.' }

  const db = getDb()
  const normalized = normalizeFa(name)
  const [duplicate] = await db.select({ id: placeTable.id }).from(placeTable).where(eq(placeTable.nameNormalized, normalized)).limit(1)
  if (duplicate) return { ok: false, error: 'مجموعه‌ای با همین نام وجود دارد؛ ابتدا همان را بررسی کنید.' }
  if (districtId) {
    const [district] = await db.select({ id: districtTable.id }).from(districtTable).where(eq(districtTable.id, districtId)).limit(1)
    if (!district) return { ok: false, error: 'محله معتبر نیست.' }
  }
  const base = normalized.replace(/\s+/g, '-').replace(/^-+|-+$/g, '').slice(0, 110) || 'cafe'
  let slug = base
  for (let index = 2; index < 1000; index++) {
    const [taken] = await db.select({ id: placeTable.id }).from(placeTable).where(eq(placeTable.slug, slug)).limit(1)
    if (!taken) break
    slug = `${base}-${index}`
  }

  const [created] = await db.insert(placeTable).values({
    slug,
    name,
    nameNormalized: normalized,
    kind: kind as (typeof kinds)[number],
    status: status as 'draft' | 'published',
    address,
    districtId,
    instagram,
    lat: lat === null ? null : lat.toFixed(7),
    lng: lng === null ? null : lng!.toFixed(7),
    geoStatus: lat === null ? 'missing' : 'ok',
    source: 'field_visit',
    createdByUserId: guard.actor.userId,
  }).$returningId()
  if (!created) return { ok: false, error: 'ساخت مجموعه انجام نشد.' }
  await refreshPlaceDerived(created.id)
  await recordAudit(guard.actor, 'place.create', 'place', created.id, null, { name, slug, kind, status })
  invalidateReferenceCache()
  revalidatePath(paths.admin)
  revalidatePath(paths.home)
  return { ok: true, message: `«${name}» ساخته شد؛ حالا می‌توانید اطلاعات و منویش را کامل کنید.` }
}

async function deletePlaceActionImpl(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const guard = await requireAdminActor()
  if (!guard.ok) return { ok: false, error: guard.error }
  const placeId = num(form, 'placeId')
  if (!placeId) return { ok: false, error: 'مجموعه مشخص نیست.' }
  const db = getDb()
  const [before] = await db.select().from(placeTable).where(eq(placeTable.id, placeId)).limit(1).for('update')
  if (!before) return { ok: false, error: 'این مجموعه پیدا نشد.' }
  const archived = await archiveState(placeId)
  if (!archived || Date.now() - archived.createdAt.getTime() < 7 * 86400000) return { ok: false, error: 'حذف دائمی فقط پس از آرشیو و گذشت دوره بازیابی ۷ روزه مجاز است.' }
  if (before.status !== 'draft' && before.status !== 'permanently_closed') {
    return { ok: false, error: 'برای حذف دائمی، ابتدا وضعیت را «پیش‌نویس» یا «تعطیل دائم» کنید.' }
  }
  if (str(form, 'confirmName') !== before.name || str(form, 'confirmPhrase') !== 'حذف دائمی') {
    return { ok: false, error: 'نام مجموعه و عبارت «حذف دائمی» باید دقیق وارد شوند.' }
  }
  const [{ items = 0 } = { items: 0 }] = await db.select({ items: sql<number>`COUNT(*)` }).from(menuItemTable).where(eq(menuItemTable.placeId, placeId))
  await db.transaction(async (tx) => {
    await tx.insert(auditLog).values({
      actorUserId: guard.actor.userId,
      actorLabel: guard.actor.label,
      action: 'place.delete',
      entity: 'place',
      entityId: String(placeId),
      before: { name: before.name, slug: before.slug, status: before.status, sourceId: before.sourceId, items: Number(items) },
      after: null,
    })
    await tx.delete(placeTable).where(eq(placeTable.id, placeId))
  })
  invalidateReferenceCache()
  revalidatePath(paths.admin)
  revalidatePath(paths.home)
  return { ok: true, message: `«${before.name}» و ${Number(items).toLocaleString('fa-IR')} آیتم وابسته حذف شد.` }
}

export async function startTopMenuScrapeAction(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const guard = await requireAdminActor()
  if (!guard.ok) return { ok: false, error: guard.error }
  let selection
  try { selection = parseTopMenuSelection(form.get('scope'), form.getAll('sourceId').map(value => Number(value))) }
  catch { return { ok: false, error: 'محدودهٔ کافه‌ها را انتخاب کنید؛ اگر فرم قدیمی است صفحه را تازه کنید.' } }
  const result = await startTopMenuSync('scrape', guard.actor, { selection })
  if (!result.ok) return { ok: false, error: result.error }
  await recordAudit(guard.actor, 'topmenu.scrape_start', 'topmenu_sync', 'pending', null, null)
  revalidatePath(paths.admin)
  return { ok: true, message: 'اسکرپ کامل در پس‌زمینه شروع شد. چند دقیقه بعد صفحه را تازه کنید.' }
}

export async function applyTopMenuPricesAction(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const guard = await requireAdminActor()
  if (!guard.ok) return { ok: false, error: guard.error }
  if (str(form, 'confirm') !== 'اعمال قیمت‌ها') return { ok: false, error: 'برای تأیید، عبارت «اعمال قیمت‌ها» را وارد کنید.' }
  let selection
  try { selection = parseTopMenuSelection(form.get('scope'), form.getAll('sourceId').map(value => Number(value))) }
  catch { return { ok: false, error: 'کافه‌های موردنظر را انتخاب کنید.' } }
  const expectedRunId = str(form, 'runId')
  if (!expectedRunId) return { ok: false, error: 'صفحه را تازه کنید؛ شناسهٔ گزارش در فرم نیست.' }
  const result = await startTopMenuSync('apply', guard.actor, { selection, expectedRunId })
  if (!result.ok) return { ok: false, error: result.error }
  revalidatePath(paths.admin)
  return { ok: true, message: 'بکاپ و اعمال قیمت‌ها در پس‌زمینه شروع شد. صفحه را تازه کنید.' }
}

// ═══════════════════════════════════════════════════════════════════════
// اعتبارنامه — یوزرنیم و رمز
// ═══════════════════════════════════════════════════════════════════════

/**
 * صدور یا بازنشانی اعتبارنامه.
 *
 * ═══ چرا رمز فقط یک‌بار نشان داده می‌شود ═══
 *
 * فقط **هشِ** رمز ذخیره می‌شود، پس هیچ‌کس (از جمله ادمین) نمی‌تواند بعداً
 * ببیندش. اگر گم شد، رمز تازه صادر می‌شود. این عمدی است: رمزی که در دیتابیس
 * قابل خواندن باشد، با یک نفوذ به دیتابیس همه‌ی حساب‌ها را می‌دهد.
 *
 * رمزِ صادرشده `mustChangePassword` می‌گیرد، چون از کانالی مثل واتساپ به
 * کافه‌دار می‌رسد و آن کانال امن نیست.
 */
async function setCredentialsActionImpl(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const guard = await requireAdminActor()
  if (!guard.ok) return { ok: false, error: guard.error }

  const userId = str(form, 'userId')
  const username = str(form, 'username').toLowerCase()
  const explicit = str(form, 'password')

  const target = await findUserById(userId)
  if (!target) return { ok: false, error: 'این حساب پیدا نشد.' }

  if (username) {
    if (!/^[a-z0-9_.]{3,32}$/.test(username)) {
      return {
        ok: false,
        error: 'یوزرنیم باید ۳ تا ۳۲ کاراکتر و فقط حروف لاتین کوچک، رقم، نقطه و زیرخط باشد.',
      }
    }
    if (await isUsernameTaken(username, userId)) {
      return { ok: false, error: 'این یوزرنیم گرفته شده است.' }
    }
  }

  if (explicit && (explicit.length < 8 || explicit.length > MAX_PASSWORD_LENGTH)) {
    return { ok: false, error: 'رمز باید بین ۸ تا ۲۵۶ کاراکتر باشد.' }
  }

  const password = explicit || generatePassword(14)
  await setCredentials(userId, {
    username: username || target.username,
    passwordHash: hashPassword(password),
    // رمزِ ادمین‌ساخته همیشه موقت است؛ اگر خودِ ادمین رمز دلخواه گذاشته،
    // باز هم موقت است چون از یک کانال ناامن رد می‌شود.
    mustChangePassword: true,
  })
  await revokeAllSessions(userId)

  await recordAudit(guard.actor, 'user.credentials', 'app_user', userId, null, {
    username: username || target.username,
    passwordSet: true,
  })
  revalidatePath(paths.admin)

  return {
    ok: true,
    message: 'اعتبارنامه صادر شد.',
    // تنها جایی که رمز دیده می‌شود — همین یک بار.
    credentials: { username: username || target.username || target.phone, password },
  }
}

export async function setPlaceStatusAction(previous:AdminActionState,form:FormData):Promise<AdminActionState>{return runManagedWrite(()=>setPlaceStatusActionImpl(previous,form))}

export async function createPlaceAction(previous:AdminActionState,form:FormData):Promise<AdminActionState>{return runManagedWrite(()=>createPlaceActionImpl(previous,form))}

export async function deletePlaceAction(previous:AdminActionState,form:FormData):Promise<AdminActionState>{return runManagedWrite(()=>deletePlaceActionImpl(previous,form))}

// ═══════════════════════════════════════════════════════════════════════
// ساخت حساب کافه
// ═══════════════════════════════════════════════════════════════════════

/**
 * ساخت حساب برای یک کافه، با اعتبارنامه و انتساب مکان — در یک قدم.
 *
 * ═══ چرا یک قدم و نه سه ═══
 *
 * کارِ واقعیِ ادمین این است: «برای کافه‌ی شایر یک حساب بساز که بتواند منویش
 * را ویرایش کند». اگر این کار سه صفحه‌ی جدا داشته باشد (ساخت کاربر، صدور
 * رمز، انتساب مکان)، هر بار یکی فراموش می‌شود و کافه‌داری می‌ماند که وارد
 * می‌شود ولی پنلش خالی است.
 */
async function createVenueAccountActionImpl(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const guard = await requireAdminActor()
  if (!guard.ok) return { ok: false, error: guard.error }

  const placeId = num(form, 'placeId')
  const username = str(form, 'username').toLowerCase()
  const name = str(form, 'name')
  const phoneRaw = str(form, 'phone')
  const explicit = str(form, 'password')

  if (!placeId) return { ok: false, error: 'مجموعه را انتخاب کنید.' }
  if (!username && !phoneRaw) {
    return { ok: false, error: 'یوزرنیم یا شماره موبایل لازم است.' }
  }
  if (username && !/^[a-z0-9_.]{3,32}$/.test(username)) {
    return { ok: false, error: 'یوزرنیم باید ۳ تا ۳۲ کاراکتر لاتین کوچک، رقم، نقطه یا زیرخط باشد.' }
  }
  if (explicit && (explicit.length < 8 || explicit.length > MAX_PASSWORD_LENGTH)) {
    return { ok: false, error: 'رمز باید بین ۸ تا ۲۵۶ کاراکتر باشد.' }
  }

  const phone = phoneRaw ? normalizePhone(phoneRaw) : null
  if (phoneRaw && !phone) return { ok: false, error: 'شماره موبایل معتبر نیست.' }

  const db = getDb()
  const [place] = await db
    .select({ id: placeTable.id, name: placeTable.name })
    .from(placeTable)
    .where(eq(placeTable.id, placeId))
    .limit(1)
  if (!place) return { ok: false, error: 'این مجموعه پیدا نشد.' }

  // اگر شناسه از قبل حساب دارد، حساب دوم ساخته نمی‌شود. تطبیق هم‌زمانِ
  // شماره و نام کاربری مانع اتصال اتفاقی دو هویت متفاوت می‌شود.
  const [byPhone, byUsername] = await Promise.all([
    phone ? findUserByPhone(phone) : null,
    username ? findUserByUsername(username) : null,
  ])
  if (byPhone && byUsername && byPhone.id !== byUsername.id) {
    return { ok: false, error: 'شماره و نام کاربری به دو حساب متفاوت تعلق دارند.' }
  }
  const existing = byPhone ?? byUsername
  if (existing?.blocked) return { ok: false, error: 'این حساب فعال نیست.' }
  if (existing && explicit) {
    return {
      ok: false,
      error: 'این حساب از قبل وجود دارد؛ برای تغییر رمز از عملیات بازنشانی رمز همان کاربر استفاده کنید.',
    }
  }
  const password = explicit || generatePassword(14)

  const user =
    existing ??
    (await createUser({
      phone,
      username: username || null,
      name: name || place.name,
      role: 'owner',
      passwordHash: hashPassword(password),
      mustChangePassword: true,
      createdByUserId: guard.actor.userId,
    }))

  await grantPlaceRole(user.id, placeId, { role: 'owner', grantedByUserId: guard.actor.userId })
  await recordAudit(guard.actor, 'venue.account', 'app_user', user.id, null, {
    placeId,
    username: username || null,
    reusedExisting: !!existing,
  })
  revalidatePath(paths.admin)

  return {
    ok: true,
    message: existing
      ? `حساب موجود بدون تغییر رمز به «${place.name}» وصل شد.`
      : `حساب برای «${place.name}» ساخته شد.`,
    credentials: existing ? undefined : { username: username || phone || user.id, password },
  }
}

// ═══════════════════════════════════════════════════════════════════════
// نقش، مسدودی، انتساب مکان
// ═══════════════════════════════════════════════════════════════════════

async function setUserRoleActionImpl(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const guard = await requireAdminActor()
  if (!guard.ok) return { ok: false, error: guard.error }

  await getDb().select({id:appUser.id}).from(appUser).where(eq(appUser.role,'admin')).orderBy(appUser.id).for('update')
  const userId = str(form, 'userId')
  const role = str(form, 'role')
  if (!['customer', 'owner', 'admin'].includes(role)) {
    return { ok: false, error: 'نقش نامعتبر است.' }
  }
  if (userId === guard.actor.userId) {
    // ادمینی که نقش خودش را پایین بیاورد، از پنل بیرون می‌افتد و راه
    // برگشتی ندارد جز اسکریپت CLI.
    return { ok: false, error: 'نقش خودتان را از اینجا عوض نکنید.' }
  }

  const before = await findUserById(userId)
  if (!before) return { ok: false, error: 'این حساب پیدا نشد.' }

  if (before.role === 'admin' && role !== 'admin') {
    if ((await countActiveAdmins()) <= 1) {
      return { ok: false, error: 'تنزل آخرین مدیر سیستم مجاز نیست.' }
    }
  }
  if (role === 'customer' && before.ownedPlaces.length > 0) {
    return { ok: false, error: 'ابتدا دسترسی این کاربر به همهٔ کافه‌ها را بردارید.' }
  }

  await setUserRole(userId, role as 'customer' | 'owner' | 'admin')
  await revokeAllSessions(userId)
  await recordAudit(guard.actor, 'user.role', 'app_user', userId, before.role, role)
  revalidatePath(paths.admin)
  return { ok: true, message: 'نقش عوض شد.' }
}

async function setUserBlockedActionImpl(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const guard = await requireAdminActor()
  if (!guard.ok) return { ok: false, error: guard.error }

  const userId = str(form, 'userId')
  await getDb().select({id:appUser.id}).from(appUser).where(eq(appUser.role,'admin')).orderBy(appUser.id).for('update')
  const blocked = str(form, 'blocked') === '1'
  if (userId === guard.actor.userId) {
    return { ok: false, error: 'حساب خودتان را مسدود نکنید.' }
  }

  const before = await findUserById(userId)
  if (!before) return { ok: false, error: 'این حساب پیدا نشد.' }
  if (blocked && before.role === 'admin' && (await countActiveAdmins()) <= 1) {
    return { ok: false, error: 'مسدودکردن آخرین مدیر سیستم مجاز نیست.' }
  }

  await setUserBlocked(userId, blocked)
  if (blocked) await revokeAllSessions(userId)
  await recordAudit(guard.actor, blocked ? 'user.block' : 'user.unblock', 'app_user', userId, before.blocked, blocked)
  revalidatePath(paths.admin)
  return { ok: true, message: blocked ? 'حساب مسدود شد.' : 'مسدودی برداشته شد.' }
}

async function setBloggerAccessActionImpl(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const guard = await requireAdminActor()
  if (!guard.ok) return { ok: false, error: guard.error }
  const userId = str(form, 'userId')
  const enabled = str(form, 'enabled') === '1'
  const target = await findUserById(userId)
  if (!target) return { ok: false, error: 'این حساب پیدا نشد.' }
  if (enabled) {
    await getDb().insert(bloggerProfile).values({ userId, active: true, verifiedByUserId: guard.actor.userId }).onDuplicateKeyUpdate({ set: { active: true, verifiedByUserId: guard.actor.userId } })
  } else {
    await getDb().update(bloggerProfile).set({ active: false }).where(eq(bloggerProfile.userId, userId))
  }
  await recordAudit(guard.actor, enabled ? 'blogger.grant' : 'blogger.revoke', 'app_user', userId, !enabled, enabled)
  revalidatePath(paths.admin)
  return { ok: true, message: enabled ? 'دسترسی بلاگر فعال شد.' : 'دسترسی بلاگر برداشته شد.' }
}

async function assignPlaceActionImpl(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const guard = await requireAdminActor()
  if (!guard.ok) return { ok: false, error: guard.error }

  const userId = str(form, 'userId')
  const placeId = num(form, 'placeId')
  const revoke = str(form, 'revoke') === '1'
  const placeRole = str(form, 'placeRole') === 'manager' ? 'manager' : 'owner'
  if (!userId || !placeId) return { ok: false, error: 'کاربر یا مجموعه مشخص نیست.' }

  if (revoke) {
    await revokePlaceRole(userId, placeId)
    await recordAudit(guard.actor, 'place.revoke', 'app_user', userId, placeId, null)
    revalidatePath(paths.admin)
    return { ok: true, message: 'دسترسی برداشته شد.' }
  }

  await grantPlaceRole(userId, placeId, { role: placeRole, grantedByUserId: guard.actor.userId })
  await recordAudit(guard.actor, 'place.grant', 'app_user', userId, null, placeId)
  revalidatePath(paths.admin)
  return { ok: true, message: 'مجموعه به این حساب وصل شد.' }
}

// ═══════════════════════════════════════════════════════════════════════
// ورود به پنل دیگران
// ═══════════════════════════════════════════════════════════════════════

/**
 * «مشاهده به‌عنوان» — ورود ادمین به پنل یک کاربر یا کافه‌دار.
 *
 * محدودیت‌ها در `core/auth/impersonation.ts` مستند شده‌اند؛ خلاصه: کوکی دوم
 * (نشست ادمین دست‌نخورده می‌ماند)، نیم‌ساعت اعتبار، **فقط‌خواندنی**، و
 * ادمین دیگر قابل مشاهده نیست.
 */
export async function startViewAsAction(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const guard = await requireAdminActor()
  if (!guard.ok) return { ok: false, error: guard.error }

  const target = await findUserById(str(form, 'userId'))
  if (!target) return { ok: false, error: 'این حساب پیدا نشد.' }
  if (target.id === guard.actor.userId) return { ok: false, error: 'پنل خودتان همین است.' }
  if (target.blocked) return { ok: false, error: 'این حساب مسدود است.' }
  if (target.role === 'admin') {
    // وگرنه می‌شد کارهای مدیریتی را زیر نام یک ادمین دیگر انجام داد.
    return { ok: false, error: 'پنل یک مدیر دیگر را نمی‌شود به نام او دید.' }
  }

  await startViewAs(guard.actor.userId, target.id, (await getAuthPolicy()).viewAsMaxAgeSec)
  await recordAudit(guard.actor, 'view_as.start', 'app_user', target.id, null, null)
  revalidatePath('/', 'layout')

  // مالک به پنل کافه می‌رود، کاربر عادی به پنل خودش — همان جایی که خودش
  // بعد از ورود می‌دید.
  redirect(target.role === 'owner' ? paths.ownerPanel : paths.profile)
}

// ═══════════════════════════════════════════════════════════════════════
// تنظیمات سایت
// ═══════════════════════════════════════════════════════════════════════

/**
 * ذخیره‌ی یک گروه تنظیم.
 *
 * ═══ چرا گروه‌به‌گروه و نه همه با هم ═══
 *
 * یک فرم با ۷۰ فیلد یعنی هر ذخیره، همه‌ی تنظیمات را دوباره می‌نویسد و
 * `audit_log` نمی‌گوید ادمین **چه چیزی** را عوض کرد. با فرمِ هر گروه، ردیفِ
 * لاگ دقیقاً همان چند کلیدِ تغییریافته را دارد.
 *
 * ═══ نکته‌ی مهمِ چک‌باکس ═══
 *
 * چک‌باکسِ خاموش در `FormData` **وجود ندارد**. پس فرم برای هر فیلد بولی یک
 * `input hidden` با نام `__bool.<key>` می‌فرستد تا این تابع بداند آن کلید در
 * این فرم بوده و مقدارش `false` است. بدون آن، خاموش‌کردن هیچ سوئیچی ذخیره
 * نمی‌شد — یک باگِ ساکت که فقط با تست دستی پیدا می‌شود.
 */
async function saveSettingsActionImpl(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const guard = await requireAdminActor()
  if (!guard.ok) return { ok: false, error: guard.error }

  const patch: Record<string, unknown> = {}

  // فیلدهای بولی: از فهرست اعلام‌شده‌ی فرم، نه از کلیدهای موجود.
  for (const key of form.getAll('__bool')) {
    if (typeof key === 'string') patch[key] = false
  }

  for (const [key, value] of form.entries()) {
    if (key === '__bool' || key === '__group') continue
    if (typeof value !== 'string') continue
    patch[key] = value
  }

  const result = await saveSettings(patch, {
    userId: guard.actor.userId,
    label: guard.actor.label,
  })

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.errors.length === 1
          ? result.errors[0]!.message
          : 'هیچ مقداری ذخیره نشد — خطاهای مشخص‌شده را اصلاح کنید.',
      fieldErrors: Object.fromEntries(result.errors.map((item) => [item.key, item.message])),
    }
  }

  const priceDerivedKeys = new Set([
    'priceTierCheapMax',
    'priceTierMidMax',
    'priceStatsMaxItemPrice',
    'priceStatsExcludeServiceSections',
  ])
  const shouldRecomputePrices = result.saved.some((key) => priceDerivedKeys.has(key))
  let recomputedPlaces = 0
  if (shouldRecomputePrices) {
    const db = getDb()
    const rows = await db.select({ id: placeTable.id }).from(placeTable)
    for (const row of rows) await refreshPlaceDerived(row.id)
    recomputedPlaces = rows.length
    invalidateReferenceCache()
  }

  // تنظیمات روی متادیتا، هدر و همه‌ی صفحه‌ها اثر دارند.
  revalidatePath('/', 'layout')

  return {
    ok: true,
    message:
      result.saved.length === 0
        ? 'چیزی تغییر نکرده بود.'
        : shouldRecomputePrices
          ? `${result.saved.length} تنظیم ذخیره و سطح قیمت ${recomputedPlaces} مجموعه بازمحاسبه شد.`
          : `${result.saved.length} تنظیم ذخیره شد.`,
    savedKeys: result.saved,
  }
}

export async function moderateReviewAction(previous:AdminActionState,form:FormData):Promise<AdminActionState>{return runManagedWrite(()=>moderateReviewActionImpl(previous,form))}

export async function reviewSubmissionAction(previous:AdminActionState,form:FormData):Promise<AdminActionState>{return runManagedWrite(()=>reviewSubmissionActionImpl(previous,form))}

export async function reviewSuggestionAction(previous:AdminActionState,form:FormData):Promise<AdminActionState>{return runManagedWrite(()=>reviewSuggestionActionImpl(previous,form))}

export async function setCredentialsAction(previous:AdminActionState,form:FormData):Promise<AdminActionState>{return runManagedWrite(()=>setCredentialsActionImpl(previous,form))}

export async function createVenueAccountAction(previous:AdminActionState,form:FormData):Promise<AdminActionState>{return runManagedWrite(()=>createVenueAccountActionImpl(previous,form))}

export async function setUserRoleAction(previous:AdminActionState,form:FormData):Promise<AdminActionState>{return runManagedWrite(()=>setUserRoleActionImpl(previous,form))}

export async function setUserBlockedAction(previous:AdminActionState,form:FormData):Promise<AdminActionState>{return runManagedWrite(()=>setUserBlockedActionImpl(previous,form))}

export async function setBloggerAccessAction(previous:AdminActionState,form:FormData):Promise<AdminActionState>{return runManagedWrite(()=>setBloggerAccessActionImpl(previous,form))}

export async function assignPlaceAction(previous:AdminActionState,form:FormData):Promise<AdminActionState>{return runManagedWrite(()=>assignPlaceActionImpl(previous,form))}

/** برگرداندن یک گروه به پیش‌فرض‌های کد. */
async function resetSettingsActionImpl(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const guard = await requireAdminActor()
  if (!guard.ok) return { ok: false, error: guard.error }

  const group = str(form, 'group')
  const keys = SETTING_DEFS.filter((def) => def.group === group).map((def) => def.key)
  if (keys.length === 0) return { ok: false, error: 'گروه ناشناس.' }

  await resetSettings(keys, { userId: guard.actor.userId, label: guard.actor.label })
  if (group === 'data') {
    const db = getDb()
    const rows = await db.select({ id: placeTable.id }).from(placeTable)
    for (const row of rows) await refreshPlaceDerived(row.id)
    invalidateReferenceCache()
  }
  revalidatePath('/', 'layout')
  return {
    ok: true,
    message: group === 'data'
      ? 'به پیش‌فرض برگشت و سطح قیمت همهٔ مجموعه‌ها بازمحاسبه شد.'
      : 'به پیش‌فرض برگشت.',
  }
}

export async function saveSettingsAction(previous: AdminActionState, form: FormData): Promise<AdminActionState> {
  return runManagedWrite(() => saveSettingsActionImpl(previous, form))
}

export async function resetSettingsAction(previous: AdminActionState, form: FormData): Promise<AdminActionState> {
  return runManagedWrite(() => resetSettingsActionImpl(previous, form))
}

// ═══════════════════════════════════════════════════════════════════════
// عملیات
// ═══════════════════════════════════════════════════════════════════════

/**
 * کارهای نگه‌داری که تا امروز فقط با اجرای دستیِ اسکریپت انجام می‌شدند.
 *
 * هر کدام **idempotent** است: اجرای دوباره ضرری ندارد. این شرط لازمِ گذاشتن
 * یک دکمه در پنل است — دکمه‌ای که دو بار زدنش داده را خراب کند، نباید وجود
 * داشته باشد.
 */
export async function runOperationAction(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const guard = await requireAdminActor()
  if (!guard.ok) return { ok: false, error: guard.error }

  const operation = str(form, 'operation')
  const settings = await getSettings()

  try {
    switch (operation) {
      case 'rollup': {
        // امروز و دیروز: رول‌آپِ دیروز ممکن است وقتی اجرا شده که روز تمام نشده بود.
        const today = new Date()
        const yesterday = new Date(today.getTime() - 86_400_000)
        await rollupDay(yesterday)
        await rollupDay(today)
        return { ok: true, message: 'آمار امروز و دیروز بازمحاسبه شد.' }
      }

      case 'purge_views': {
        await purgeOldPageViews(settings.pageViewRetentionDays)
        return {
          ok: true,
          message: `بازدیدهای قدیمی‌تر از ${settings.pageViewRetentionDays} روز پاک شدند.`,
        }
      }

      case 'recompute_derived': {
        /*
          رده‌ی قیمت و امتیاز کیفیت از تنظیمات ساخته می‌شوند، پس بعد از
          عوض‌کردن مرزهای قیمت باید بازمحاسبه شوند — وگرنه فیلترِ «اقتصادی»
          با مرزِ تازه نمی‌خواند.
        */
        const db = getDb()
        const rows = await db.select({ id: placeTable.id }).from(placeTable)
        for (const row of rows) await refreshPlaceDerived(row.id)
        invalidateReferenceCache()
        revalidatePath('/', 'layout')
        return { ok: true, message: `مقادیر مشتقِ ${rows.length} مجموعه بازمحاسبه شد.` }
      }

      case 'recalc_ratings': {
        const db = getDb()
        const rows = await db.select({ id: placeTable.id }).from(placeTable)
        for (const row of rows) await recalcPlaceRating(row.id)
        revalidatePath('/', 'layout')
        return { ok: true, message: `امتیاز ${rows.length} مجموعه از نظرهای تأییدشده ساخته شد.` }
      }

      case 'clear_caches': {
        invalidateSettings()
        invalidateReferenceCache()
        invalidateSiteMean()
        revalidatePath('/', 'layout')
        return { ok: true, message: 'کش‌های درون‌حافظه‌ای خالی شد.' }
      }

      default:
        return { ok: false, error: 'این عملیات را نمی‌شناسم.' }
    }
  } catch (error) {
    console.error('[admin] operation failed', operation, error)
    return {
      ok: false,
      error: `اجرای «${operation}» شکست خورد. جزئیات در لاگ سرور است.`,
    }
  } finally {
    await recordAudit(guard.actor, `operation.${operation}`, 'setting', operation, null, null)
  }
}
