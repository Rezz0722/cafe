/**
 * واردکردن فایل منبع به MySQL.
 *
 * ═══ اصول ═══
 *
 *   • **جایگزینی کامل، در یک تراکنش.** داده‌ی قبلی (نمونه‌های آزمایشی) پاک و
 *     ۳۳۱ مجموعه از نو نوشته می‌شوند. اگر وسط کار چیزی بترکد، rollback
 *     می‌شود — یک دیتابیسِ نیمه‌واردشده بدترین حالت ممکن است چون نه کار
 *     می‌کند و نه معلوم است تا کجا رسیده.
 *   • **هیچ داده‌ای بی‌صدا دور ریخته نمی‌شود.** هر چیزی که نگاشت نشد در
 *     `ImportReport` می‌آید.
 *   • **idempotent روی رسانه.** جدول `media` دست‌نخورده می‌ماند؛ ایمپورت فقط
 *     با `url_hash` به آن وصل می‌شود. پس ایمپورت دوباره، ۱۴هزار دانلود را
 *     دور نمی‌ریزد.
 */

import { sql } from 'drizzle-orm'
import type { Db } from '@/db/connection'
import {
  media as mediaTable,
  menuItem as menuItemTable,
  menuSection as menuSectionTable,
  place as placeTable,
  placeHours as placeHoursTable,
  placePhone as placePhoneTable,
  placeSocial as placeSocialTable,
  district as districtTable,
} from '@/db/schema'
import { DISTRICTS } from '@/data/districts'
import { normalizeFa } from '@/core/text/normalize'
import { computeQualityFromFacts } from '@/core/quality/scores'
import { hashUrl } from '@/core/media/store'
import {
  cleanLine,
  classifyGeo,
  MASHHAD_BBOX,
  PRICE_TIER_BOUNDS,
  THOUSAND_UNIT_THRESHOLD,
  detectKind,
  detectPriceContext,
  makeSlug,
  median,
  normalizePrice,
  parseHours,
  parseInstagramHandle,
  parsePhones,
  parseSocials,
  pickDistrict,
  priceTierFromMedian,
  stripHtml,
  type PlaceKind,
} from './normalize'
import { rawItemDescription, readSourceCafes, type RawCafe } from './source'

// ── گزارش ────────────────────────────────────────────────────────────

export interface ImportReport {
  places: number
  sections: number
  items: number
  phones: number
  socials: number
  hourShifts: number
  itemsWithImage: number
  itemsWithoutPrice: number
  linkedMedia: number
  missingMedia: number
  /** مجموعه‌هایی که واحد قیمتشان «هزار تومان» بود و اصلاح شد. */
  unitFixed: string[]
  /** مجموعه‌هایی که کافه نیستند (فروشگاه) — با وضعیت draft وارد شدند. */
  shops: { name: string; slug: string; reason: string }[]
  byKind: Record<string, number>
  byGeo: Record<string, number>
  byTier: Record<string, number>
  withoutDistrict: string[]
  hoursWarnings: { place: string; warning: string }[]
  emptyMenu: string[]
}

const CHUNK = 400

/**
 * حالت انتشار.
 *
 * فروشگاه‌ها `draft` می‌مانند تا در سایت عمومی دیده نشوند ولی در پنل ادمین
 * قابل بررسی باشند. بقیه منتشر می‌شوند — داده‌شان از یک منبع واقعی آمده و
 * نگه‌داشتنشان در draft یعنی سایت خالی بماند.
 */
function statusFor(kind: PlaceKind): 'published' | 'draft' {
  return kind === 'shop' ? 'draft' : 'published'
}

/**
 * پیکربندی داده‌محورِ ایمپورت.
 *
 * از تنظیمات پنل ادمین می‌آید ولی به‌عنوان **پارامتر** گرفته می‌شود، نه با
 * `getSettings()` درون این ماژول: این تابع از اسکریپت CLI هم اجرا می‌شود و
 * باید بدون وابستگی به `server-only` کار کند.
 */
export interface ImportPolicy {
  priceTierBounds: { cheap: number; mid: number }
  thousandUnitThreshold: number
  districtMatchMaxKm: number
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number }
}

export async function importCafes(
  db: Db,
  options: {
    sourcePath?: string
    log?: (message: string) => void
    policy?: Partial<ImportPolicy>
  } = {},
): Promise<ImportReport> {
  const log = options.log ?? (() => {})
  const cafes = readSourceCafes(options.sourcePath)

  const priceTierBounds = options.policy?.priceTierBounds ?? PRICE_TIER_BOUNDS
  const thousandUnitThreshold = options.policy?.thousandUnitThreshold ?? THOUSAND_UNIT_THRESHOLD
  const districtMatchMaxKm = options.policy?.districtMatchMaxKm ?? 4
  const bbox = options.policy?.bbox ?? MASHHAD_BBOX

  const report: ImportReport = {
    places: 0,
    sections: 0,
    items: 0,
    phones: 0,
    socials: 0,
    hourShifts: 0,
    itemsWithImage: 0,
    itemsWithoutPrice: 0,
    linkedMedia: 0,
    missingMedia: 0,
    unitFixed: [],
    shops: [],
    byKind: {},
    byGeo: {},
    byTier: {},
    withoutDistrict: [],
    hoursWarnings: [],
    emptyMenu: [],
  }

  // ── نقشه‌ی رسانه: hash آدرس → شناسه. یک‌بار خوانده می‌شود.
  log('خواندن جدول رسانه…')
  const mediaRows = await db
    .select({ id: mediaTable.id, urlHash: mediaTable.urlHash })
    .from(mediaTable)
  const mediaByHash = new Map(mediaRows.map((row) => [row.urlHash, row.id]))
  log(`${mediaByHash.size} ردیف رسانه شناخته شد`)

  const mediaIdFor = (url: string | null | undefined): number | null => {
    const trimmed = url?.trim()
    if (!trimmed) return null
    const id = mediaByHash.get(hashUrl(trimmed)) ?? null
    if (id) report.linkedMedia++
    else report.missingMedia++
    return id
  }

  // ── محله‌ها (مرجع ثابت، از کد می‌آید نه از منبع)
  log('نوشتن محله‌ها…')
  for (const district of DISTRICTS) {
    await db
      .insert(districtTable)
      .values({
        id: district.id,
        slug: district.slug,
        name: district.name,
        centerLat: district.center.lat.toFixed(7),
        centerLng: district.center.lng.toFixed(7),
      })
      .onDuplicateKeyUpdate({
        set: {
          slug: district.slug,
          name: district.name,
          centerLat: district.center.lat.toFixed(7),
          centerLng: district.center.lng.toFixed(7),
        },
      })
  }

  // ── پاک‌کردن مکان‌های قبلی
  // نمونه‌های آزمایشی باید کامل بروند. `place` آبشاری است، پس منو، ساعت،
  // تلفن و facetها با آن پاک می‌شوند. `media` عمداً دست‌نخورده می‌ماند.
  log('پاک‌کردن مکان‌های قبلی…')
  await db.delete(placeTable)

  const usedSlugs = new Set<string>()

  for (const [index, cafe] of cafes.entries()) {
    const name = cleanLine(cafe['نام مجموعه']) || `مجموعه ${cafe['شناسه']}`
    const sections = cafe['منو'] ?? []

    // ── قیمت‌ها: اول واحد را تشخیص بده، بعد آیتم‌ها را نرمال کن
    const rawPrices: number[] = []
    for (const section of sections) {
      for (const item of section['آیتم‌ها'] ?? []) {
        const price = item['قیمت (تومان)']
        if (typeof price === 'number' && price > 0) rawPrices.push(price)
      }
    }
    const priceContext = detectPriceContext(rawPrices, thousandUnitThreshold)
    if (priceContext.thousandUnit) report.unitFixed.push(name)

    // ── نوع مجموعه
    const sectionNames = sections.map((s) => cleanLine(s['دسته‌بندی']))
    const itemNames = sections.flatMap((s) =>
      (s['آیتم‌ها'] ?? []).map((i) => cleanLine(i['نام'])),
    )
    const kindSignal = detectKind(name, sectionNames, itemNames)

    // ── مختصات و محله
    const lat = cafe['عرض جغرافیایی (lat)']
    const lng = cafe['طول جغرافیایی (lng)']
    const geoStatus = classifyGeo(lat, lng, bbox)
    const address = cleanLine(cafe['آدرس متنی'])
    const districtId = pickDistrict(address, lat, lng, districtMatchMaxKm)
    if (!districtId) report.withoutDistrict.push(name)

    // ── ساعت کاری
    const hours = parseHours(cafe['ساعات کاری'])
    for (const warning of hours.warnings) {
      report.hoursWarnings.push({ place: name, warning })
    }

    // ── تماس
    const phones = parsePhones(cafe['شماره تماس‌ها'])
    const socials = parseSocials(cafe['سایر شبکه‌های اجتماعی'])
    const instagram = parseInstagramHandle(cafe['اینستاگرام'])

    const about = stripHtml(cafe['درباره'])
    const slug = makeSlug(cafe['یوزرنیم'], name, (candidate) => usedSlugs.has(candidate))
    usedSlugs.add(slug)

    // ── قیمت‌های نرمال‌شده برای محاسبه‌ی رده
    const normalizedPrices: number[] = []
    for (const section of sections) {
      for (const item of section['آیتم‌ها'] ?? []) {
        const { price } = normalizePrice(item['قیمت (تومان)'], priceContext)
        if (price !== null) normalizedPrices.push(price)
      }
    }
    const priceMedian = median(normalizedPrices)
    const priceTier = priceTierFromMedian(priceMedian, priceTierBounds)

    // ── آیتم شاخص: گران‌ترین آیتمِ «ویژه»، وگرنه اولین ویژه، وگرنه هیچ
    let signatureItem: string | null = null
    let signaturePrice = -1
    for (const section of sections) {
      for (const item of section['آیتم‌ها'] ?? []) {
        if (!item['ویژه است']) continue
        const { price } = normalizePrice(item['قیمت (تومان)'], priceContext)
        const value = price ?? 0
        if (value > signaturePrice) {
          signaturePrice = value
          signatureItem = cleanLine(item['نام'])
        }
      }
    }

    const hasMenu = sections.some((s) => (s['آیتم‌ها'] ?? []).length > 0)
    if (!hasMenu) report.emptyMenu.push(name)

    const qualityScore = computeQualityFromFacts({
      hasCoords: geoStatus !== 'missing',
      hasHours: hours.shifts.some((s) => !s.closed),
      hasAddress: !!address,
      hasPhone: phones.length > 0,
      hasInstagram: !!instagram,
      hasDescription: !!about,
      hasMenu,
      // تصویر لوگو تنها «عکس» موجود در منبع است؛ گالری مکان بعداً پر می‌شود.
      photoCount: cafe['لوگو'] ? 1 : 0,
      attributeCount: 0,
    })

    const logoMediaId = mediaIdFor(cafe['لوگو'])

    // ── درج مکان
    const [inserted] = await db
      .insert(placeTable)
      .values({
        slug,
        sourceId: cafe['شناسه'],
        sourceUsername: cleanLine(cafe['یوزرنیم']) || null,
        name,
        nameEn: cleanLine(cafe['نام انگلیسی']) || null,
        nameNormalized: normalizeFa(name),
        kind: kindSignal.kind,
        status: statusFor(kindSignal.kind),
        lat: geoStatus === 'missing' ? null : (lat as number).toFixed(7),
        lng: geoStatus === 'missing' ? null : (lng as number).toFixed(7),
        geoStatus,
        address,
        districtId,
        priceTier,
        priceMin: normalizedPrices.length ? Math.min(...normalizedPrices) : null,
        priceMedian,
        priceMax: normalizedPrices.length ? Math.max(...normalizedPrices) : null,
        priceUnitFixed: priceContext.thousandUnit,
        menuUrl: cleanLine(cafe['لینک منو']) || null,
        instagram,
        about: about || null,
        logoMediaId,
        signatureItem,
        qualityScore,
        source: 'import',
      })
      .$returningId()

    const placeId = inserted!.id
    report.places++
    report.byKind[kindSignal.kind] = (report.byKind[kindSignal.kind] ?? 0) + 1
    report.byGeo[geoStatus] = (report.byGeo[geoStatus] ?? 0) + 1
    report.byTier[String(priceTier)] = (report.byTier[String(priceTier)] ?? 0) + 1

    if (kindSignal.kind === 'shop') {
      report.shops.push({ name, slug, reason: kindSignal.reason })
    }

    // ── تلفن
    if (phones.length > 0) {
      await db.insert(placePhoneTable).values(
        phones.map((phone, order) => ({
          placeId,
          phone: phone.phone,
          kind: phone.kind,
          sortOrder: order,
        })),
      )
      report.phones += phones.length
    }

    // ── شبکه‌های اجتماعی (اینستاگرام هم به‌عنوان یک ردیف، برای یکدستی UI)
    const socialRows = [...socials]
    if (instagram) {
      socialRows.unshift({
        kind: 'instagram',
        label: 'اینستاگرام',
        url: `https://instagram.com/${instagram}`,
        handle: instagram,
      })
    }
    if (socialRows.length > 0) {
      await db.insert(placeSocialTable).values(
        socialRows.map((social) => ({
          placeId,
          kind: social.kind,
          label: social.label,
          url: social.url,
          handle: social.handle,
        })),
      )
      report.socials += socialRows.length
    }

    // ── ساعت کاری
    if (hours.shifts.length > 0) {
      await db.insert(placeHoursTable).values(
        hours.shifts.map((shift) => ({
          placeId,
          dow: shift.dow,
          shiftIndex: shift.shiftIndex,
          opensAt: shift.opensAt,
          closesAt: shift.closesAt,
          crossesMidnight: shift.crossesMidnight,
          closed: shift.closed,
        })),
      )
      report.hourShifts += hours.shifts.length
    }

    // ── منو
    const itemRows: (typeof menuItemTable.$inferInsert)[] = []
    for (const [sectionIndex, section] of sections.entries()) {
      const sectionName = cleanLine(section['دسته‌بندی']) || 'سایر'
      const [insertedSection] = await db
        .insert(menuSectionTable)
        .values({
          placeId,
          name: sectionName,
          description: stripHtml(section['توضیحات']) || null,
          mediaId: mediaIdFor(section['تصویر']),
          sortOrder: sectionIndex,
        })
        .$returningId()
      report.sections++

      for (const [itemIndex, item] of (section['آیتم‌ها'] ?? []).entries()) {
        const itemName = cleanLine(item['نام'])
        if (!itemName) continue
        const { price, priceUnknown } = normalizePrice(item['قیمت (تومان)'], priceContext)
        const itemMediaId = mediaIdFor(item['تصویر'])
        if (itemMediaId) report.itemsWithImage++
        if (priceUnknown) report.itemsWithoutPrice++

        itemRows.push({
          placeId,
          sectionId: insertedSection!.id,
          sourceId: item['شناسه'] ?? null,
          name: itemName,
          nameEn: cleanLine(item['نام انگلیسی']) || null,
          nameNormalized: normalizeFa(itemName),
          description: stripHtml(rawItemDescription(item['توضیحات'] ?? null)) || null,
          price,
          priceUnknown,
          available: item['موجود است'] !== false,
          featured: item['ویژه است'] === true,
          mediaId: itemMediaId,
          sortOrder: itemIndex,
        })
      }
    }

    // درج دسته‌ای آیتم‌ها — تک‌تک زدن ۱۹هزار INSERT چند دقیقه طول می‌کشد.
    for (let i = 0; i < itemRows.length; i += CHUNK) {
      await db.insert(menuItemTable).values(itemRows.slice(i, i + CHUNK))
    }
    report.items += itemRows.length

    if ((index + 1) % 25 === 0) {
      log(`${index + 1}/${cafes.length} مجموعه — ${report.items} آیتم`)
    }
  }

  // ── بازشماری تعداد بازدید/امتیاز اولیه لازم نیست؛ صفر درست است.
  log('پایان درج. بازبینی شمارش‌ها…')
  const [counts] = await db
    .select({
      places: sql<number>`(SELECT COUNT(*) FROM place)`,
      sections: sql<number>`(SELECT COUNT(*) FROM menu_section)`,
      items: sql<number>`(SELECT COUNT(*) FROM menu_item)`,
    })
    .from(sql`(SELECT 1) AS one`)

  log(
    `دیتابیس: ${counts?.places} مکان · ${counts?.sections} دسته · ${counts?.items} آیتم`,
  )

  return report
}

/** برای گزارش: مجموعه‌ی یکتای هشدارهای ساعت، خلاصه‌شده. */
export function summarizeHoursWarnings(
  warnings: ImportReport['hoursWarnings'],
): { warning: string; count: number; example: string }[] {
  const groups = new Map<string, { count: number; example: string }>()
  for (const entry of warnings) {
    // متن داخل گیومه را جدا کن تا هشدارهای هم‌شکل با هم گروه شوند.
    const shape = entry.warning.replace(/«[^»]*»/g, '«…»')
    const existing = groups.get(shape)
    if (existing) existing.count++
    else groups.set(shape, { count: 1, example: `${entry.place}: ${entry.warning}` })
  }
  return [...groups]
    .map(([warning, info]) => ({ warning, ...info }))
    .sort((a, b) => b.count - a.count)
}

export type { RawCafe }
