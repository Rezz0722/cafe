import 'server-only'

/**
 * داده‌ی کاربر: سلیقه، ذخیره‌ها، نظرها، ثبت کافه.
 *
 * همه‌ی نوشتن‌های سمت کاربر از اینجا رد می‌شوند تا قواعد مشترک یک‌جا بمانند:
 * «یک نظر برای هر کافه از هر کاربر»، «نظر تا تأیید منتشر نمی‌شود»،
 * «امتیاز مکان فقط از نظرهای تأییدشده حساب می‌شود».
 */

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import {
  media as mediaTable,
  district as districtTable,
  place as placeTable,
  placeAttribute as placeAttributeTable,
  placeDish as placeDishTable,
  placeFacet as placeFacetTable,
  placeSubmission,
  menuItem as menuItemTable,
  menuSection as menuSectionTable,
  review as reviewTable,
  reviewItem as reviewItemTable,
  savedPlace,
  userPreference,
  userTasteProfile,
} from '@/db/schema'
import { dish as dishTable } from '@/db/schema'
import { invalidateSiteMean, type PlaceCard } from '@/core/places/queries'
import { parseVisitDate } from '@/core/date/persian'
import { cleanUserText, normalizeInstagram, normalizeInstagramContentUrl } from '@/core/security/input'
import {
  computeTaste,
  QUIZ_VERSION,
  type QuizAnswers,
  type Weight,
} from '@/core/taste/quiz'

// ═══════════════════════════════════════════════════════════════════════
// پروفایل سلیقه
// ═══════════════════════════════════════════════════════════════════════

export interface TasteProfile {
  answers: QuizAnswers
  weights: Weight[]
  budgetBand: 1 | 2 | 3 | null
  completedAt: Date | null
}

export async function getTasteProfile(userId: string): Promise<TasteProfile | null> {
  const db = getDb()
  const [row] = await db
    .select()
    .from(userTasteProfile)
    .where(eq(userTasteProfile.userId, userId))
    .limit(1)
  if (!row) return null

  const prefs = await db
    .select()
    .from(userPreference)
    .where(eq(userPreference.userId, userId))

  return {
    answers: (row.answers as QuizAnswers | null) ?? {},
    weights: prefs.map((pref) => ({
      kind: pref.kind,
      refId: pref.refId,
      weight: pref.weight,
    })),
    budgetBand: (row.budgetBand as 1 | 2 | 3 | null) ?? null,
    completedAt: row.completedAt,
  }
}

/**
 * ذخیره‌ی پاسخ‌ها **و** وزن‌های مشتق.
 *
 * هر دو ذخیره می‌شوند چون کارِ متفاوتی می‌کنند: وزن‌ها برای رتبه‌بندی لازم‌اند
 * (سریع، بدون محاسبه‌ی دوباره)، و پاسخ‌های خام برای وقتی که الگوریتم عوض شود
 * و بخواهیم وزن‌ها را از نو بسازیم بدون پرسیدن دوباره از کاربر.
 *
 * وزن‌های قبلیِ منشأ `quiz` پاک می‌شوند ولی وزن‌های `behavior` و `explicit`
 * دست‌نخورده می‌مانند — آن‌ها از رفتار کاربر آمده‌اند، نه از این فرم.
 */
export async function saveTasteProfile(userId: string, answers: QuizAnswers): Promise<void> {
  const db = getDb()
  const { weights, budgetBand } = computeTaste(answers)
  const now = new Date()

  await db
    .insert(userTasteProfile)
    .values({
      userId,
      answers,
      budgetBand: budgetBand ?? null,
      version: QUIZ_VERSION,
      completedAt: now,
    })
    .onDuplicateKeyUpdate({
      set: { answers, budgetBand: budgetBand ?? null, version: QUIZ_VERSION, completedAt: now },
    })

  await db
    .delete(userPreference)
    .where(and(eq(userPreference.userId, userId), eq(userPreference.source, 'quiz')))

  if (weights.length > 0) {
    await db.insert(userPreference).values(
      weights.map((weight) => ({
        userId,
        kind: weight.kind,
        refId: weight.refId,
        weight: weight.weight,
        source: 'quiz' as const,
      })),
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ذخیره‌ی کافه
// ═══════════════════════════════════════════════════════════════════════

export async function toggleSavedPlace(userId: string, placeId: number): Promise<boolean> {
  const db = getDb()
  const [existing] = await db
    .select({ placeId: savedPlace.placeId })
    .from(savedPlace)
    .where(and(eq(savedPlace.userId, userId), eq(savedPlace.placeId, placeId)))
    .limit(1)

  if (existing) {
    await db
      .delete(savedPlace)
      .where(and(eq(savedPlace.userId, userId), eq(savedPlace.placeId, placeId)))
    return false
  }
  await db.insert(savedPlace).values({ userId, placeId })
  return true
}

export async function listSavedPlaceIds(userId: string): Promise<number[]> {
  const db = getDb()
  const rows = await db
    .select({ placeId: savedPlace.placeId })
    .from(savedPlace)
    .where(eq(savedPlace.userId, userId))
  return rows.map((row) => row.placeId)
}

export interface SavedCard {
  id: number
  slug: string
  name: string
  districtName: string | null
  priceMedian: number | null
  priceTier: number
  logoUrl: string | null
  savedAt: Date
}

export async function listSavedPlaces(userId: string): Promise<SavedCard[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: placeTable.id,
      slug: placeTable.slug,
      name: placeTable.name,
      priceMedian: placeTable.priceMedian,
      priceTier: placeTable.priceTier,
      districtId: placeTable.districtId,
      districtName: districtTable.name,
      logoPath: mediaTable.localPath,
      savedAt: savedPlace.createdAt,
    })
    .from(savedPlace)
    .innerJoin(placeTable, eq(placeTable.id, savedPlace.placeId))
    .leftJoin(mediaTable, eq(mediaTable.id, placeTable.logoMediaId))
    .leftJoin(districtTable, eq(districtTable.id, placeTable.districtId))
    .where(eq(savedPlace.userId, userId))
    .orderBy(desc(savedPlace.createdAt))

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    districtName: row.districtName,
    priceMedian: row.priceMedian,
    priceTier: row.priceTier,
    logoUrl: row.logoPath ? `/${row.logoPath}` : null,
    savedAt: row.savedAt,
  }))
}

// ═══════════════════════════════════════════════════════════════════════
// نظر
// ═══════════════════════════════════════════════════════════════════════

export interface ReviewInput {
  placeId: number
  userId: string
  authorName: string
  stars: number
  text?: string | null
  ratingCoffee?: number | null
  ratingFood?: number | null
  ratingVibe?: number | null
  ratingService?: number | null
  ratingValue?: number | null
  /** «YYYY-MM-DD» — ستون `DATE` است، پس به `Date` تبدیل می‌شود. */
  visitDate?: string | null
  menuItemIds?: number[]
  /** فقط برای ویرایش نظر مشخص‌شده؛ نبودن آن یعنی ثبت نظر جدید. */
  reviewId?: number | null
  isBlogger?: boolean
  videoUrl?: string | null
}

/** رشته‌ی تاریخ فرم → `Date` که ستون `DATE` می‌پذیرد. */
function toDateOrNull(value: string | null | undefined): Date | null {
  const iso = parseVisitDate(value)
  return iso ? new Date(`${iso}T00:00:00Z`) : null
}

export type SubmitReviewResult =
  | { ok: true; status: 'pending' | 'approved' }
  | { ok: false; error: string }

/**
 * سیاست بازبینی — از تنظیمات پنل ادمین.
 *
 * پیش‌فرض‌ها **محافظه‌کارانه**اند: اگر جدول تنظیمات خوانده نشد، نظرها به صف
 * بازبینی می‌روند نه به صفحه‌ی کافه. خطای خواندن تنظیمات نباید در انتشارِ
 * بی‌بازبینی ترجمه شود.
 */
export interface ReviewModeration {
  requireApproval: boolean
  minTextLength: number
  maxTextLength: number
  /** واژه‌های ممنوعِ کوچک‌شده — حضورشان نظر را در صف نگه می‌دارد. */
  blocklist: string[]
}

const DEFAULT_REVIEW_MODERATION: ReviewModeration = {
  requireApproval: true,
  minTextLength: 0,
  maxTextLength: 4000,
  blocklist: [],
}

/**
 * ثبت نظر.
 *
 * ═══ چرا `pending` و نه انتشار فوری ═══
 *
 * نظر منتشرنشده به کسی آسیب نمی‌زند؛ نظر توهین‌آمیزِ منتشرشده به کافه‌دار
 * آسیب می‌زند و اعتبار سایت را می‌برد. صف تأیید در پنل ادمین است.
 *
 * ═══ چرا ویرایشِ نظر مشخص است ═══
 *
 * هر مراجعه می‌تواند تجربهٔ جداگانه‌ای باشد، پس کاربر محدود به یک نظر نیست.
 * فقط وقتی شناسهٔ نظر قبلی صریحاً ارسال شود همان نظر ویرایش می‌شود؛ ثبت عادی
 * همیشه یک نظر جدید می‌سازد.
 */
export async function submitReview(
  input: ReviewInput,
  moderation: ReviewModeration = DEFAULT_REVIEW_MODERATION,
): Promise<SubmitReviewResult> {
  if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) {
    return { ok: false, error: 'امتیاز باید بین ۱ تا ۵ ستاره باشد.' }
  }

  const subRatings = [
    input.ratingCoffee,
    input.ratingFood,
    input.ratingVibe,
    input.ratingService,
    input.ratingValue,
  ]
  if (subRatings.some((value) => value !== null && value !== undefined && (!Number.isInteger(value) || value < 1 || value > 5))) {
    return { ok: false, error: 'همهٔ امتیازها باید بین ۱ تا ۵ باشند.' }
  }

  if (input.visitDate && !parseVisitDate(input.visitDate)) {
    return { ok: false, error: 'تاریخ مراجعه معتبر نیست؛ نمونه: ۱۴۰۵/۰۶/۲۱' }
  }

  const text = cleanUserText(input.text, moderation.maxTextLength)
  const rawVideoUrl = cleanUserText(input.videoUrl, 500)
  const videoUrl = input.isBlogger ? normalizeInstagramContentUrl(rawVideoUrl) : null
  if (rawVideoUrl && !input.isBlogger) return { ok: false, error: 'ثبت لینک بررسی فقط برای بلاگر تأییدشده فعال است.' }
  if (rawVideoUrl && !videoUrl) return { ok: false, error: 'لینک باید متعلق به یک پست یا Reel معتبر اینستاگرام باشد.' }
  if (moderation.minTextLength > 0 && text.length < moderation.minTextLength) {
    return {
      ok: false,
      error: `متن نظر باید حداقل ${moderation.minTextLength} کاراکتر باشد.`,
    }
  }

  /*
    واژه‌ی ممنوع نظر را **رد نمی‌کند**، در صف نگه می‌دارد. رد کردن یعنی به
    نویسنده می‌گوییم کدام واژه فیلتر است و او دور می‌زند؛ نگه‌داشتن در صف
    یعنی یک انسان می‌بیند و تصمیم می‌گیرد.
  */
  const haystack = `${text} ${input.authorName}`.toLowerCase()
  const flagged = moderation.blocklist.some((word) => word && haystack.includes(word))
  const status: 'pending' | 'approved' =
    moderation.requireApproval || flagged ? 'pending' : 'approved'

  const db = getDb()
  const [target] = await db
    .select({ id: placeTable.id })
    .from(placeTable)
    .where(eq(placeTable.id, input.placeId))
    .limit(1)
  if (!target) return { ok: false, error: 'این مجموعه پیدا نشد.' }
  const requestedItemIds = [...new Set((input.menuItemIds ?? []).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 20)
  if (requestedItemIds.length > 0) {
    const validItems = await db.select({ id: menuItemTable.id })
      .from(menuItemTable).innerJoin(menuSectionTable, eq(menuSectionTable.id, menuItemTable.sectionId))
      .where(and(eq(menuItemTable.placeId, input.placeId), inArray(menuItemTable.id, requestedItemIds), isNull(menuItemTable.archivedAt), inArray(menuSectionTable.branchScope, ['shared', 'branch'])))
    if (validItems.length !== requestedItemIds.length) return { ok: false, error: 'یکی از آیتم‌های انتخاب‌شده متعلق به این کافه نیست.' }
  }
  const existing = input.reviewId
    ? (await db.select({ id: reviewTable.id, status: reviewTable.status })
      .from(reviewTable)
      .where(and(eq(reviewTable.id, input.reviewId), eq(reviewTable.placeId, input.placeId), eq(reviewTable.userId, input.userId)))
      .limit(1))[0]
    : undefined
  if (input.reviewId && !existing) return { ok: false, error: 'نظر انتخاب‌شده برای ویرایش پیدا نشد.' }

  const values = {
    placeId: input.placeId,
    userId: input.userId,
    authorName: cleanUserText(input.authorName, 120) || 'کاربر کو کافه',
    stars: input.stars,
    text: text.slice(0, moderation.maxTextLength) || null,
    ratingCoffee: input.ratingCoffee ?? null,
    ratingFood: input.ratingFood ?? null,
    ratingVibe: input.ratingVibe ?? null,
    ratingService: input.ratingService ?? null,
    ratingValue: input.ratingValue ?? null,
    visitDate: toDateOrNull(input.visitDate),
    isBloggerReview: Boolean(input.isBlogger),
    videoUrl,
    status,
  }

  if (existing) {
    await db.transaction(async (tx) => {
      await tx.update(reviewTable).set(values).where(eq(reviewTable.id, existing.id))
      await tx.delete(reviewItemTable).where(eq(reviewItemTable.reviewId, existing.id))
      if (requestedItemIds.length > 0) await tx.insert(reviewItemTable).values(requestedItemIds.map((menuItemId) => ({ reviewId: existing.id, menuItemId })))
    })
    /*
      رول‌آپ امتیاز باید بازمحاسبه شود اگر وضعیتِ **قبلی یا جدید** تأییدشده
      باشد: نظرِ تأییدشده‌ای که به صف برگشت باید از میانگین کم شود، و نظری
      که تازه تأیید خودکار گرفت باید اضافه شود.
    */
    if (existing.status === 'approved' || status === 'approved') {
      await recalcPlaceRating(input.placeId)
    }
    return { ok: true, status }
  }

  await db.transaction(async (tx) => {
    const result = await tx.insert(reviewTable).values(values)
    const reviewId = Number(result[0]?.insertId)
    if (reviewId && requestedItemIds.length > 0) await tx.insert(reviewItemTable).values(requestedItemIds.map((menuItemId) => ({ reviewId, menuItemId })))
    return reviewId
  })
  if (status === 'approved') await recalcPlaceRating(input.placeId)
  return { ok: true, status }
}

/**
 * بازمحاسبه‌ی امتیاز یک مکان از نظرهای **تأییدشده**.
 *
 * `rating_sum` و `rating_count` روی ردیف مکان کش می‌شوند تا فهرست و
 * مرتب‌سازی به join با جدول نظر نیاز نداشته باشند. این تابع تنها جایی است که
 * آن‌ها را می‌نویسد، پس هیچ‌وقت از واقعیت جدا نمی‌افتند.
 */
export async function recalcPlaceRating(placeId: number): Promise<void> {
  const db = getDb()
  await db.execute(sql`
    UPDATE place p
    SET
      rating_sum = (
        SELECT COALESCE(SUM(stars), 0) FROM review
        WHERE review.place_id = p.id AND review.status = 'approved'
      ),
      rating_count = (
        SELECT COUNT(*) FROM review
        WHERE review.place_id = p.id AND review.status = 'approved'
      )
    WHERE p.id = ${placeId}
  `)
  invalidateSiteMean()
}

export interface MyReview {
  id: number
  placeId: number
  placeSlug: string
  placeName: string
  stars: number
  text: string | null
  status: string
  rejectReason: string | null
  createdAt: Date
  itemIds: number[]
  itemNames: string[]
}

export async function listMyReviews(userId: string): Promise<MyReview[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: reviewTable.id,
      placeId: reviewTable.placeId,
      placeSlug: placeTable.slug,
      placeName: placeTable.name,
      stars: reviewTable.stars,
      text: reviewTable.text,
      status: reviewTable.status,
      rejectReason: reviewTable.rejectReason,
      createdAt: reviewTable.createdAt,
    })
    .from(reviewTable)
    .innerJoin(placeTable, eq(placeTable.id, reviewTable.placeId))
    .where(eq(reviewTable.userId, userId))
    .orderBy(desc(reviewTable.createdAt))
  if (rows.length === 0) return []
  const itemRows = await db.select({ reviewId: reviewItemTable.reviewId, menuItemId: reviewItemTable.menuItemId, name: menuItemTable.name })
    .from(reviewItemTable).innerJoin(menuItemTable, eq(menuItemTable.id, reviewItemTable.menuItemId))
    .where(inArray(reviewItemTable.reviewId, rows.map((row) => row.id)))
  const itemsByReview = new Map<number, { id: number; name: string }[]>()
  for (const row of itemRows) itemsByReview.set(row.reviewId, [...(itemsByReview.get(row.reviewId) ?? []), { id: row.menuItemId, name: row.name }])
  return rows.map((row) => ({ ...row, itemIds: itemsByReview.get(row.id)?.map((item) => item.id) ?? [], itemNames: itemsByReview.get(row.id)?.map((item) => item.name) ?? [] }))
}

/** نظر همین کاربر برای همین کافه — برای پیش‌پرکردن فرم. */
export async function getMyReviewFor(
  userId: string,
  placeId: number,
): Promise<{ id: number; stars: number; text: string | null; status: string; visitDate: Date | null; itemIds: number[]; videoUrl: string | null; ratingCoffee: number | null; ratingFood: number | null; ratingVibe: number | null; ratingService: number | null; ratingValue: number | null } | null> {
  const db = getDb()
  const [row] = await db
    .select({
      id: reviewTable.id,
      stars: reviewTable.stars,
      text: reviewTable.text,
      status: reviewTable.status,
      visitDate: reviewTable.visitDate,
      videoUrl: reviewTable.videoUrl,
      ratingCoffee: reviewTable.ratingCoffee,
      ratingFood: reviewTable.ratingFood,
      ratingVibe: reviewTable.ratingVibe,
      ratingService: reviewTable.ratingService,
      ratingValue: reviewTable.ratingValue,
    })
    .from(reviewTable)
    .where(and(eq(reviewTable.userId, userId), eq(reviewTable.placeId, placeId)))
    .orderBy(desc(reviewTable.createdAt), desc(reviewTable.id))
    .limit(1)
  if (!row) return null
  const itemRows = await db.select({ menuItemId: reviewItemTable.menuItemId }).from(reviewItemTable).where(eq(reviewItemTable.reviewId, row.id))
  return { ...row, itemIds: itemRows.map((item) => item.menuItemId) }
}

export interface ReviewableMenuItem {
  id: number
  name: string
  nameEn: string | null
  sectionId: number
  sectionName: string
  dishName: string | null
  available: boolean
}

export async function listReviewableMenuItems(placeId: number): Promise<ReviewableMenuItem[]> {
  return getDb().select({
    id: menuItemTable.id,
    name: menuItemTable.name,
    nameEn: menuItemTable.nameEn,
    sectionId: menuSectionTable.id,
    sectionName: menuSectionTable.name,
    dishName: dishTable.nameFa,
    available: menuItemTable.available,
  }).from(menuItemTable)
    .innerJoin(menuSectionTable, eq(menuSectionTable.id, menuItemTable.sectionId))
    .leftJoin(dishTable, eq(dishTable.id, menuItemTable.dishId))
    .where(and(eq(menuItemTable.placeId, placeId), isNull(menuItemTable.archivedAt), inArray(menuSectionTable.branchScope, ['shared', 'branch'])))
    .orderBy(menuSectionTable.sortOrder, menuItemTable.sortOrder, menuItemTable.id)
}

// ═══════════════════════════════════════════════════════════════════════
// ثبت کافه‌ی جدید توسط کاربر
// ═══════════════════════════════════════════════════════════════════════

export interface PlaceSubmissionInput {
  userId: string
  name: string
  address?: string
  districtId?: string | null
  phone?: string
  instagram?: string
  lat?: number | null
  lng?: number | null
  kind?: string
  note?: string
}

export async function submitPlace(input: PlaceSubmissionInput): Promise<{ ok: boolean; error?: string }> {
  const name = cleanUserText(input.name, 200)
  if (name.length < 2) return { ok: false, error: 'نام مجموعه را کامل بنویسید.' }

  const kinds = new Set(['cafe', 'cafe_restaurant', 'restaurant', 'bakery', 'lounge', 'shop'])
  const kind = kinds.has(input.kind ?? '') ? input.kind! : 'cafe'
  if ((input.lat === null || input.lat === undefined) !== (input.lng === null || input.lng === undefined)) {
    return { ok: false, error: 'عرض و طول جغرافیایی را با هم وارد کنید.' }
  }
  if (input.lat !== null && input.lat !== undefined && (
    !Number.isFinite(input.lat) || !Number.isFinite(input.lng) ||
    input.lat < -90 || input.lat > 90 || input.lng! < -180 || input.lng! > 180
  )) return { ok: false, error: 'مختصات معتبر نیست.' }

  const instagram = normalizeInstagram(input.instagram)
  if (input.instagram?.trim() && !instagram) {
    return { ok: false, error: 'آدرس یا نام کاربری اینستاگرام معتبر نیست.' }
  }

  const db = getDb()
  if (input.districtId) {
    const [district] = await db
      .select({ id: districtTable.id })
      .from(districtTable)
      .where(eq(districtTable.id, input.districtId))
      .limit(1)
    if (!district) return { ok: false, error: 'محله معتبر نیست.' }
  }

  // ── تکراری؟ نامِ نرمال‌شده را با مکان‌های موجود مقایسه می‌کنیم.
  // نه برای رد کردن، بلکه برای اینکه ادمین در صف بداند احتمال تکراری هست.
  const [similar] = await db
    .select({ id: placeTable.id, name: placeTable.name })
    .from(placeTable)
    .where(sql`${placeTable.name} = ${name}`)
    .limit(1)

  await db.insert(placeSubmission).values({
    userId: input.userId,
    name,
    payload: {
      address: cleanUserText(input.address, 500),
      districtId: input.districtId ?? null,
      phone: cleanUserText(input.phone, 80),
      instagram: instagram ?? '',
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      kind,
      note: cleanUserText(input.note, 2_000),
      possibleDuplicateOf: similar?.id ?? null,
    },
    status: similar ? 'duplicate' : 'pending',
    note: similar ? `احتمال تکراری با «${similar.name}»` : null,
  })

  return { ok: true }
}

export interface MySubmission {
  id: number
  name: string
  status: string
  note: string | null
  createdAt: Date
  placeSlug: string | null
}

export async function listMySubmissions(userId: string): Promise<MySubmission[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: placeSubmission.id,
      name: placeSubmission.name,
      status: placeSubmission.status,
      note: placeSubmission.note,
      createdAt: placeSubmission.createdAt,
      placeSlug: placeTable.slug,
    })
    .from(placeSubmission)
    .leftJoin(placeTable, eq(placeTable.id, placeSubmission.placeId))
    .where(eq(placeSubmission.userId, userId))
    .orderBy(desc(placeSubmission.createdAt))
  return rows
}

// ═══════════════════════════════════════════════════════════════════════
// پیشنهاد شخصی
// ═══════════════════════════════════════════════════════════════════════

export interface RecommendationCandidate extends PlaceCard {
  dishSlugs: string[]
  attributeIds: string[]
}

/**
 * کاندیدهای پیشنهاد — کارت به‌علاوه‌ی دیش و ویژگی.
 *
 * facet از قبل در `PlaceCard` است. دیش‌ها جدا خوانده می‌شوند چون فقط همین‌جا
 * لازم‌اند و اضافه‌کردنشان به `PlaceCard` هر فهرست دیگری را سنگین می‌کرد.
 */
export async function loadRecommendationCandidates(
  cards: PlaceCard[],
): Promise<RecommendationCandidate[]> {
  if (cards.length === 0) return []
  const db = getDb()
  const ids = cards.map((card) => card.id)

  const [dishRows, attributeRows] = await Promise.all([
    db
      .select({ placeId: placeDishTable.placeId, slug: dishTable.slug })
      .from(placeDishTable)
      .innerJoin(dishTable, eq(dishTable.id, placeDishTable.dishId))
      .where(inArray(placeDishTable.placeId, ids)),
    db
      .select({
        placeId: placeAttributeTable.placeId,
        attributeId: placeAttributeTable.attributeId,
      })
      .from(placeAttributeTable)
      .where(
        and(
          inArray(placeAttributeTable.placeId, ids),
          sql`${placeAttributeTable.value} >= 1`,
        ),
      ),
  ])

  const byPlace = new Map<number, string[]>()
  for (const row of dishRows) {
    const list = byPlace.get(row.placeId)
    if (list) list.push(row.slug)
    else byPlace.set(row.placeId, [row.slug])
  }

  const attributesByPlace = new Map<number, string[]>()
  for (const row of attributeRows) {
    const list = attributesByPlace.get(row.placeId)
    if (list) list.push(row.attributeId)
    else attributesByPlace.set(row.placeId, [row.attributeId])
  }

  return cards.map((card) => ({
    ...card,
    dishSlugs: byPlace.get(card.id) ?? [],
    attributeIds: attributesByPlace.get(card.id) ?? [],
  }))
}

/** برچسب خواندنی برای دلایل پیشنهاد. */
export async function loadRecommendationLabels(): Promise<Record<string, string>> {
  const db = getDb()
  const [facets, dishes] = await Promise.all([
    db.select({ id: placeFacetTable.facetId }).from(placeFacetTable).groupBy(placeFacetTable.facetId),
    db.select({ slug: dishTable.slug, nameFa: dishTable.nameFa }).from(dishTable),
  ])

  const labels: Record<string, string> = {}
  const { FACET_BY_ID } = await import('@/core/taxonomy/menuTaxonomy')
  for (const facet of facets) {
    const def = FACET_BY_ID.get(facet.id)
    if (def) labels[`facet:${facet.id}`] = def.labelFa
  }
  for (const dish of dishes) {
    labels[`dish:${dish.slug}`] = dish.nameFa
  }
  return labels
}
