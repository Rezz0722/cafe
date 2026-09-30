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

import { and, asc, desc, eq, inArray, isNotNull, isNull, like, notLike, sql } from 'drizzle-orm'
import { getDb, withDbTransaction, inDbTransaction } from '@/db/client'
import {
  auditLog,
  dish as dishTable,
  media as mediaTable,
  menuItem as menuItemTable,
  menuItemVariant as menuItemVariantTable,
  menuSection as menuSectionTable,
  place as placeTable,
  placeBrand as placeBrandTable,
  district as districtTable,
  PLACE_KIND,
  placeAttribute as placeAttributeTable,
  placeHours as placeHoursTable,
  placePhoto as placePhotoTable,
  placePhone as placePhoneTable,
  placeSocial as placeSocialTable,
  review as reviewTable,
  reviewItem as reviewItemTable,
  reviewReply,
} from '@/db/schema'
import { isKnownAttribute } from '@/core/taxonomy/attributes'
import { computeQualityFromFacts } from '@/core/quality/scores'
import { classifyGeo, median, parsePhones, priceTierFromMedian, pickDistrict } from '@/core/import/normalize'
import { getDataPolicy } from '@/core/settings/policies'
import { normalizeFa } from '@/core/text/normalize'
import { randomUUID } from 'node:crypto'
import { FACET_BY_ID, matchDish, matchFacet } from '@/core/taxonomy/menuTaxonomy'
import { pricesForPlaceStats } from '@/core/pricing/stats'
import { isValidClock } from '@/core/hours/openNow'
import { cleanUserText, normalizeInstagram } from '@/core/security/input'
import { mediaFullUrl, mediaPublicUrl } from '@/core/media/store'
import {toEnDigits} from '@/lib/format'
import {runManagedWrite} from './managedWrite'

// ═══════════════════════════════════════════════════════════════════════
// رد پا
// ═══════════════════════════════════════════════════════════════════════

export interface Actor {
  userId: string
  label: string
  /** اگر ادمین در حالت «مشاهده به‌عنوان» باشد، شناسه‌ی خودش. */
  onBehalfOf?: string | null
}

export interface SharedCategoryArtwork {
  mediaId: number
  label: string
  placeName: string
  url: string
  fullUrl: string
  width: number | null
  height: number | null
  usageCount: number
}

/**
 * تصاویر دسته‌ای که همین حالا روی منوی عمومی یک مجموعه استفاده می‌شوند.
 *
 * این query منبع تازه‌ای نمی‌سازد؛ Media Registry فعلی را به یک کتابخانهٔ
 * قابل استفادهٔ مجدد تبدیل می‌کند. تصاویر داخلی ۲۲تایی جدا نمایش داده
 * می‌شوند، بنابراین اینجا حذف می‌شوند. صفحه‌بندی مانع فرستادن هزاران تصویر
 * به پنل در اولین render است.
 */
export async function listSharedCategoryArtwork(options: {
  facetId?: string | null
  query?: string
  page?: number
  limit?: number
} = {}): Promise<{ items: SharedCategoryArtwork[]; hasMore: boolean }> {
  const facetId = options.facetId?.trim().slice(0, 48) || null
  const query = cleanUserText(options.query ?? '', 80)
  const page = Math.max(1, Math.min(200, options.page ?? 1))
  const limit = Math.max(1, Math.min(36, options.limit ?? 24))
  const conditions = [
    eq(mediaTable.status, 'ok'),
    isNotNull(mediaTable.localPath),
    notLike(mediaTable.sourceUrl, 'builtin://menu-category/%'),
    inArray(menuSectionTable.branchScope, ['shared', 'branch']),
    eq(placeTable.status, 'published'),
  ]
  if (facetId) conditions.push(eq(menuSectionTable.facetId, facetId))
  if (query) conditions.push(like(menuSectionTable.name, `%${query}%`))

  const rows = await getDb()
    .select({
      mediaId: mediaTable.id,
      label: sql<string>`MIN(${menuSectionTable.name})`,
      placeName: sql<string>`MIN(${placeTable.name})`,
      localPath: mediaTable.localPath,
      width: mediaTable.width,
      height: mediaTable.height,
      usageCount: sql<number>`COUNT(*)`,
    })
    .from(menuSectionTable)
    .innerJoin(mediaTable, eq(mediaTable.id, menuSectionTable.mediaId))
    .innerJoin(placeTable, eq(placeTable.id, menuSectionTable.placeId))
    .where(and(...conditions))
    .groupBy(mediaTable.id, mediaTable.localPath, mediaTable.width, mediaTable.height)
    .orderBy(desc(sql`COUNT(*)`), desc(mediaTable.id))
    .limit(limit + 1)
    .offset((page - 1) * limit)

  return {
    items: rows.slice(0, limit).flatMap((row) => row.localPath ? [{
      mediaId: row.mediaId,
      label: row.label,
      placeName: row.placeName,
      url: mediaPublicUrl(row.localPath)!,
      fullUrl: mediaFullUrl(row.localPath)!,
      width: row.width,
      height: row.height,
      usageCount: Number(row.usageCount),
    }] : []),
    hasMore: rows.length > limit,
  }
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
  const record=(value:unknown)=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
  let scopedPlaceId=Number(record(after).placeId??record(before).placeId)||null
  const numericId=Number(entityId)
  if(!scopedPlaceId&&Number.isSafeInteger(numericId)&&numericId>0){
    if(entity==='place')scopedPlaceId=numericId
    else if(entity==='menu_item'){const [row]=await db.select({placeId:menuItemTable.placeId}).from(menuItemTable).where(eq(menuItemTable.id,numericId)).limit(1);scopedPlaceId=row?.placeId??null}
    else if(entity==='menu_section'){const [row]=await db.select({placeId:menuSectionTable.placeId}).from(menuSectionTable).where(eq(menuSectionTable.id,numericId)).limit(1);scopedPlaceId=row?.placeId??null}
    else if(entity==='place_photo'){const [row]=await db.select({placeId:placePhotoTable.placeId}).from(placePhotoTable).where(eq(placePhotoTable.id,numericId)).limit(1);scopedPlaceId=row?.placeId??null}
    else if(entity==='review'){const [row]=await db.select({placeId:reviewTable.placeId}).from(reviewTable).where(eq(reviewTable.id,numericId)).limit(1);scopedPlaceId=row?.placeId??null}
    else if(entity==='review_reply'){const [row]=await db.select({placeId:reviewTable.placeId}).from(reviewReply).innerJoin(reviewTable,eq(reviewTable.id,reviewReply.reviewId)).where(eq(reviewReply.id,numericId)).limit(1);scopedPlaceId=row?.placeId??null}
    else if(entity==='menu_item_variant'){let itemId=Number(record(after).itemId??record(before).itemId)||null;if(!itemId){const [variant]=await db.select({itemId:menuItemVariantTable.itemId}).from(menuItemVariantTable).where(eq(menuItemVariantTable.id,numericId)).limit(1);itemId=variant?.itemId??null}if(itemId){const [row]=await db.select({placeId:menuItemTable.placeId}).from(menuItemTable).where(eq(menuItemTable.id,itemId)).limit(1);scopedPlaceId=row?.placeId??null}}
  }
  await db.insert(auditLog).values({
    actorUserId: actor.userId,
    actorLabel: actor.onBehalfOf ? `${actor.label} (به‌جای ${actor.onBehalfOf})` : actor.label,
    action,
    entity,
    entityId: String(entityId),
    before: before ?? null,
    after: scopedPlaceId ? {...(after&&typeof after==='object'&&!Array.isArray(after)?record(after):{value:after??null}),_placeId:scopedPlaceId} : after ?? null,
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
  const policy = await getDataPolicy()

  const priceRows = await db
    .select({
      price: menuItemTable.price,
      manuallyExcluded: menuItemTable.excludeFromPriceStats,
      facetId: menuSectionTable.facetId,
    })
    .from(menuItemTable)
    .innerJoin(menuSectionTable, eq(menuSectionTable.id, menuItemTable.sectionId))
    .where(and(
      eq(menuItemTable.placeId, placeId),
      isNull(menuItemTable.archivedAt),
      inArray(menuSectionTable.branchScope, ['shared', 'branch']),
      sql`${menuItemTable.price} IS NOT NULL`,
    ))
  const prices = pricesForPlaceStats(
    priceRows.map((row) => ({
      price: row.price,
      manuallyExcluded: row.manuallyExcluded,
      facetKind: row.facetId ? FACET_BY_ID.get(row.facetId)?.kind : null,
    })),
    {
      maxItemPrice: policy.priceStatsMaxItemPrice,
      excludeServiceSections: policy.priceStatsExcludeServiceSections,
    },
  )

  const [place] = await db.select().from(placeTable).where(eq(placeTable.id, placeId)).limit(1)
  if (!place) return

  const [phoneCounts, hourCounts, itemCounts, photoCounts, attributeCounts] = await Promise.all([
    db
      .select({ phones: sql<number>`COUNT(*)` })
      .from(placePhoneTable)
      .where(eq(placePhoneTable.placeId, placeId)),
    db
      .select({ openShifts: sql<number>`SUM(closed = 0)` })
      .from(placeHoursTable)
      .where(eq(placeHoursTable.placeId, placeId)),
    db
      .select({ items: sql<number>`COUNT(*)` })
      .from(menuItemTable)
      .innerJoin(menuSectionTable, eq(menuSectionTable.id, menuItemTable.sectionId))
      .where(and(
        eq(menuItemTable.placeId, placeId),
        isNull(menuItemTable.archivedAt),
        inArray(menuSectionTable.branchScope, ['shared', 'branch']),
      )),
    db
      .select({ photos: sql<number>`COUNT(DISTINCT ${placePhotoTable.mediaId})` })
      .from(placePhotoTable)
      .where(eq(placePhotoTable.placeId, placeId)),
    db
      .select({ attributes: sql<number>`COUNT(*)` })
      .from(placeAttributeTable)
      .where(eq(placeAttributeTable.placeId, placeId)),
  ])
  const phones = Number(phoneCounts[0]?.phones ?? 0)
  const openShifts = Number(hourCounts[0]?.openShifts ?? 0)
  const items = Number(itemCounts[0]?.items ?? 0)
  const photos = Number(photoCounts[0]?.photos ?? 0)
  const attributes = Number(attributeCounts[0]?.attributes ?? 0)

  const priceMedian = median(prices)
  // مرزهای رده‌ی قیمت از تنظیمات می‌آیند؛ همان‌جایی که ایمپورت هم از آن
  // می‌خواند، تا رده‌ای که ادمین می‌بیند با رده‌ای که ایمپورت می‌سازد یکی باشد.
  await db
    .update(placeTable)
    .set({
      priceMin: prices.length ? Math.min(...prices) : null,
      priceMedian,
      priceMax: prices.length ? Math.max(...prices) : null,
      priceTier: priceTierFromMedian(priceMedian, policy.priceTierBounds),
      qualityScore: computeQualityFromFacts({
        hasCoords: place.geoStatus !== 'missing',
        hasHours: openShifts > 0,
        hasAddress: !!place.address?.trim(),
        hasPhone: phones > 0,
        hasInstagram: !!place.instagram,
        hasDescription: !!place.about?.trim(),
        hasMenu: items > 0,
        // لوگو عکس محیط نیست. فقط تصاویر گالریِ همان شعبه تکمیل این بخش را
        // بالا می‌برند تا ۱۰۰٪ ادعای واقعی باشد.
        photoCount: photos,
        attributeCount: attributes,
      }),
    })
    .where(eq(placeTable.id, placeId))
}

// ═══════════════════════════════════════════════════════════════════════
// اطلاعات پایه
// ═══════════════════════════════════════════════════════════════════════

export interface PlaceInfoPatch {
  kind?: string
  districtId?: string | null
  brandId?: number | null
  branchName?: string | null
  isPrimaryBranch?: boolean
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
  if (!inDbTransaction()) return runManagedWrite(() => updatePlaceInfo(placeId, patch, actor))
  const db = getDb()
  const [before] = await db.select().from(placeTable).where(eq(placeTable.id, placeId)).limit(1)
  if (!before) return { ok: false, error: 'این مجموعه پیدا نشد.' }

  const update: Record<string, unknown> = {}
  if(patch.phonesRaw?.trim()&&toEnDigits(patch.phonesRaw).split(/[,،\/|؛;\n]+|\s{2,}/).filter(value=>value.trim()).some(value=>parsePhones(value).length!==1))return {ok:false,error:'یکی از شماره‌های تماس معتبر نیست؛ شماره‌ها را با کاما جدا کنید.'}
  if(patch.kind!==undefined){if(!PLACE_KIND.includes(patch.kind as typeof PLACE_KIND[number]))return {ok:false,error:'نوع مجموعه معتبر نیست.'};update.kind=patch.kind}
  if(patch.districtId!==undefined){if(patch.districtId){const [district]=await db.select({id:districtTable.id}).from(districtTable).where(eq(districtTable.id,patch.districtId)).limit(1);if(!district)return {ok:false,error:'محله معتبر نیست.'}}update.districtId=patch.districtId}
  if(patch.brandId!==undefined){if(patch.brandId){const [brand]=await db.select({id:placeBrandTable.id}).from(placeBrandTable).where(eq(placeBrandTable.id,patch.brandId)).limit(1);if(!brand)return {ok:false,error:'مجموعه مادر معتبر نیست.'}}update.brandId=patch.brandId}
  if(patch.branchName!==undefined)update.branchName=cleanUserText(patch.branchName,160)||null
  if(patch.isPrimaryBranch!==undefined)update.isPrimaryBranch=patch.isPrimaryBranch
  const targetBrand=patch.brandId===undefined?before.brandId:patch.brandId
  if(!targetBrand)update.isPrimaryBranch=false
  else if(update.isPrimaryBranch===true){
    await db.select({id:placeBrandTable.id}).from(placeBrandTable).where(eq(placeBrandTable.id,targetBrand)).for('update')
    const previous=await db.select({id:placeTable.id}).from(placeTable).where(and(eq(placeTable.brandId,targetBrand),eq(placeTable.isPrimaryBranch,true),sql`${placeTable.id}<>${placeId}`)).for('update')
    for(const other of previous){await db.update(placeTable).set({isPrimaryBranch:false,revision:sql`${placeTable.revision}+1`}).where(eq(placeTable.id,other.id));await recordAudit(actor,'place.primary_branch','place',other.id,{isPrimaryBranch:true},{isPrimaryBranch:false,newPrimaryId:placeId})}
  }

  if (patch.name !== undefined) {
    const name = cleanUserText(patch.name, 200)
    if (name.length < 2) return { ok: false, error: 'نام را کامل بنویسید.' }
    update.name = name
    // نام نرمال‌شده هم باید به‌روز شود، وگرنه جست‌وجو نام قدیمی را پیدا می‌کند.
    update.nameNormalized = normalizeFa(name)
  }
  if (patch.nameEn !== undefined) update.nameEn = cleanUserText(patch.nameEn, 200) || null
  if (patch.about !== undefined) update.about = cleanUserText(patch.about, 8_000) || null
  if (patch.address !== undefined) update.address = cleanUserText(patch.address, 500)
  if (patch.instagram !== undefined) {
    const instagram = normalizeInstagram(patch.instagram)
    if (patch.instagram?.trim() && !instagram) {
      return { ok: false, error: 'آدرس یا نام کاربری اینستاگرام معتبر نیست.' }
    }
    update.instagram = instagram
  }

  if (patch.lat !== undefined || patch.lng !== undefined) {
    const lat = patch.lat !== undefined ? patch.lat : before.lat !== null ? Number(before.lat) : null
    const lng = patch.lng !== undefined ? patch.lng : before.lng !== null ? Number(before.lng) : null
    if((lat===null)!==(lng===null)|| (lat!==null&&(!Number.isFinite(lat)||lat < -90||lat > 90||!Number.isFinite(lng)||lng! < -180||lng! > 180)))return {ok:false,error:'عرض و طول معتبر را با هم وارد کنید.'}
    const policy=await getDataPolicy()
    const geoStatus = classifyGeo(lat, lng, policy.bbox)
    update.lat = geoStatus === 'missing' ? null : lat!.toFixed(7)
    update.lng = geoStatus === 'missing' ? null : lng!.toFixed(7)
    update.geoStatus = geoStatus
    if(patch.districtId===undefined && (String(before.lat)!==String(update.lat)||String(before.lng)!==String(update.lng)||patch.address!==undefined&&patch.address!==before.address))update.districtId=pickDistrict(patch.address??before.address,lat,lng,policy.districtMatchMaxKm)
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
  if (!inDbTransaction()) return withDbTransaction(() => replacePlaceHours(placeId, shifts, actor))
  const db = getDb()
  const invalid = shifts.find(
    (shift) =>
      !shift.closed &&
      (!isValidClock(shift.opensAt) || !isValidClock(shift.closesAt)),
  )
  if (invalid) return { ok: false, error: 'ساعت شروع یا پایان نامعتبر است.' }

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
// ویژگی‌ها
// ═══════════════════════════════════════════════════════════════════════

export interface AttributeInput {
  attributeId: string
  /** ۰ نه · ۱ تاحدی · ۲ بله */
  value: number
}

export interface AttributePatchInput {
  attributeId: string
  /** null یعنی پاسخ به «نامشخص» برگشته و ردیف باید حذف شود. */
  value: number | null
}

export type AttributeSource =
  | 'owner'
  | 'field_visit'
  | 'editorial'
  | 'user'
  | 'instagram'
  | 'inferred'

function attributeConfidence(source: AttributeSource): number {
  if (source === 'field_visit') return 100
  if (source === 'owner') return 80
  if (source === 'editorial') return 75
  if (source === 'instagram') return 65
  if (source === 'user') return 60
  return 50
}

/**
 * ویژگی‌های یک مکان را جای می‌گذارد.
 *
 * ═══ چرا این داده از پنل می‌آید و نه از ایمپورت ═══
 *
 * ویژگی قضاوت است، نه واقعیتِ قابل استخراج. `build:facets` می‌تواند بگوید
 * «۱۲ آیتم پاستا دارد» چون در منو نوشته شده؛ هیچ‌کس نمی‌تواند از منو دربیاورد
 * که «پریز کنار میز دارد». داده‌ی منبع هم فیلدی برایش ندارد.
 *
 * پس فقط آدم ثبتش می‌کند — و `source`/`verified_at` همین را نگه می‌دارند تا
 * بعداً بشود گفت این برچسب از کجا آمده و کِی تازه بوده.
 *
 * ═══ چرا ردیفِ «نه» هم ذخیره می‌شود ═══
 *
 * `value = 0` یعنی «پرسیدیم، ندارد» که با «نپرسیدیم» یکی نیست. ویژگی‌ای که
 * کافه‌دار دستش نزده اصلاً ردیف نمی‌گیرد؛ فیلتر با `value >= 1` کار می‌کند، پس
 * صفر از نتیجه بیرون می‌ماند ولی اطلاعاتش نمی‌سوزد.
 */
export async function replacePlaceAttributes(
  placeId: number,
  inputs: AttributeInput[],
  actor: Actor,
  source: AttributeSource = 'owner',
): Promise<{ ok: boolean; error?: string }> {
  if (!inDbTransaction()) return withDbTransaction(() => replacePlaceAttributes(placeId, inputs, actor, source))
  const db = getDb()

  // شناسه‌ی ناشناس از فرم رد می‌شود: کلید خارجی `place_attribute` به
  // `attribute` وصل است و ردیفِ بی‌مرجع خطای دیتابیس می‌دهد، نه خطای فرم.
  const rows = inputs
    .filter((input) => isKnownAttribute(input.attributeId))
    .filter((input) => input.value === 0 || input.value === 1 || input.value === 2)
    .map((input) => ({
      placeId,
      attributeId: input.attributeId,
      value: input.value,
      // کافه‌دار خودش گفته، پس اطمینان بالاست — ولی نه صد، چون هنوز کسی
      // بازدید نکرده و ادعای صاحب کسب‌وکار در مورد کسب‌وکارش سوگیری دارد.
      confidence: attributeConfidence(source),
      source,
      verifiedAt: new Date(),
    }))

  const [before] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(placeAttributeTable)
    .where(eq(placeAttributeTable.placeId, placeId))

  await db.delete(placeAttributeTable).where(eq(placeAttributeTable.placeId, placeId))
  if (rows.length > 0) await db.insert(placeAttributeTable).values(rows)

  await recordAudit(actor, 'place.attributes', 'place', placeId, before, {
    set: rows.length,
    yes: rows.filter((row) => row.value === 2).length,
  })
  await refreshPlaceDerived(placeId)
  return { ok: true }
}

/**
 * فقط ویژگی‌های حاضر در ورودی را تغییر می‌دهد. ابزار پوشش Experience نباید
 * هنگام پاسخ‌دادن به پنج سؤال، پاسخ‌های قبلیِ مالک به بقیهٔ ویژگی‌ها را پاک
 * کند؛ تفاوت اصلی این تابع با replacePlaceAttributes همین است.
 */
export async function patchPlaceAttributes(
  placeId: number,
  inputs: AttributePatchInput[],
  actor: Actor,
  source: AttributeSource = 'editorial',
  evidenceNote?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!inDbTransaction()) {
    return withDbTransaction(() => patchPlaceAttributes(placeId, inputs, actor, source, evidenceNote))
  }

  const clean = new Map<string, number | null>()
  for (const input of inputs) {
    if (!isKnownAttribute(input.attributeId)) continue
    if (input.value !== null && input.value !== 0 && input.value !== 1 && input.value !== 2) continue
    clean.set(input.attributeId, input.value)
  }
  const attributeIds = [...clean.keys()]
  if (attributeIds.length === 0) return { ok: false, error: 'ویژگی معتبری برای ذخیره ارسال نشده است.' }

  const db = getDb()
  const before = await db
    .select({
      attributeId: placeAttributeTable.attributeId,
      value: placeAttributeTable.value,
      confidence: placeAttributeTable.confidence,
      source: placeAttributeTable.source,
    })
    .from(placeAttributeTable)
    .where(and(
      eq(placeAttributeTable.placeId, placeId),
      inArray(placeAttributeTable.attributeId, attributeIds),
    ))

  await db.delete(placeAttributeTable).where(and(
    eq(placeAttributeTable.placeId, placeId),
    inArray(placeAttributeTable.attributeId, attributeIds),
  ))

  const verifiedAt = new Date()
  const rows = [...clean.entries()]
    .filter((entry): entry is [string, number] => entry[1] !== null)
    .map(([attributeId, value]) => ({
      placeId,
      attributeId,
      value,
      confidence: attributeConfidence(source),
      source,
      verifiedAt,
    }))
  if (rows.length > 0) await db.insert(placeAttributeTable).values(rows)

  await recordAudit(actor, 'place.attributes.patch', 'place', placeId, before, {
    source,
    evidenceNote: evidenceNote?.slice(0, 500) || null,
    touched: attributeIds,
    values: Object.fromEntries(clean),
  })
  await refreshPlaceDerived(placeId)
  return { ok: true }
}

// ═══════════════════════════════════════════════════════════════════════
// لوگو و گالریِ همان شعبه
// ═══════════════════════════════════════════════════════════════════════

const MAX_PLACE_PHOTOS = 20

async function usableMedia(mediaId: number): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: mediaTable.id })
    .from(mediaTable)
    .where(and(eq(mediaTable.id, mediaId), eq(mediaTable.status, 'ok'), sql`${mediaTable.localPath} IS NOT NULL`))
    .limit(1)
  return Boolean(row)
}

export async function addPlacePhotos(
  placeId: number,
  uploads: { mediaId: number; alt?: string | null }[],
  actor: Actor,
): Promise<{ ok: boolean; error?: string; added?: number; skipped?: number }> {
  if (uploads.length === 0) return { ok: false, error: 'حداقل یک تصویر انتخاب کنید.' }
  const db = getDb()
  const [place] = await db
    .select({ id: placeTable.id, name: placeTable.name, coverMediaId: placeTable.coverMediaId })
    .from(placeTable)
    .where(eq(placeTable.id, placeId))
    .limit(1)
  if (!place) return { ok: false, error: 'این مجموعه پیدا نشد.' }

  const existing = await db
    .select({ mediaId: placePhotoTable.mediaId, sortOrder: placePhotoTable.sortOrder })
    .from(placePhotoTable)
    .where(eq(placePhotoTable.placeId, placeId))
  const existingIds = new Set(existing.map((row) => row.mediaId))
  const unique = [...new Map(uploads.map((upload) => [upload.mediaId, upload])).values()]
    .filter((upload) => !existingIds.has(upload.mediaId))
  const room = Math.max(0, MAX_PLACE_PHOTOS - existing.length)
  const accepted = unique.slice(0, room)
  if (accepted.length === 0) {
    return existing.length >= MAX_PLACE_PHOTOS
      ? { ok: false, error: `حداکثر ${MAX_PLACE_PHOTOS.toLocaleString('fa-IR')} تصویر برای هر شعبه قابل ثبت است.` }
      : { ok: false, error: 'این تصویر قبلاً در گالری ثبت شده است.' }
  }
  for (const upload of accepted) {
    if (!(await usableMedia(upload.mediaId))) return { ok: false, error: 'یکی از تصاویر آماده یا معتبر نیست.' }
  }

  const start = existing.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1
  await db.transaction(async (tx) => {
    await tx.insert(placePhotoTable).values(accepted.map((upload, index) => ({
      placeId,
      mediaId: upload.mediaId,
      alt: cleanUserText(upload.alt, 255) || `تصویر محیط ${place.name}`,
      sortOrder: start + index,
      source: 'owner' as const,
      uploadedByUserId: actor.userId,
    })))
    if (!place.coverMediaId) {
      await tx.update(placeTable).set({ coverMediaId: accepted[0]!.mediaId }).where(eq(placeTable.id, placeId))
    }
  })
  await recordAudit(actor, 'place.photos.add', 'place', placeId, null, {
    mediaIds: accepted.map((upload) => upload.mediaId),
  })
  await refreshPlaceDerived(placeId)
  return { ok: true, added: accepted.length, skipped: uploads.length - accepted.length }
}

export async function setPlaceLogo(
  placeId: number,
  mediaId: number | null,
  actor: Actor,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb()
  const [before] = await db
    .select({ logoMediaId: placeTable.logoMediaId })
    .from(placeTable)
    .where(eq(placeTable.id, placeId))
    .limit(1)
  if (!before) return { ok: false, error: 'این مجموعه پیدا نشد.' }
  if (mediaId !== null && !(await usableMedia(mediaId))) {
    return { ok: false, error: 'تصویر لوگو آماده یا معتبر نیست.' }
  }
  await db.update(placeTable).set({ logoMediaId: mediaId }).where(eq(placeTable.id, placeId))
  await recordAudit(actor, 'place.logo', 'place', placeId, before.logoMediaId, mediaId)
  return { ok: true }
}

export async function setPlaceCover(
  placeId: number,
  photoId: number,
  actor: Actor,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb()
  const [photo] = await db
    .select({ mediaId: placePhotoTable.mediaId })
    .from(placePhotoTable)
    .where(and(eq(placePhotoTable.id, photoId), eq(placePhotoTable.placeId, placeId)))
    .limit(1)
  if (!photo) return { ok: false, error: 'این تصویر در گالری شعبه پیدا نشد.' }
  const [before] = await db
    .select({ coverMediaId: placeTable.coverMediaId })
    .from(placeTable)
    .where(eq(placeTable.id, placeId))
    .limit(1)
  await db.update(placeTable).set({ coverMediaId: photo.mediaId }).where(eq(placeTable.id, placeId))
  await recordAudit(actor, 'place.cover', 'place', placeId, before?.coverMediaId, photo.mediaId)
  return { ok: true }
}

export async function movePlacePhoto(
  placeId: number,
  photoId: number,
  direction: 'up' | 'down',
  actor: Actor,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb()
  const rows = await db
    .select({ id: placePhotoTable.id, sortOrder: placePhotoTable.sortOrder })
    .from(placePhotoTable)
    .where(eq(placePhotoTable.placeId, placeId))
    .orderBy(asc(placePhotoTable.sortOrder), asc(placePhotoTable.id))
  const index = rows.findIndex((row) => row.id === photoId)
  if (index < 0) return { ok: false, error: 'این تصویر در گالری شعبه پیدا نشد.' }
  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= rows.length) return { ok: true }
  const current = rows[index]!
  const target = rows[targetIndex]!
  await db.transaction(async (tx) => {
    await tx.update(placePhotoTable).set({ sortOrder: target.sortOrder }).where(eq(placePhotoTable.id, current.id))
    await tx.update(placePhotoTable).set({ sortOrder: current.sortOrder }).where(eq(placePhotoTable.id, target.id))
  })
  await recordAudit(actor, 'place.photo.reorder', 'place_photo', photoId, { direction }, { moved: true })
  return { ok: true }
}

export async function deletePlacePhoto(
  placeId: number,
  photoId: number,
  actor: Actor,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb()
  const [photo] = await db
    .select({ id: placePhotoTable.id, mediaId: placePhotoTable.mediaId, alt: placePhotoTable.alt })
    .from(placePhotoTable)
    .where(and(eq(placePhotoTable.id, photoId), eq(placePhotoTable.placeId, placeId)))
    .limit(1)
  if (!photo) return { ok: false, error: 'این تصویر در گالری شعبه پیدا نشد.' }
  const [currentPlace] = await db
    .select({ coverMediaId: placeTable.coverMediaId })
    .from(placeTable)
    .where(eq(placeTable.id, placeId))
    .limit(1)
  const [replacement] = await db
    .select({ mediaId: placePhotoTable.mediaId })
    .from(placePhotoTable)
    .where(and(eq(placePhotoTable.placeId, placeId), sql`${placePhotoTable.id} <> ${photoId}`))
    .orderBy(asc(placePhotoTable.sortOrder), asc(placePhotoTable.id))
    .limit(1)
  await db.transaction(async (tx) => {
    if (currentPlace?.coverMediaId === photo.mediaId) {
      await tx.update(placeTable)
        .set({ coverMediaId: replacement?.mediaId ?? null })
        .where(eq(placeTable.id, placeId))
    }
    await tx.delete(placePhotoTable).where(eq(placePhotoTable.id, photoId))
  })
  await recordAudit(actor, 'place.photo.delete', 'place_photo', photoId, photo, null)
  await refreshPlaceDerived(placeId)
  return { ok: true }
}

// ═══════════════════════════════════════════════════════════════════════
// منو
// ═══════════════════════════════════════════════════════════════════════

export async function createMenuSection(
  placeId: number,
  nameInput: string,
  actor: Actor,
): Promise<{ ok: boolean; error?: string; sectionId?: number }> {
  const name = cleanUserText(nameInput, 200)
  if (name.length < 2 || name.length > 200) {
    return { ok: false, error: 'نام دسته باید بین ۲ تا ۲۰۰ نویسه باشد.' }
  }

  const db = getDb()
  const [duplicate] = await db
    .select({ id: menuSectionTable.id })
    .from(menuSectionTable)
    .where(and(eq(menuSectionTable.placeId, placeId), eq(menuSectionTable.name, name)))
    .limit(1)
  if (duplicate) return { ok: false, error: 'دسته‌ای با این نام از قبل وجود دارد.' }

  const [last] = await db
    .select({ value: sql<number>`COALESCE(MAX(${menuSectionTable.sortOrder}), -1)` })
    .from(menuSectionTable)
    .where(eq(menuSectionTable.placeId, placeId))
  const [created] = await db
    .insert(menuSectionTable)
    .values({
      placeId,
      name,
      facetId: matchFacet(name),
      sortOrder: Number(last?.value ?? -1) + 1,
    })
    .$returningId()
  if (!created) return { ok: false, error: 'ساخت دسته انجام نشد.' }

  await recordAudit(actor, 'menu_section.create', 'menu_section', created.id, null, { placeId, name })
  return { ok: true, sectionId: created.id }
}

export async function updateMenuSection(
  placeId: number,
  sectionId: number,
  nameInput: string,
  actor: Actor,
): Promise<{ ok: boolean; error?: string }> {
  const name = cleanUserText(nameInput, 200)
  if (name.length < 2 || name.length > 200) {
    return { ok: false, error: 'نام دسته باید بین ۲ تا ۲۰۰ نویسه باشد.' }
  }
  const db = getDb()
  const [before] = await db
    .select()
    .from(menuSectionTable)
    .where(and(eq(menuSectionTable.id, sectionId), eq(menuSectionTable.placeId, placeId)))
    .limit(1)
  if (!before) return { ok: false, error: 'این دسته پیدا نشد.' }
  const [duplicate] = await db
    .select({ id: menuSectionTable.id })
    .from(menuSectionTable)
    .where(and(
      eq(menuSectionTable.placeId, placeId),
      eq(menuSectionTable.name, name),
      sql`${menuSectionTable.id} <> ${sectionId}`,
    ))
    .limit(1)
  if (duplicate) return { ok: false, error: 'دسته‌ای با این نام از قبل وجود دارد.' }

  const facetId = matchFacet(name)
  await db.update(menuSectionTable).set({ name, facetId }).where(eq(menuSectionTable.id, sectionId))
  // تغییر facet دسته، تطبیق محصول‌های آن را هم عوض می‌کند.
  const items = await db
    .select({ id: menuItemTable.id, name: menuItemTable.name, price: menuItemTable.price })
    .from(menuItemTable)
    .where(eq(menuItemTable.sectionId, sectionId))
  for (const item of items) {
    const dishSlug = matchDish(item.name, facetId, { price: item.price, sectionName: name })
    const [dish] = dishSlug
      ? await db.select({ id: dishTable.id }).from(dishTable).where(eq(dishTable.slug, dishSlug)).limit(1)
      : []
    await db.update(menuItemTable).set({ dishId: dish?.id ?? null }).where(eq(menuItemTable.id, item.id))
  }
  await recordAudit(actor, 'menu_section.update', 'menu_section', sectionId, before, { name, facetId })
  return { ok: true }
}

/** اتصال تصویر اختصاصی/کتابخانه‌ای به دستهٔ منو با ثبت کامل ردپا. */
export async function setMenuSectionArtwork(
  placeId: number,
  sectionId: number,
  mediaId: number | null,
  actor: Actor,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb()
  const [before] = await db
    .select({ id: menuSectionTable.id, mediaId: menuSectionTable.mediaId })
    .from(menuSectionTable)
    .where(and(eq(menuSectionTable.id, sectionId), eq(menuSectionTable.placeId, placeId)))
    .limit(1)
  if (!before) return { ok: false, error: 'این دسته پیدا نشد.' }
  if (mediaId !== null && !(await usableMedia(mediaId))) {
    return { ok: false, error: 'تصویر دسته آماده یا معتبر نیست.' }
  }
  await db.update(menuSectionTable).set({ mediaId }).where(eq(menuSectionTable.id, sectionId))
  await recordAudit(actor, 'menu_section.artwork', 'menu_section', sectionId, before, { mediaId })
  return { ok: true }
}

export async function moveMenuSection(
  placeId: number,
  sectionId: number,
  direction: 'up' | 'down',
  actor: Actor,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb()
  const rows = await db
    .select({ id: menuSectionTable.id, sortOrder: menuSectionTable.sortOrder })
    .from(menuSectionTable)
    .where(and(
      eq(menuSectionTable.placeId, placeId),
      inArray(menuSectionTable.branchScope, ['shared', 'branch']),
    ))
    .orderBy(asc(menuSectionTable.sortOrder), asc(menuSectionTable.id))
  const index = rows.findIndex((row) => row.id === sectionId)
  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (index < 0) return { ok: false, error: 'این دسته پیدا نشد.' }
  if (targetIndex < 0 || targetIndex >= rows.length) return { ok: true }
  const target = rows[targetIndex]!
  const current = rows[index]!
  await db.transaction(async (tx) => {
    await tx.update(menuSectionTable).set({ sortOrder: target.sortOrder }).where(eq(menuSectionTable.id, current.id))
    await tx.update(menuSectionTable).set({ sortOrder: current.sortOrder }).where(eq(menuSectionTable.id, target.id))
  })
  await recordAudit(actor, 'menu_section.reorder', 'menu_section', sectionId, { direction }, { moved: true })
  return { ok: true }
}

export async function deleteEmptyMenuSection(
  placeId: number,
  sectionId: number,
  actor: Actor,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb()
  const [section] = await db
    .select()
    .from(menuSectionTable)
    .where(and(eq(menuSectionTable.id, sectionId), eq(menuSectionTable.placeId, placeId)))
    .limit(1)
  if (!section) return { ok: false, error: 'این دسته پیدا نشد.' }
  const [{ count = 0 } = { count: 0 }] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(menuItemTable)
    .where(eq(menuItemTable.sectionId, sectionId))
  if (Number(count) > 0) {
    return { ok: false, error: 'برای حذف دسته، ابتدا آیتم‌های آن را جابه‌جا یا حذف کنید.' }
  }
  await db.transaction(async (tx) => {
    await tx.insert(auditLog).values({
      actorUserId: actor.userId,
      actorLabel: actor.label,
      action: 'menu_section.delete',
      entity: 'menu_section',
      entityId: String(sectionId),
      before: section,
      after: null,
    })
    await tx.delete(menuSectionTable).where(eq(menuSectionTable.id, sectionId))
  })
  return { ok: true }
}

export interface NewMenuItemInput {
  sectionId: number
  name: string
  description?: string | null
  price?: number | null
  mediaId?: number | null
  excludeFromPriceStats?: boolean
}

export async function createMenuItem(
  placeId: number,
  input: NewMenuItemInput,
  actor: Actor,
): Promise<{ ok: boolean; error?: string; publicId?: string; itemId?: number }> {
  const name = cleanUserText(input.name, 250)
  if (name.length < 2 || name.length > 250) {
    return { ok: false, error: 'نام آیتم باید بین ۲ تا ۲۵۰ نویسه باشد.' }
  }
  if (input.price !== null && input.price !== undefined && (!Number.isFinite(input.price) || input.price < 0)) {
    return { ok: false, error: 'قیمت نامعتبر است.' }
  }

  const db = getDb()
  const [section] = await db
    .select({ id: menuSectionTable.id, facetId: menuSectionTable.facetId, name: menuSectionTable.name })
    .from(menuSectionTable)
    .where(and(eq(menuSectionTable.id, input.sectionId), eq(menuSectionTable.placeId, placeId)))
    .limit(1)
  if (!section) return { ok: false, error: 'این دسته به مجموعهٔ شما تعلق ندارد.' }

  const [last] = await db
    .select({ value: sql<number>`COALESCE(MAX(${menuItemTable.sortOrder}), -1)` })
    .from(menuItemTable)
    .where(eq(menuItemTable.sectionId, input.sectionId))
  const publicId = `mi_${randomUUID().replaceAll('-', '').slice(0, 20)}`
  const dishSlug = matchDish(name, section.facetId, {
    price: input.price,
    sectionName: section.name,
  })
  const [matchedDish] = dishSlug
    ? await db.select({ id: dishTable.id }).from(dishTable).where(eq(dishTable.slug, dishSlug)).limit(1)
    : []
  const [created] = await db
    .insert(menuItemTable)
    .values({
      publicId,
      placeId,
      sectionId: input.sectionId,
      name,
      nameNormalized: normalizeFa(name),
      description: cleanUserText(input.description, 4_000) || null,
      price: input.price ?? null,
      priceUnknown: input.price === null || input.price === undefined,
      excludeFromPriceStats: input.excludeFromPriceStats ?? false,
      available: true,
      featured: false,
      mediaId: input.mediaId ?? null,
      dishId: matchedDish?.id ?? null,
      sortOrder: Number(last?.value ?? -1) + 1,
      priceUpdatedAt: input.price === null || input.price === undefined ? null : new Date(),
    })
    .$returningId()
  if (!created) return { ok: false, error: 'ساخت آیتم انجام نشد.' }

  await recordAudit(actor, 'menu_item.create', 'menu_item', created.id, null, {
    publicId,
    placeId,
    sectionId: input.sectionId,
    name,
    price: input.price ?? null,
    mediaId: input.mediaId ?? null,
    excludeFromPriceStats: input.excludeFromPriceStats ?? false,
  })
  await refreshPlaceDerived(placeId)
  return { ok: true, publicId, itemId: created.id }
}

/** قیمت پایهٔ آیتم دارای سایز، کمترین قیمت سایز موجود است. */
async function syncMenuItemVariantPrice(itemId: number): Promise<number | null> {
  const db = getDb()
  const [summary] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      availableCount: sql<number>`SUM(${menuItemVariantTable.available} = TRUE)`,
      minimum: sql<number | null>`MIN(CASE WHEN ${menuItemVariantTable.available} = TRUE THEN ${menuItemVariantTable.price} END)`,
    })
    .from(menuItemVariantTable)
    .where(eq(menuItemVariantTable.itemId, itemId))
  const total = Number(summary?.total ?? 0)
  if (total === 0) {
    await db.update(menuItemTable).set({ price: null, priceUnknown: true, available: true, priceUpdatedAt: new Date() }).where(eq(menuItemTable.id, itemId))
    return null
  }
  const minimum = summary?.minimum === null || summary?.minimum === undefined ? null : Number(summary.minimum)
  await db.update(menuItemTable).set({
    price: minimum,
    priceUnknown: minimum === null,
    available: Number(summary?.availableCount ?? 0) > 0,
    priceUpdatedAt: new Date(),
  }).where(eq(menuItemTable.id, itemId))
  return minimum
}

export async function createMenuItemVariant(
  itemId: number,
  input: { label: string; price: number | null; available?: boolean },
  actor: Actor,
): Promise<{ ok: boolean; error?: string; placeId?: number }> {
  const label = cleanUserText(input.label, 120)
  if (label.length < 1) return { ok: false, error: 'نام سایز را بنویسید.' }
  if (input.price !== null && (!Number.isFinite(input.price) || input.price < 0)) {
    return { ok: false, error: 'قیمت سایز معتبر نیست.' }
  }
  const db = getDb()
  const [item] = await db.select({ placeId: menuItemTable.placeId }).from(menuItemTable).where(eq(menuItemTable.id, itemId)).limit(1)
  if (!item) return { ok: false, error: 'آیتم پیدا نشد.' }
  const [duplicate] = await db.select({ id: menuItemVariantTable.id }).from(menuItemVariantTable).where(and(eq(menuItemVariantTable.itemId, itemId), eq(menuItemVariantTable.label, label))).limit(1)
  if (duplicate) return { ok: false, error: 'این سایز برای آیتم از قبل وجود دارد.' }
  const [last] = await db.select({ value: sql<number>`COALESCE(MAX(${menuItemVariantTable.sortOrder}), -1)` }).from(menuItemVariantTable).where(eq(menuItemVariantTable.itemId, itemId))
  const [created] = await db.insert(menuItemVariantTable).values({
    itemId,
    label,
    price: input.price,
    available: input.available ?? true,
    sortOrder: Number(last?.value ?? -1) + 1,
    priceUpdatedAt: input.price === null ? null : new Date(),
  }).$returningId()
  if (!created) return { ok: false, error: 'ساخت سایز انجام نشد.' }
  await syncMenuItemVariantPrice(itemId)
  await recordAudit(actor, 'menu_item_variant.create', 'menu_item_variant', created.id, null, { itemId, label, price: input.price, available: input.available ?? true })
  await refreshPlaceDerived(item.placeId)
  return { ok: true, placeId: item.placeId }
}

export async function updateMenuItemVariant(
  variantId: number,
  patch: { label: string; price: number | null; available: boolean },
  actor: Actor,
): Promise<{ ok: boolean; error?: string; placeId?: number }> {
  const label = cleanUserText(patch.label, 120)
  if (!label) return { ok: false, error: 'نام سایز را بنویسید.' }
  if (patch.price !== null && (!Number.isFinite(patch.price) || patch.price < 0)) return { ok: false, error: 'قیمت سایز معتبر نیست.' }
  const db = getDb()
  const [before] = await db.select({
    id: menuItemVariantTable.id,
    itemId: menuItemVariantTable.itemId,
    label: menuItemVariantTable.label,
    price: menuItemVariantTable.price,
    available: menuItemVariantTable.available,
    placeId: menuItemTable.placeId,
  }).from(menuItemVariantTable).innerJoin(menuItemTable, eq(menuItemTable.id, menuItemVariantTable.itemId)).where(eq(menuItemVariantTable.id, variantId)).limit(1)
  if (!before) return { ok: false, error: 'این سایز پیدا نشد.' }
  const [duplicate] = await db.select({ id: menuItemVariantTable.id }).from(menuItemVariantTable).where(and(eq(menuItemVariantTable.itemId, before.itemId), eq(menuItemVariantTable.label, label), sql`${menuItemVariantTable.id} <> ${variantId}`)).limit(1)
  if (duplicate) return { ok: false, error: 'سایزی با این نام از قبل وجود دارد.' }
  const after = { label, price: patch.price, available: patch.available, priceUpdatedAt: new Date() }
  await db.update(menuItemVariantTable).set(after).where(eq(menuItemVariantTable.id, variantId))
  await syncMenuItemVariantPrice(before.itemId)
  await recordAudit(actor, 'menu_item_variant.update', 'menu_item_variant', variantId, before, after)
  await refreshPlaceDerived(before.placeId)
  return { ok: true, placeId: before.placeId }
}

export async function deleteMenuItemVariant(
  variantId: number,
  actor: Actor,
): Promise<{ ok: boolean; error?: string; placeId?: number }> {
  const db = getDb()
  const [before] = await db.select({
    id: menuItemVariantTable.id,
    itemId: menuItemVariantTable.itemId,
    label: menuItemVariantTable.label,
    price: menuItemVariantTable.price,
    placeId: menuItemTable.placeId,
  }).from(menuItemVariantTable).innerJoin(menuItemTable, eq(menuItemTable.id, menuItemVariantTable.itemId)).where(eq(menuItemVariantTable.id, variantId)).limit(1)
  if (!before) return { ok: false, error: 'این سایز پیدا نشد.' }
  await db.delete(menuItemVariantTable).where(eq(menuItemVariantTable.id, variantId))
  await syncMenuItemVariantPrice(before.itemId)
  await recordAudit(actor, 'menu_item_variant.delete', 'menu_item_variant', variantId, before, null)
  await refreshPlaceDerived(before.placeId)
  return { ok: true, placeId: before.placeId }
}

export async function moveMenuItemVariant(
  variantId: number,
  direction: 'up' | 'down',
  actor: Actor,
): Promise<{ ok: boolean; error?: string; placeId?: number }> {
  const db = getDb()
  const [variant] = await db.select({ id: menuItemVariantTable.id, itemId: menuItemVariantTable.itemId, sortOrder: menuItemVariantTable.sortOrder, placeId: menuItemTable.placeId }).from(menuItemVariantTable).innerJoin(menuItemTable, eq(menuItemTable.id, menuItemVariantTable.itemId)).where(eq(menuItemVariantTable.id, variantId)).limit(1)
  if (!variant) return { ok: false, error: 'این سایز پیدا نشد.' }
  const rows = await db.select({ id: menuItemVariantTable.id, sortOrder: menuItemVariantTable.sortOrder }).from(menuItemVariantTable).where(eq(menuItemVariantTable.itemId, variant.itemId)).orderBy(asc(menuItemVariantTable.sortOrder), asc(menuItemVariantTable.id))
  const index = rows.findIndex((row) => row.id === variantId)
  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= rows.length) return { ok: true, placeId: variant.placeId }
  const target = rows[targetIndex]!
  await db.transaction(async (tx) => {
    await tx.update(menuItemVariantTable).set({ sortOrder: target.sortOrder }).where(eq(menuItemVariantTable.id, variantId))
    await tx.update(menuItemVariantTable).set({ sortOrder: variant.sortOrder }).where(eq(menuItemVariantTable.id, target.id))
  })
  await recordAudit(actor, 'menu_item_variant.reorder', 'menu_item_variant', variantId, { direction }, { moved: true })
  return { ok: true, placeId: variant.placeId }
}

export interface MenuItemPatch {
  sectionId?: number
  price?: number | null
  available?: boolean
  featured?: boolean
  excludeFromPriceStats?: boolean
  name?: string
  description?: string | null
  /** `null` یعنی برداشتن عکس؛ undefined یعنی دست‌نخوردن. */
  mediaId?: number | null
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
  let effectiveFacetId: string | null | undefined
  let effectiveSectionName: string | undefined
  if (patch.sectionId !== undefined && patch.sectionId !== before.sectionId) {
    const [section] = await db
      .select({ id: menuSectionTable.id, facetId: menuSectionTable.facetId, name: menuSectionTable.name })
      .from(menuSectionTable)
      .where(and(eq(menuSectionTable.id, patch.sectionId), eq(menuSectionTable.placeId, before.placeId)))
      .limit(1)
    if (!section) return { ok: false, error: 'دستهٔ مقصد معتبر نیست.' }
    const [last] = await db
      .select({ value: sql<number>`COALESCE(MAX(${menuItemTable.sortOrder}), -1)` })
      .from(menuItemTable)
      .where(eq(menuItemTable.sectionId, patch.sectionId))
    update.sectionId = patch.sectionId
    update.sortOrder = Number(last?.value ?? -1) + 1
    effectiveFacetId = section.facetId
    effectiveSectionName = section.name
  }
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
  if (patch.excludeFromPriceStats !== undefined) {
    update.excludeFromPriceStats = patch.excludeFromPriceStats
  }
  if (patch.name !== undefined) {
    const name = cleanUserText(patch.name, 250)
    if (!name) return { ok: false, error: 'نام آیتم خالی است.' }
    update.name = name
    update.nameNormalized = normalizeFa(name)
    const [section] = effectiveFacetId === undefined ? await db
      .select({ facetId: menuSectionTable.facetId, name: menuSectionTable.name })
      .from(menuSectionTable)
      .where(eq(menuSectionTable.id, before.sectionId))
      .limit(1) : [{ facetId: effectiveFacetId, name: effectiveSectionName }]
    const dishSlug = matchDish(name, section?.facetId, {
      price: patch.price !== undefined ? patch.price : before.price,
      sectionName: section?.name,
    })
    const [matchedDish] = dishSlug
      ? await db.select({ id: dishTable.id }).from(dishTable).where(eq(dishTable.slug, dishSlug)).limit(1)
      : []
    update.dishId = matchedDish?.id ?? null
  } else if (effectiveFacetId !== undefined || patch.price !== undefined) {
    const [section] = effectiveFacetId === undefined ? await db
      .select({ facetId: menuSectionTable.facetId, name: menuSectionTable.name })
      .from(menuSectionTable)
      .where(eq(menuSectionTable.id, before.sectionId))
      .limit(1) : [{ facetId: effectiveFacetId, name: effectiveSectionName }]
    const dishSlug = matchDish(before.name, section?.facetId, {
      price: patch.price !== undefined ? patch.price : before.price,
      sectionName: section?.name,
    })
    const [matchedDish] = dishSlug
      ? await db.select({ id: dishTable.id }).from(dishTable).where(eq(dishTable.slug, dishSlug)).limit(1)
      : []
    update.dishId = matchedDish?.id ?? null
  }
  if (patch.description !== undefined) update.description = cleanUserText(patch.description, 4_000) || null
  if (patch.mediaId !== undefined) update.mediaId = patch.mediaId

  if (Object.keys(update).length === 0) return { ok: true, placeId: before.placeId }

  await db.update(menuItemTable).set(update).where(eq(menuItemTable.id, itemId))
  await recordAudit(actor, 'menu_item.update', 'menu_item', itemId, before, update)
  await refreshPlaceDerived(before.placeId)
  return { ok: true, placeId: before.placeId }
}

export async function setMenuItemArchived(
  itemId: number,
  archived: boolean,
  actor: Actor,
): Promise<{ ok: boolean; error?: string; placeId?: number }> {
  const db = getDb()
  const [before] = await db.select().from(menuItemTable).where(eq(menuItemTable.id, itemId)).limit(1)
  if (!before) return { ok: false, error: 'این آیتم پیدا نشد.' }
  await db.update(menuItemTable).set({ archivedAt: archived ? new Date() : null }).where(eq(menuItemTable.id, itemId))
  await recordAudit(actor, archived ? 'menu_item.archive' : 'menu_item.restore', 'menu_item', itemId, before.archivedAt, archived)
  await refreshPlaceDerived(before.placeId)
  return { ok: true, placeId: before.placeId }
}

export async function deleteArchivedMenuItem(
  itemId: number,
  actor: Actor,
): Promise<{ ok: boolean; error?: string; placeId?: number }> {
  const db = getDb()
  const [before] = await db.select().from(menuItemTable).where(eq(menuItemTable.id, itemId)).limit(1)
  if (!before) return { ok: false, error: 'این آیتم پیدا نشد.' }
  if (!before.archivedAt) return { ok: false, error: 'برای حذف دائمی، ابتدا آیتم را آرشیو کنید.' }
  await db.transaction(async (tx) => {
    await tx.insert(auditLog).values({
      actorUserId: actor.userId,
      actorLabel: actor.label,
      action: 'menu_item.delete',
      entity: 'menu_item',
      entityId: String(itemId),
      before,
      after: null,
    })
    await tx.delete(menuItemTable).where(eq(menuItemTable.id, itemId))
  })
  await refreshPlaceDerived(before.placeId)
  return { ok: true, placeId: before.placeId }
}

export async function duplicateMenuItem(
  itemId: number,
  actor: Actor,
): Promise<{ ok: boolean; error?: string; placeId?: number }> {
  const db = getDb()
  const [before] = await db.select().from(menuItemTable).where(eq(menuItemTable.id, itemId)).limit(1)
  if (!before) return { ok: false, error: 'این آیتم پیدا نشد.' }
  const result = await createMenuItem(before.placeId, {
    sectionId: before.sectionId,
    name: `${before.name} (کپی)`.slice(0, 250),
    description: before.description,
    price: before.price,
    mediaId: before.mediaId,
    excludeFromPriceStats: before.excludeFromPriceStats,
  }, actor)
  if (result.ok && result.itemId) {
    const variants = await db
      .select({
        label: menuItemVariantTable.label,
        price: menuItemVariantTable.price,
        available: menuItemVariantTable.available,
        sortOrder: menuItemVariantTable.sortOrder,
        priceUpdatedAt: menuItemVariantTable.priceUpdatedAt,
      })
      .from(menuItemVariantTable)
      .where(eq(menuItemVariantTable.itemId, itemId))
      .orderBy(asc(menuItemVariantTable.sortOrder), asc(menuItemVariantTable.id))
    if (variants.length > 0) {
      await db.insert(menuItemVariantTable).values(variants.map((variant) => ({
        ...variant,
        itemId: result.itemId!,
      })))
      await syncMenuItemVariantPrice(result.itemId)
    }
  }
  return result.ok ? { ok: true, placeId: before.placeId } : result
}

export async function moveMenuItem(
  itemId: number,
  direction: 'up' | 'down',
  actor: Actor,
): Promise<{ ok: boolean; error?: string; placeId?: number }> {
  const db = getDb()
  const [item] = await db.select().from(menuItemTable).where(eq(menuItemTable.id, itemId)).limit(1)
  if (!item) return { ok: false, error: 'این آیتم پیدا نشد.' }
  const rows = await db
    .select({ id: menuItemTable.id, sortOrder: menuItemTable.sortOrder })
    .from(menuItemTable)
    .where(eq(menuItemTable.sectionId, item.sectionId))
    .orderBy(asc(menuItemTable.sortOrder), asc(menuItemTable.id))
  const index = rows.findIndex((row) => row.id === itemId)
  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= rows.length) return { ok: true, placeId: item.placeId }
  const target = rows[targetIndex]!
  await db.transaction(async (tx) => {
    await tx.update(menuItemTable).set({ sortOrder: target.sortOrder }).where(eq(menuItemTable.id, itemId))
    await tx.update(menuItemTable).set({ sortOrder: item.sortOrder }).where(eq(menuItemTable.id, target.id))
  })
  await recordAudit(actor, 'menu_item.reorder', 'menu_item', itemId, { direction }, { moved: true })
  return { ok: true, placeId: item.placeId }
}

export async function bulkSetAvailability(
  placeId: number,
  available: boolean,
  actor: Actor,
): Promise<{ ok: boolean; changed: number }> {
  const db = getDb()
  const publicSections = await db
    .select({ id: menuSectionTable.id })
    .from(menuSectionTable)
    .where(and(
      eq(menuSectionTable.placeId, placeId),
      inArray(menuSectionTable.branchScope, ['shared', 'branch']),
    ))
  if (publicSections.length === 0) {
    await recordAudit(actor, 'menu.bulk_availability', 'place', placeId, null, { available, changed: 0 })
    return { ok: true, changed: 0 }
  }
  const changed = await db.transaction(async (tx) => {
    const result = await tx
      .update(menuItemTable)
      .set({ available })
      .where(and(
        eq(menuItemTable.placeId, placeId),
        inArray(menuItemTable.sectionId, publicSections.map((section) => section.id)),
        isNull(menuItemTable.archivedAt),
      ))
    await tx.execute(sql`
      UPDATE menu_item_variant v
      INNER JOIN menu_item mi ON mi.id = v.item_id
      SET v.available = ${available}
      WHERE mi.place_id = ${placeId}
        AND mi.section_id IN (${sql.join(publicSections.map((section) => sql`${section.id}`), sql`, `)})
        AND mi.archived_at IS NULL
    `)
    return (result[0] as unknown as { affectedRows?: number })?.affectedRows ?? 0
  })
  await recordAudit(actor, 'menu.bulk_availability', 'place', placeId, null, { available, changed })
  return { ok: true, changed }
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
  const now = new Date()
  const changed = await db.transaction(async (tx) => {
    // آیتم‌های ساده مستقیماً تغییر می‌کنند. آیتم دارای سایز از جدول سایزها
    // محاسبه می‌شود تا قیمت پایه و قیمت قابل سفارش از هم جدا نیفتند.
    const baseResult = await tx.execute(sql`
      UPDATE menu_item mi
      SET
        mi.price = GREATEST(1000, ROUND(mi.price * ${factor} / 1000) * 1000),
        mi.price_updated_at = ${now}
      WHERE mi.place_id = ${placeId}
        AND mi.section_id IN (
          SELECT id FROM menu_section
          WHERE place_id = ${placeId} AND branch_scope IN ('shared', 'branch')
        )
        AND mi.archived_at IS NULL
        AND mi.price IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM menu_item_variant v WHERE v.item_id = mi.id)
    `)
    const variantResult = await tx.execute(sql`
      UPDATE menu_item_variant v
      INNER JOIN menu_item mi ON mi.id = v.item_id
      INNER JOIN menu_section ms ON ms.id = mi.section_id
      SET
        v.price = GREATEST(1000, ROUND(v.price * ${factor} / 1000) * 1000),
        v.price_updated_at = ${now}
      WHERE mi.place_id = ${placeId}
        AND ms.branch_scope IN ('shared', 'branch')
        AND mi.archived_at IS NULL
        AND v.price IS NOT NULL
    `)
    await tx.execute(sql`
      UPDATE menu_item mi
      SET
        mi.price = (SELECT MIN(v.price) FROM menu_item_variant v WHERE v.item_id = mi.id AND v.available = TRUE),
        mi.price_unknown = NOT EXISTS (SELECT 1 FROM menu_item_variant v WHERE v.item_id = mi.id AND v.available = TRUE AND v.price IS NOT NULL),
        mi.price_updated_at = ${now}
      WHERE mi.place_id = ${placeId}
        AND EXISTS (SELECT 1 FROM menu_item_variant v WHERE v.item_id = mi.id)
    `)
    const baseChanged = (baseResult[0] as unknown as { affectedRows?: number })?.affectedRows ?? 0
    const variantChanged = (variantResult[0] as unknown as { affectedRows?: number })?.affectedRows ?? 0
    return baseChanged + variantChanged
  })
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
  requireApproval = false,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = text.trim()
  if (trimmed.length < 2) return { ok: false, error: 'پاسخ خالی است.' }
  if (!inDbTransaction()) return withDbTransaction(() => replyToReview(reviewId, text, actor, requireApproval))

  const db = getDb()
  const [review] = await db
    .select({ id: reviewTable.id, placeId: reviewTable.placeId, status: reviewTable.status })
    .from(reviewTable)
    .where(eq(reviewTable.id, reviewId))
    .limit(1).for('update')
  if (!review) return { ok: false, error: 'این نظر پیدا نشد.' }
  if (review.status !== 'approved') return { ok: false, error: 'فقط به نظر منتشرشده می‌توان پاسخ داد.' }
  const [existing] = await db.select({id:reviewReply.id}).from(reviewReply).where(and(eq(reviewReply.reviewId, reviewId), inArray(reviewReply.status, ['pending','approved']))).limit(1)
  if (existing) return {ok:false,error:'این نظر قبلاً پاسخ فعال یا در انتظار تأیید دارد.'}

  await db.insert(reviewReply).values({
    reviewId,
    userId: actor.userId,
    text: trimmed.slice(0, 2000),
    // پیش‌فرض این است که پاسخ کافه‌دار بلافاصله منتشر شود: او صاحب کسب‌وکار
    // است و پاسخ دادنش به یک نظر عمومی حقِ طبیعی‌اش است. اگر مدیر سایت
    // تجربه‌ی تلخی داشت، از تنظیمات می‌تواند بازبینی را روشن کند.
    status: requireApproval ? 'pending' : 'approved',
  })

  await recordAudit(actor, 'review.reply', 'review', reviewId, null, { length: trimmed.length })
  return { ok: true }
}

// ═══════════════════════════════════════════════════════════════════════
// خواندن برای پنل
// ═══════════════════════════════════════════════════════════════════════

export interface OwnerPlaceData {
  districtId?: string | null
  brandId?: number | null
  id: number
  slug: string
  name: string
  nameEn: string | null
  kind: string
  status: string
  brandName: string | null
  branchName: string | null
  isPrimaryBranch: boolean
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
  updatedAt: Date
  revision: number
  viewCount: number
  ratingCount: number
  logoUrl: string | null
  coverMediaId: number | null
  photos: {
    id: number
    mediaId: number
    url: string
    fullUrl: string
    alt: string
    sortOrder: number
    width: number | null
    height: number | null
  }[]
  phones: string[]
  /**
   * ویژگی‌های ثبت‌شده: شناسه → مقدار (۰ نه · ۱ تاحدی · ۲ بله).
   *
   * ویژگیِ غایب یعنی «ثبت نشده»، که با «نه» یکی نیست — پنل هم همین سه‌حالت
   * به‌علاوه‌ی «ثبت‌نشده» را نشان می‌دهد.
   */
  attributes: Record<string, number>
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
    facetId: string | null
    imageUrl: string | null
    imageFullUrl: string | null
    branchScope: 'shared' | 'branch' | 'other_branch' | 'unverified'
    items: {
      id: number
      publicId: string
      name: string
      description: string | null
      price: number | null
      priceUnknown: boolean
      excludeFromPriceStats: boolean
      available: boolean
      featured: boolean
      archivedAt: Date | null
      imageUrl: string | null
      priceUpdatedAt: Date | null
      variants: {
        id: number
        label: string
        price: number | null
        available: boolean
        sortOrder: number
        priceUpdatedAt: Date | null
      }[]
    }[]
  }[]
}

export async function loadOwnerPlace(
  placeId: number,
  options: { includeForeignBranchSections?: boolean } = {},
): Promise<OwnerPlaceData | null> {
  const db = getDb()
  const [place] = await db
    .select({
      id: placeTable.id,
      slug: placeTable.slug,
      name: placeTable.name,
      nameEn: placeTable.nameEn,
      kind: placeTable.kind,
      status: placeTable.status,
      brandName: placeBrandTable.name,
      brandId: placeTable.brandId,
      districtId: placeTable.districtId,
      branchName: placeTable.branchName,
      isPrimaryBranch: placeTable.isPrimaryBranch,
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
      updatedAt: placeTable.updatedAt,
      revision: placeTable.revision,
      viewCount: placeTable.viewCount,
      ratingCount: placeTable.ratingCount,
      logoPath: mediaTable.localPath,
      coverMediaId: placeTable.coverMediaId,
    })
    .from(placeTable)
    .leftJoin(placeBrandTable, eq(placeBrandTable.id, placeTable.brandId))
    .leftJoin(mediaTable, eq(mediaTable.id, placeTable.logoMediaId))
    .where(eq(placeTable.id, placeId))
    .limit(1)

  if (!place) return null

  const [phones, socials, hours, sections, items, variants, attributeRows, photos] = await Promise.all([
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
      .select({
        id: menuSectionTable.id,
        name: menuSectionTable.name,
        facetId: menuSectionTable.facetId,
        branchScope: menuSectionTable.branchScope,
        imagePath: mediaTable.localPath,
      })
      .from(menuSectionTable)
      .leftJoin(mediaTable, eq(mediaTable.id, menuSectionTable.mediaId))
      .where(and(
        eq(menuSectionTable.placeId, placeId),
        options.includeForeignBranchSections
          ? sql`TRUE`
          : inArray(menuSectionTable.branchScope, ['shared', 'branch']),
      ))
      .orderBy(menuSectionTable.sortOrder),
    db
      .select({
        id: menuItemTable.id,
        publicId: menuItemTable.publicId,
        sectionId: menuItemTable.sectionId,
        name: menuItemTable.name,
        description: menuItemTable.description,
        price: menuItemTable.price,
        priceUnknown: menuItemTable.priceUnknown,
        excludeFromPriceStats: menuItemTable.excludeFromPriceStats,
        available: menuItemTable.available,
        featured: menuItemTable.featured,
        archivedAt: menuItemTable.archivedAt,
        priceUpdatedAt: menuItemTable.priceUpdatedAt,
        imagePath: mediaTable.localPath,
      })
      .from(menuItemTable)
      .innerJoin(menuSectionTable, eq(menuSectionTable.id, menuItemTable.sectionId))
      .leftJoin(mediaTable, eq(mediaTable.id, menuItemTable.mediaId))
      .where(and(
        eq(menuItemTable.placeId, placeId),
        options.includeForeignBranchSections
          ? sql`TRUE`
          : inArray(menuSectionTable.branchScope, ['shared', 'branch']),
      ))
      .orderBy(menuItemTable.sortOrder),
    db
      .select({
        id: menuItemVariantTable.id,
        itemId: menuItemVariantTable.itemId,
        label: menuItemVariantTable.label,
        price: menuItemVariantTable.price,
        available: menuItemVariantTable.available,
        sortOrder: menuItemVariantTable.sortOrder,
        priceUpdatedAt: menuItemVariantTable.priceUpdatedAt,
      })
      .from(menuItemVariantTable)
      .innerJoin(menuItemTable, eq(menuItemTable.id, menuItemVariantTable.itemId))
      .innerJoin(menuSectionTable, eq(menuSectionTable.id, menuItemTable.sectionId))
      .where(and(
        eq(menuItemTable.placeId, placeId),
        options.includeForeignBranchSections
          ? sql`TRUE`
          : inArray(menuSectionTable.branchScope, ['shared', 'branch']),
      ))
      .orderBy(menuItemVariantTable.sortOrder, menuItemVariantTable.id),
    db
      .select({
        attributeId: placeAttributeTable.attributeId,
        value: placeAttributeTable.value,
      })
      .from(placeAttributeTable)
      .where(eq(placeAttributeTable.placeId, placeId)),
    db
      .select({
        id: placePhotoTable.id,
        mediaId: placePhotoTable.mediaId,
        alt: placePhotoTable.alt,
        sortOrder: placePhotoTable.sortOrder,
        path: mediaTable.localPath,
        width: mediaTable.width,
        height: mediaTable.height,
      })
      .from(placePhotoTable)
      .innerJoin(mediaTable, eq(mediaTable.id, placePhotoTable.mediaId))
      .where(and(eq(placePhotoTable.placeId, placeId), eq(mediaTable.status, 'ok')))
      .orderBy(placePhotoTable.sortOrder, placePhotoTable.id),
  ])

  const variantsByItem = new Map<number, OwnerPlaceData['sections'][number]['items'][number]['variants']>()
  for (const variant of variants) {
    const view = {
      id: variant.id,
      label: variant.label,
      price: variant.price,
      available: variant.available,
      sortOrder: variant.sortOrder,
      priceUpdatedAt: variant.priceUpdatedAt,
    }
    const list = variantsByItem.get(variant.itemId)
    if (list) list.push(view)
    else variantsByItem.set(variant.itemId, [view])
  }

  const itemsBySection = new Map<number, OwnerPlaceData['sections'][number]['items']>()
  for (const item of items) {
    const view = {
      id: item.id,
      publicId: item.publicId,
      name: item.name,
      description: item.description,
      price: item.price,
      priceUnknown: item.priceUnknown,
      excludeFromPriceStats: item.excludeFromPriceStats,
      available: item.available,
      featured: item.featured,
      archivedAt: item.archivedAt,
      imageUrl: item.imagePath ? `/${item.imagePath}` : null,
      priceUpdatedAt: item.priceUpdatedAt,
      variants: variantsByItem.get(item.id) ?? [],
    }
    const list = itemsBySection.get(item.sectionId)
    if (list) list.push(view)
    else itemsBySection.set(item.sectionId, [view])
  }

  const attributes: Record<string, number> = {}
  for (const row of attributeRows) attributes[row.attributeId] = row.value

  return {
    ...place,
    lat: place.lat ? Number(place.lat) : null,
    lng: place.lng ? Number(place.lng) : null,
    logoUrl: place.logoPath ? `/${place.logoPath}` : null,
    photos: photos.flatMap((photo) => photo.path ? [{
      id: photo.id,
      mediaId: photo.mediaId,
      url: `/${photo.path}`,
      fullUrl: mediaFullUrl(photo.path)!,
      alt: photo.alt,
      sortOrder: photo.sortOrder,
      width: photo.width,
      height: photo.height,
    }] : []),
    phones: phones.map((row) => row.phone),
    attributes,
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
      facetId: section.facetId,
      imageUrl: mediaPublicUrl(section.imagePath),
      imageFullUrl: mediaFullUrl(section.imagePath),
      branchScope: section.branchScope,
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
    .select({ reviewId: reviewReply.reviewId, text: reviewReply.text, status: reviewReply.status })
    .from(reviewReply)
    // `inArray` نه `sql.join`: دومی روی آرایه‌ی نگاشت‌شده، استنتاج تایپ را
    // منفجر می‌کند (tsc با out-of-memory می‌ترکد).
    .where(inArray(reviewReply.reviewId, reviews.map((review) => review.id)))

  const reviewItems = await db.select({ reviewId: reviewItemTable.reviewId, name: menuItemTable.name })
    .from(reviewItemTable).innerJoin(menuItemTable, eq(menuItemTable.id, reviewItemTable.menuItemId))
    .where(inArray(reviewItemTable.reviewId, reviews.map((review) => review.id)))
  const itemsByReview = new Map<number, string[]>()
  for (const item of reviewItems) itemsByReview.set(item.reviewId, [...(itemsByReview.get(item.reviewId) ?? []), item.name])

  const byReview = new Map<number, string[]>()
  for (const reply of replies) {
    const list = byReview.get(reply.reviewId)
    if (list) list.push(reply.text)
    else byReview.set(reply.reviewId, [reply.text])
  }

  return reviews.map((review) => ({ ...review, replies: byReview.get(review.id) ?? [], replyDetails: replies.filter(reply => reply.reviewId === review.id).map(reply => ({ text: reply.text, status: reply.status })), itemNames: itemsByReview.get(review.id) ?? [] }))
}
