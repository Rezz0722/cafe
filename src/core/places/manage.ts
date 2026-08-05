import 'server-only'

/**
 * نوشتن روی مکان — پنل کافه‌دار و پنل ادمین.
 *
 * ═══ چرا همه‌ی نوشتن‌ها از یک فایل ═══
 *
 * هر تغییری روی یک مکان باید سه چیز را با هم انجام بدهد: نوشتن داده،
 * بازمحاسبه‌ی مقادیر مشتق (رده‌ی قیمت، امتیاز کیفیت)، و ثبت رد پا در
 * `audit_log`. اگر هر صفحه‌ای خودش بنویسد، یکی از این سه فراموش می‌شود و
 * بعداً معلوم نیست چرا رده‌ی قیمت با منو نمی‌خواند.
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import {
  auditLog,
  media as mediaTable,
  menuItem as menuItemTable,
  menuSection as menuSectionTable,
  place as placeTable,
  placeHours as placeHoursTable,
  placePhone as placePhoneTable,
  placeSocial as placeSocialTable,
  review as reviewTable,
  reviewReply,
} from '@/db/schema'
import { computeQualityFromFacts } from '@/core/quality/scores'
import { classifyGeo, median, parsePhones, priceTierFromMedian } from '@/core/import/normalize'
import { normalizeFa } from '@/core/text/normalize'

// ═══════════════════════════════════════════════════════════════════════
// رد پا
// ═══════════════════════════════════════════════════════════════════════

export interface Actor {
  userId: string
  label: string
  /** اگر ادمین در حالت «مشاهده به‌عنوان» باشد، شناسه‌ی خودش. */
  onBehalfOf?: string | null
}

/**
 * ثبت در `audit_log`.
 *
 * `before` و `after` هر دو ذخیره می‌شوند چون برگرداندن یک تغییر اشتباه بدون
 * دانستن مقدار قبلی ممکن نیست — و این تنها چیزی است که یک ویرایشِ خراب را
 * قابل بازگشت می‌کند.
 */
export async function recordAudit(
  actor: Actor,
  action: string,
  entity: string,
  entityId: string | number,
  before: unknown,
  after: unknown,
): Promise<void> {
  const db = getDb()
  await db.insert(auditLog).values({
    actorUserId: actor.userId,
    actorLabel: actor.onBehalfOf ? `${actor.label} (به‌جای ${actor.onBehalfOf})` : actor.label,
    action,
    entity,
    entityId: String(entityId),
    before: before ?? null,
    after: after ?? null,
  })
}

// ═══════════════════════════════════════════════════════════════════════
// بازمحاسبه‌ی مقادیر مشتق
// ═══════════════════════════════════════════════════════════════════════

/**
 * قیمت‌های مکان و امتیاز کیفیتش را از نو حساب می‌کند.
 *
 * بعد از **هر** تغییر منو یا اطلاعات پایه صدا زده می‌شود. بدونش، کافه‌داری که
 * قیمت‌هایش را دو برابر می‌کند در فیلتر «اقتصادی» باقی می‌ماند.
 */
export async function refreshPlaceDerived(placeId: number): Promise<void> {
  const db = getDb()

  const priceRows = await db
    .select({ price: menuItemTable.price })
    .from(menuItemTable)
    .where(and(eq(menuItemTable.placeId, placeId), sql`${menuItemTable.price} IS NOT NULL`))
  const prices = priceRows
    .map((row) => row.price)
    .filter((price): price is number => price !== null)

  const [place] = await db.select().from(placeTable).where(eq(placeTable.id, placeId)).limit(1)
  if (!place) return

  const [{ phones = 0 } = { phones: 0 }] = await db
    .select({ phones: sql<number>`COUNT(*)` })
    .from(placePhoneTable)
    .where(eq(placePhoneTable.placeId, placeId))

  const [{ openShifts = 0 } = { openShifts: 0 }] = await db
    .select({ openShifts: sql<number>`SUM(closed = 0)` })
    .from(placeHoursTable)
    .where(eq(placeHoursTable.placeId, placeId))

  const [{ items = 0 } = { items: 0 }] = await db
    .select({ items: sql<number>`COUNT(*)` })
    .from(menuItemTable)
    .where(eq(menuItemTable.placeId, placeId))

  const priceMedian = median(prices)

  await db
    .update(placeTable)
    .set({
      priceMin: prices.length ? Math.min(...prices) : null,
      priceMedian,
      priceMax: prices.length ? Math.max(...prices) : null,
      priceTier: priceTierFromMedian(priceMedian),
      qualityScore: computeQualityFromFacts({
        hasCoords: place.geoStatus !== 'missing',
        hasHours: Number(openShifts) > 0,
        hasAddress: !!place.address?.trim(),
        hasPhone: Number(phones) > 0,
        hasInstagram: !!place.instagram,
        hasDescription: !!place.about?.trim(),
        hasMenu: Number(items) > 0,
        photoCount: place.logoMediaId ? 1 : 0,
        attributeCount: 0,
      }),
    })
    .where(eq(placeTable.id, placeId))
}

// ═══════════════════════════════════════════════════════════════════════
// اطلاعات پایه
// ═══════════════════════════════════════════════════════════════════════

export interface PlaceInfoPatch {
  name?: string
  nameEn?: string | null
  about?: string | null
  address?: string
  instagram?: string | null
  lat?: number | null
  lng?: number | null
  /** رشته‌ی شماره‌ها، همان شکلی که کاربر می‌نویسد. تجزیه اینجا انجام می‌شود. */
  phonesRaw?: string
}

export async function updatePlaceInfo(
  placeId: number,
  patch: PlaceInfoPatch,
  actor: Actor,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb()
  const [before] = await db.select().from(placeTable).where(eq(placeTable.id, placeId)).limit(1)
  if (!before) return { ok: false, error: 'این مجموعه پیدا نشد.' }

  const update: Record<string, unknown> = {}

  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (name.length < 2) return { ok: false, error: 'نام را کامل بنویسید.' }
    update.name = name
    // نام نرمال‌شده هم باید به‌روز شود، وگرنه جست‌وجو نام قدیمی را پیدا می‌کند.
    update.nameNormalized = normalizeFa(name)
  }
  if (patch.nameEn !== undefined) update.nameEn = patch.nameEn?.trim() || null
  if (patch.about !== undefined) update.about = patch.about?.trim() || null
  if (patch.address !== undefined) update.address = patch.address.trim()
  if (patch.instagram !== undefined) {
    // فقط handle ذخیره می‌شود، نه URL کامل.
    update.instagram =
      patch.instagram?.trim().replace(/^https?:\/\/(www\.)?instagram\.com\/+/i, '').replace(/^@/, '').replace(/\/+$/, '') || null
  }

  if (patch.lat !== undefined || patch.lng !== undefined) {
    const lat = patch.lat ?? (before.lat ? Number(before.lat) : null)
    const lng = patch.lng ?? (before.lng ? Number(before.lng) : null)
    const geoStatus = classifyGeo(lat, lng)
    update.lat = geoStatus === 'missing' ? null : lat!.toFixed(7)
    update.lng = geoStatus === 'missing' ? null : lng!.toFixed(7)
    update.geoStatus = geoStatus
  }

  if (Object.keys(update).length > 0) {
    await db.update(placeTable).set(update).where(eq(placeTable.id, placeId))
  }

  // ── شماره‌ها: پاک و از نو. ویرایش تک‌تک، پیچیدگی بی‌دلیل است.
  if (patch.phonesRaw !== undefined) {
    const parsed = parsePhones(patch.phonesRaw)
    await db.delete(placePhoneTable).where(eq(placePhoneTable.placeId, placeId))
    if (parsed.length > 0) {
      await db.insert(placePhoneTable).values(
        parsed.map((phone, order) => ({
          placeId,
          phone: phone.phone,
          kind: phone.kind,
          sortOrder: order,
        })),
      )
    }
  }

  await recordAudit(actor, 'place.update', 'place', placeId, before, update)
  await refreshPlaceDerived(placeId)
  return { ok: true }
}

// ═══════════════════════════════════════════════════════════════════════
// ساعت کاری
// ═══════════════════════════════════════════════════════════════════════

export interface HourShiftInput {
  dow: number
  shiftIndex: number
  opensAt: string | null
  closesAt: string | null
  closed: boolean
}

/**
 * جایگزینی کل ساعت کاری.
 *
 * پاک و از نو، نه ویرایش تفاضلی: تعداد شیفت‌های یک روز عوض می‌شود (کافه‌دار
 * شیفت دوم را حذف می‌کند) و تطبیق تفاضلی روی کلید سه‌ستونی پیچیده و
 * خطاپذیر است.
 *
 * `crossesMidnight` **محاسبه** می‌شود نه پرسیده: اگر ساعت بستن ≤ ساعت باز
 * شدن باشد، قطعاً از نیمه‌شب گذشته. پرسیدنش از کافه‌دار یعنی یک سؤال گیج‌کننده
 * و یک منبع خطا.
 */
export async function replacePlaceHours(
  placeId: number,
  shifts: HourShiftInput[],
  actor: Actor,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb()
  const toMinutes = (clock: string) => {
    const [h, m] = clock.split(':').map(Number)
    return (h ?? 0) * 60 + (m ?? 0)
  }

  const rows = shifts
    .filter((shift) => shift.closed || (shift.opensAt && shift.closesAt))
    .map((shift) => {
      const crosses =
        !shift.closed &&
        shift.opensAt !== null &&
        shift.closesAt !== null &&
        toMinutes(shift.closesAt) <= toMinutes(shift.opensAt)
      return {
        placeId,
        dow: shift.dow,
        shiftIndex: shift.shiftIndex,
        opensAt: shift.closed ? null : shift.opensAt,
        closesAt: shift.closed ? null : shift.closesAt,
        crossesMidnight: crosses,
        closed: shift.closed,
      }
    })

  const [before] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(placeHoursTable)
    .where(eq(placeHoursTable.placeId, placeId))

  await db.delete(placeHoursTable).where(eq(placeHoursTable.placeId, placeId))
  if (rows.length > 0) await db.insert(placeHoursTable).values(rows)

  await recordAudit(actor, 'place.hours', 'place', placeId, before, { shifts: rows.length })
  await refreshPlaceDerived(placeId)
  return { ok: true }
}

// ═══════════════════════════════════════════════════════════════════════
// منو
// ═══════════════════════════════════════════════════════════════════════

export interface MenuItemPatch {
  price?: number | null
  available?: boolean
  featured?: boolean
  name?: string
  description?: string | null
}

export async function updateMenuItem(
  itemId: number,
  patch: MenuItemPatch,
  actor: Actor,
): Promise<{ ok: boolean; error?: string; placeId?: number }> {
  const db = getDb()
  const [before] = await db.select().from(menuItemTable).where(eq(menuItemTable.id, itemId)).limit(1)
  if (!before) return { ok: false, error: 'این آیتم پیدا نشد.' }

  const update: Record<string, unknown> = {}
  if (patch.price !== undefined) {
    if (patch.price !== null && (!Number.isFinite(patch.price) || patch.price < 0)) {
      return { ok: false, error: 'قیمت نامعتبر است.' }
    }
    update.price = patch.price
    // قیمتِ خالی یعنی «قیمت روز»، نه صفر.
    update.priceUnknown = patch.price === null
    // زمان تأیید قیمت ثبت می‌شود: با تورم ایران، قیمتِ بی‌تاریخ بی‌ارزش است.
    update.priceUpdatedAt = new Date()
  }
  if (patch.available !== undefined) update.available = patch.available
  if (patch.featured !== undefined) update.featured = patch.featured
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) return { ok: false, error: 'نام آیتم خالی است.' }
    update.name = name
    update.nameNormalized = normalizeFa(name)
  }
  if (patch.description !== undefined) update.description = patch.description?.trim() || null

  if (Object.keys(update).length === 0) return { ok: true, placeId: before.placeId }

  await db.update(menuItemTable).set(update).where(eq(menuItemTable.id, itemId))
  await recordAudit(actor, 'menu_item.update', 'menu_item', itemId, before, update)
  await refreshPlaceDerived(before.placeId)
  return { ok: true, placeId: before.placeId }
}

/**
 * تغییر دسته‌ای قیمت — درصدی.
 *
 * ═══ چرا این قابلیت لازم است ═══
 *
 * با تورم ایران، کافه‌دار هر چند ماه **کل** منو را چند درصد بالا می‌برد.
 * ویرایش تک‌تکِ ۲۸۷ آیتم یعنی این کار هرگز انجام نمی‌شود و قیمت‌های سایت
 * بیات می‌مانند — که بدترین حالت برای اعتماد کاربر است.
 */
export async function bulkAdjustPrices(
  placeId: number,
  percent: number,
  actor: Actor,
): Promise<{ ok: boolean; error?: string; changed?: number }> {
  if (!Number.isFinite(percent) || percent === 0) {
    return { ok: false, error: 'درصد تغییر را وارد کنید.' }
  }
  if (percent < -90 || percent > 200) {
    return { ok: false, error: 'درصد تغییر باید بین ‎-۹۰ و ۲۰۰ باشد.' }
  }

  const db = getDb()
  const factor = 1 + percent / 100

  // گرد کردن به هزار تومان: قیمتِ ۳۱۷٬۴۲۰ تومان در منو معنی ندارد.
  const result = await db.execute(sql`
    UPDATE menu_item
    SET
      price = GREATEST(1000, ROUND(price * ${factor} / 1000) * 1000),
      price_updated_at = ${new Date()}
    WHERE place_id = ${placeId} AND price IS NOT NULL
  `)

  const changed = (result[0] as unknown as { affectedRows?: number })?.affectedRows ?? 0
  await recordAudit(actor, 'menu.bulk_price', 'place', placeId, { percent }, { changed })
  await refreshPlaceDerived(placeId)
  return { ok: true, changed }
}

// ═══════════════════════════════════════════════════════════════════════
// پاسخ به نظر
// ═══════════════════════════════════════════════════════════════════════

export async function replyToReview(
  reviewId: number,
  text: string,
  actor: Actor,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = text.trim()
  if (trimmed.length < 2) return { ok: false, error: 'پاسخ خالی است.' }

  const db = getDb()
  const [review] = await db
    .select({ id: reviewTable.id, placeId: reviewTable.placeId })
    .from(reviewTable)
    .where(eq(reviewTable.id, reviewId))
    .limit(1)
  if (!review) return { ok: false, error: 'این نظر پیدا نشد.' }

  await db.insert(reviewReply).values({
    reviewId,
    userId: actor.userId,
    text: trimmed.slice(0, 2000),
    // پاسخ کافه‌دار بلافاصله منتشر می‌شود: او صاحب کسب‌وکار است و پاسخ
    // دادنش به یک نظر عمومی، حقِ طبیعی‌اش است. تخلف با گزارش پیگیری می‌شود.
    status: 'approved',
  })

  await recordAudit(actor, 'review.reply', 'review', reviewId, null, { length: trimmed.length })
  return { ok: true }
}

// ═══════════════════════════════════════════════════════════════════════
// خواندن برای پنل
// ═══════════════════════════════════════════════════════════════════════

export interface OwnerPlaceData {
  id: number
  slug: string
  name: string
  nameEn: string | null
  kind: string
  status: string
  about: string | null
  address: string
  instagram: string | null
  lat: number | null
  lng: number | null
  geoStatus: string
  priceMin: number | null
  priceMedian: number | null
  priceMax: number | null
  priceTier: number
  qualityScore: number
  viewCount: number
  ratingCount: number
  logoUrl: string | null
  phones: string[]
  socials: { kind: string; url: string }[]
  hours: {
    dow: number
    shiftIndex: number
    opensAt: string | null
    closesAt: string | null
    closed: boolean
  }[]
  sections: {
    id: number
    name: string
    items: {
      id: number
      name: string
      price: number | null
      priceUnknown: boolean
      available: boolean
      featured: boolean
      imageUrl: string | null
      priceUpdatedAt: Date | null
    }[]
  }[]
}

export async function loadOwnerPlace(placeId: number): Promise<OwnerPlaceData | null> {
  const db = getDb()
  const [place] = await db
    .select({
      id: placeTable.id,
      slug: placeTable.slug,
      name: placeTable.name,
      nameEn: placeTable.nameEn,
      kind: placeTable.kind,
      status: placeTable.status,
      about: placeTable.about,
      address: placeTable.address,
      instagram: placeTable.instagram,
      lat: placeTable.lat,
      lng: placeTable.lng,
      geoStatus: placeTable.geoStatus,
      priceMin: placeTable.priceMin,
      priceMedian: placeTable.priceMedian,
      priceMax: placeTable.priceMax,
      priceTier: placeTable.priceTier,
      qualityScore: placeTable.qualityScore,
      viewCount: placeTable.viewCount,
      ratingCount: placeTable.ratingCount,
      logoPath: mediaTable.localPath,
    })
    .from(placeTable)
    .leftJoin(mediaTable, eq(mediaTable.id, placeTable.logoMediaId))
    .where(eq(placeTable.id, placeId))
    .limit(1)

  if (!place) return null

  const [phones, socials, hours, sections, items] = await Promise.all([
    db
      .select({ phone: placePhoneTable.phone })
      .from(placePhoneTable)
      .where(eq(placePhoneTable.placeId, placeId))
      .orderBy(placePhoneTable.sortOrder),
    db
      .select({ kind: placeSocialTable.kind, url: placeSocialTable.url })
      .from(placeSocialTable)
      .where(eq(placeSocialTable.placeId, placeId)),
    db
      .select()
      .from(placeHoursTable)
      .where(eq(placeHoursTable.placeId, placeId))
      .orderBy(placeHoursTable.dow, placeHoursTable.shiftIndex),
    db
      .select({ id: menuSectionTable.id, name: menuSectionTable.name })
      .from(menuSectionTable)
      .where(eq(menuSectionTable.placeId, placeId))
      .orderBy(menuSectionTable.sortOrder),
    db
      .select({
        id: menuItemTable.id,
        sectionId: menuItemTable.sectionId,
        name: menuItemTable.name,
        price: menuItemTable.price,
        priceUnknown: menuItemTable.priceUnknown,
        available: menuItemTable.available,
        featured: menuItemTable.featured,
        priceUpdatedAt: menuItemTable.priceUpdatedAt,
        imagePath: mediaTable.localPath,
      })
      .from(menuItemTable)
      .leftJoin(mediaTable, eq(mediaTable.id, menuItemTable.mediaId))
      .where(eq(menuItemTable.placeId, placeId))
      .orderBy(menuItemTable.sortOrder),
  ])

  const itemsBySection = new Map<number, OwnerPlaceData['sections'][number]['items']>()
  for (const item of items) {
    const view = {
      id: item.id,
      name: item.name,
      price: item.price,
      priceUnknown: item.priceUnknown,
      available: item.available,
      featured: item.featured,
      imageUrl: item.imagePath ? `/${item.imagePath}` : null,
      priceUpdatedAt: item.priceUpdatedAt,
    }
    const list = itemsBySection.get(item.sectionId)
    if (list) list.push(view)
    else itemsBySection.set(item.sectionId, [view])
  }

  return {
    ...place,
    lat: place.lat ? Number(place.lat) : null,
    lng: place.lng ? Number(place.lng) : null,
    logoUrl: place.logoPath ? `/${place.logoPath}` : null,
    phones: phones.map((row) => row.phone),
    socials,
    hours: hours.map((row) => ({
      dow: row.dow,
      shiftIndex: row.shiftIndex,
      opensAt: row.opensAt ? row.opensAt.slice(0, 5) : null,
      closesAt: row.closesAt ? row.closesAt.slice(0, 5) : null,
      closed: row.closed,
    })),
    sections: sections.map((section) => ({
      id: section.id,
      name: section.name,
      items: itemsBySection.get(section.id) ?? [],
    })),
  }
}

/** نظرهای یک مکان برای پنل کافه‌دار — همه‌ی وضعیت‌ها، با پاسخ. */
export async function loadPlaceReviewsForOwner(placeId: number) {
  const db = getDb()
  const reviews = await db
    .select({
      id: reviewTable.id,
      authorName: reviewTable.authorName,
      stars: reviewTable.stars,
      text: reviewTable.text,
      status: reviewTable.status,
      createdAt: reviewTable.createdAt,
    })
    .from(reviewTable)
    .where(eq(reviewTable.placeId, placeId))
    .orderBy(desc(reviewTable.createdAt))

  if (reviews.length === 0) return []

  const replies = await db
    .select({ reviewId: reviewReply.reviewId, text: reviewReply.text })
    .from(reviewReply)
    // `inArray` نه `sql.join`: دومی روی آرایه‌ی نگاشت‌شده، استنتاج تایپ را
    // منفجر می‌کند (tsc با out-of-memory می‌ترکد).
    .where(inArray(reviewReply.reviewId, reviews.map((review) => review.id)))

  const byReview = new Map<number, string[]>()
  for (const reply of replies) {
    const list = byReview.get(reply.reviewId)
    if (list) list.push(reply.text)
    else byReview.set(reply.reviewId, [reply.text])
  }

  return reviews.map((review) => ({ ...review, replies: byReview.get(review.id) ?? [] }))
}
