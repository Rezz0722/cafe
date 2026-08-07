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
import { generatePassword, hashPassword } from '@/core/auth/password'
import { normalizePhone } from '@/core/auth/phone'
import {
  createUser,
  findUserById,
  findUserByPhone,
  grantPlaceRole,
  isUsernameTaken,
  revokePlaceRole,
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
  place as placeTable,
  placeSubmission,
  review as reviewTable,
} from '@/db/schema'
import { eq } from 'drizzle-orm'
import { normalizeFa } from '@/core/text/normalize'
import { paths } from '@/routes'
import type { AdminActionState } from './state'

function str(form: FormData, key: string): string {
  const value = form.get(key)
  return typeof value === 'string' ? value.trim() : ''
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
  return { ok: true, actor: { userId: user.id, label: user.name || user.phone || user.id } }
}

// ═══════════════════════════════════════════════════════════════════════
// تأیید نظر
// ═══════════════════════════════════════════════════════════════════════

export async function moderateReviewAction(
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
export async function reviewSubmissionAction(
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
  const name = submission.name.trim()

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
    typeof payload.lat === 'number' && typeof payload.lng === 'number' && payload.lat !== 0

  const [created] = await db
    .insert(placeTable)
    .values({
      slug,
      name,
      nameNormalized: normalizeFa(name),
      kind: (payload.kind ?? 'cafe') as 'cafe',
      // draft، نه published — دلیلش بالای تابع.
      status: 'draft',
      address: payload.address ?? '',
      districtId: payload.districtId ?? null,
      lat: hasCoords ? payload.lat!.toFixed(7) : null,
      lng: hasCoords ? payload.lng!.toFixed(7) : null,
      geoStatus: hasCoords ? 'ok' : 'missing',
      instagram: payload.instagram || null,
      about: payload.note || null,
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
export async function reviewSuggestionAction(
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

export async function setPlaceStatusAction(
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
    .limit(1)
  if (!before) return { ok: false, error: 'این مجموعه پیدا نشد.' }

  await db
    .update(placeTable)
    .set({ status: status as 'published' })
    .where(eq(placeTable.id, placeId))

  await recordAudit(guard.actor, 'place.status', 'place', placeId, before.status, status)
  // شمارش facet و محله فقط مکان‌های منتشرشده را می‌شمارد، پس کش باید بریزد.
  invalidateReferenceCache()
  revalidatePath(paths.cafe(before.slug))
  revalidatePath(paths.admin)

  return { ok: true, message: 'وضعیت عوض شد.' }
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
export async function setCredentialsAction(
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

  if (explicit && explicit.length < 8) {
    return { ok: false, error: 'رمز باید حداقل ۸ کاراکتر باشد.' }
  }

  const password = explicit || generatePassword(14)
  await setCredentials(userId, {
    username: username || target.username,
    passwordHash: hashPassword(password),
    // رمزِ ادمین‌ساخته همیشه موقت است؛ اگر خودِ ادمین رمز دلخواه گذاشته،
    // باز هم موقت است چون از یک کانال ناامن رد می‌شود.
    mustChangePassword: true,
  })

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
export async function createVenueAccountAction(
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
  if (username && (await isUsernameTaken(username))) {
    return { ok: false, error: 'این یوزرنیم گرفته شده است.' }
  }
  if (explicit && explicit.length < 8) {
    return { ok: false, error: 'رمز باید حداقل ۸ کاراکتر باشد.' }
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

  const password = explicit || generatePassword(14)

  // اگر شماره از قبل حساب دارد، حساب دوم ساخته نمی‌شود — همان حساب مالک
  // این کافه می‌شود. حساب تکراری با یک شماره، کاربر را از سابقه‌اش جدا می‌کند.
  const existing = phone ? await findUserByPhone(phone) : null

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

  if (existing) {
    await setCredentials(existing.id, {
      username: username || existing.username,
      passwordHash: hashPassword(password),
      mustChangePassword: true,
    })
  }

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
      ? `حساب موجود به «${place.name}» وصل شد و رمز تازه گرفت.`
      : `حساب برای «${place.name}» ساخته شد.`,
    credentials: { username: username || phone || user.id, password },
  }
}

// ═══════════════════════════════════════════════════════════════════════
// نقش، مسدودی، انتساب مکان
// ═══════════════════════════════════════════════════════════════════════

export async function setUserRoleAction(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const guard = await requireAdminActor()
  if (!guard.ok) return { ok: false, error: guard.error }

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

  await setUserRole(userId, role as 'owner')
  await recordAudit(guard.actor, 'user.role', 'app_user', userId, before.role, role)
  revalidatePath(paths.admin)
  return { ok: true, message: 'نقش عوض شد.' }
}

export async function setUserBlockedAction(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const guard = await requireAdminActor()
  if (!guard.ok) return { ok: false, error: guard.error }

  const userId = str(form, 'userId')
  const blocked = str(form, 'blocked') === '1'
  if (userId === guard.actor.userId) {
    return { ok: false, error: 'حساب خودتان را مسدود نکنید.' }
  }

  const before = await findUserById(userId)
  if (!before) return { ok: false, error: 'این حساب پیدا نشد.' }

  await setUserBlocked(userId, blocked)
  await recordAudit(guard.actor, blocked ? 'user.block' : 'user.unblock', 'app_user', userId, before.blocked, blocked)
  revalidatePath(paths.admin)
  return { ok: true, message: blocked ? 'حساب مسدود شد.' : 'مسدودی برداشته شد.' }
}

export async function assignPlaceAction(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const guard = await requireAdminActor()
  if (!guard.ok) return { ok: false, error: guard.error }

  const userId = str(form, 'userId')
  const placeId = num(form, 'placeId')
  const revoke = str(form, 'revoke') === '1'
  if (!userId || !placeId) return { ok: false, error: 'کاربر یا مجموعه مشخص نیست.' }

  if (revoke) {
    await revokePlaceRole(userId, placeId)
    await recordAudit(guard.actor, 'place.revoke', 'app_user', userId, placeId, null)
    revalidatePath(paths.admin)
    return { ok: true, message: 'دسترسی برداشته شد.' }
  }

  await grantPlaceRole(userId, placeId, { grantedByUserId: guard.actor.userId })
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
export async function saveSettingsAction(
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
          : 'بعضی مقادیر ذخیره نشدند — پیام هر فیلد را ببینید.',
      fieldErrors: Object.fromEntries(result.errors.map((item) => [item.key, item.message])),
    }
  }

  // تنظیمات روی متادیتا، هدر و همه‌ی صفحه‌ها اثر دارند.
  revalidatePath('/', 'layout')

  return {
    ok: true,
    message:
      result.saved.length === 0
        ? 'چیزی تغییر نکرده بود.'
        : `${result.saved.length} تنظیم ذخیره شد.`,
    savedKeys: result.saved,
  }
}

/** برگرداندن یک گروه به پیش‌فرض‌های کد. */
export async function resetSettingsAction(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const guard = await requireAdminActor()
  if (!guard.ok) return { ok: false, error: guard.error }

  const group = str(form, 'group')
  const keys = SETTING_DEFS.filter((def) => def.group === group).map((def) => def.key)
  if (keys.length === 0) return { ok: false, error: 'گروه ناشناس.' }

  await resetSettings(keys, { userId: guard.actor.userId, label: guard.actor.label })
  revalidatePath('/', 'layout')
  return { ok: true, message: 'به پیش‌فرض برگشت.' }
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
