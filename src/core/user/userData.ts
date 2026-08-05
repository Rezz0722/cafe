import 'server-only'

/**
 * داده‌ی کاربر: سلیقه، ذخیره‌ها، نظرها، ثبت کافه.
 *
 * همه‌ی نوشتن‌های سمت کاربر از اینجا رد می‌شوند تا قواعد مشترک یک‌جا بمانند:
 * «یک نظر برای هر کافه از هر کاربر»، «نظر تا تأیید منتشر نمی‌شود»،
 * «امتیاز مکان فقط از نظرهای تأییدشده حساب می‌شود».
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import {
  media as mediaTable,
  place as placeTable,
  placeDish as placeDishTable,
  placeFacet as placeFacetTable,
  placeSubmission,
  review as reviewTable,
  savedPlace,
  userPreference,
  userTasteProfile,
} from '@/db/schema'
import { dish as dishTable } from '@/db/schema'
import { invalidateSiteMean, type PlaceCard } from '@/core/places/queries'
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
      logoPath: mediaTable.localPath,
      savedAt: savedPlace.createdAt,
    })
    .from(savedPlace)
    .innerJoin(placeTable, eq(placeTable.id, savedPlace.placeId))
    .leftJoin(mediaTable, eq(mediaTable.id, placeTable.logoMediaId))
    .where(eq(savedPlace.userId, userId))
    .orderBy(desc(savedPlace.createdAt))

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    districtName: row.districtId,
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
}

/** رشته‌ی تاریخ فرم → `Date` که ستون `DATE` می‌پذیرد. */
function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export type SubmitReviewResult =
  | { ok: true; status: 'pending' }
  | { ok: false; error: string }

/**
 * ثبت نظر.
 *
 * ═══ چرا `pending` و نه انتشار فوری ═══
 *
 * نظر منتشرنشده به کسی آسیب نمی‌زند؛ نظر توهین‌آمیزِ منتشرشده به کافه‌دار
 * آسیب می‌زند و اعتبار سایت را می‌برد. صف تأیید در پنل ادمین است.
 *
 * ═══ چرا یک نظر برای هر کافه ═══
 *
 * بدون این قاعده، یک نفر می‌تواند ده نظر پنج‌ستاره بگذارد و رتبه‌بندی را
 * بی‌معنی کند. ویرایش نظر قبلی جایگزین ثبت دوباره است.
 */
export async function submitReview(input: ReviewInput): Promise<SubmitReviewResult> {
  if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) {
    return { ok: false, error: 'امتیاز باید بین ۱ تا ۵ ستاره باشد.' }
  }

  const db = getDb()
  const [existing] = await db
    .select({ id: reviewTable.id, status: reviewTable.status })
    .from(reviewTable)
    .where(and(eq(reviewTable.placeId, input.placeId), eq(reviewTable.userId, input.userId)))
    .limit(1)

  const values = {
    placeId: input.placeId,
    userId: input.userId,
    authorName: input.authorName.slice(0, 120),
    stars: input.stars,
    text: input.text?.slice(0, 4000) || null,
    ratingCoffee: input.ratingCoffee ?? null,
    ratingFood: input.ratingFood ?? null,
    ratingVibe: input.ratingVibe ?? null,
    ratingService: input.ratingService ?? null,
    ratingValue: input.ratingValue ?? null,
    visitDate: toDateOrNull(input.visitDate),
    status: 'pending' as const,
  }

  if (existing) {
    await db.update(reviewTable).set(values).where(eq(reviewTable.id, existing.id))
    // نظری که قبلاً تأیید شده بود و حالا ویرایش شد، باید دوباره تأیید شود.
    // اگر امتیاز مکان از آن نظر ساخته شده بود، باید از رول‌آپ کم شود.
    if (existing.status === 'approved') await recalcPlaceRating(input.placeId)
    return { ok: true, status: 'pending' }
  }

  await db.insert(reviewTable).values(values)
  return { ok: true, status: 'pending' }
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
  return rows
}

/** نظر همین کاربر برای همین کافه — برای پیش‌پرکردن فرم. */
export async function getMyReviewFor(
  userId: string,
  placeId: number,
): Promise<{ stars: number; text: string | null; status: string } | null> {
  const db = getDb()
  const [row] = await db
    .select({ stars: reviewTable.stars, text: reviewTable.text, status: reviewTable.status })
    .from(reviewTable)
    .where(and(eq(reviewTable.userId, userId), eq(reviewTable.placeId, placeId)))
    .limit(1)
  return row ?? null
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
  const name = input.name.trim()
  if (name.length < 2) return { ok: false, error: 'نام مجموعه را کامل بنویسید.' }

  const db = getDb()

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
      address: input.address?.trim() ?? '',
      districtId: input.districtId ?? null,
      phone: input.phone?.trim() ?? '',
      instagram: input.instagram?.trim() ?? '',
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      kind: input.kind ?? 'cafe',
      note: input.note?.trim() ?? '',
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

  const dishRows = await db
    .select({ placeId: placeDishTable.placeId, slug: dishTable.slug })
    .from(placeDishTable)
    .innerJoin(dishTable, eq(dishTable.id, placeDishTable.dishId))
    .where(inArray(placeDishTable.placeId, ids))

  const byPlace = new Map<number, string[]>()
  for (const row of dishRows) {
    const list = byPlace.get(row.placeId)
    if (list) list.push(row.slug)
    else byPlace.set(row.placeId, [row.slug])
  }

  return cards.map((card) => ({
    ...card,
    dishSlugs: byPlace.get(card.id) ?? [],
    // ویژگی‌ها (دنج، پریز، …) هنوز از منبع نیامده‌اند؛ خالی می‌مانند تا
    // بازدید میدانی یا کافه‌دار پرشان کند. وزنِ رویشان بی‌اثر می‌ماند،
    // نه اینکه غلط اثر کند.
    attributeIds: [],
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
