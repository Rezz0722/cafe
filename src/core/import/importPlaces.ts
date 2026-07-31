/**
 * تبدیل رکورد خام ورودی به `Place`، همراه با اعتبارسنجی.
 *
 * فلسفه‌ی این ماژول: **هیچ‌وقت داده‌ی مشکوک را بی‌صدا نپذیر و هیچ‌وقت بی‌صدا
 * دور نریز.** هر رکورد یا وارد می‌شود یا رد می‌شود، و هر تصمیم با دلیلش
 * گزارش می‌شود. import بی‌صدا همان چیزی است که دیتابیس را در شش ماه فاسد
 * می‌کند بدون اینکه کسی بفهمد.
 */

import type { Place, PlaceAttribute, FieldProvenance } from '@/core/places/types'
import { normalizePlaceName } from '@/core/text/normalize'
import { DISTRICT_BY_ID } from '@/data/districts'
import {
  makeSlug,
  mapAmenities,
  mapArea,
  mapCategory,
  mapPriceRange,
  normalizePhone,
} from './mapping'

/** شکل رکورد در `Mashhad_Cafes_Database.json`. */
export interface RawCafe {
  id: number
  name_fa: string
  name_en?: string
  area: string
  address?: string
  category?: string
  price_range?: string
  amenities?: string[]
  signature_item?: string
  phone?: string
}

export interface ImportIssue {
  rawId: number
  name: string
  field: string
  reason: string
  severity: 'rejected' | 'warning'
}

export interface ImportResult {
  places: Place[]
  issues: ImportIssue[]
  stats: {
    total: number
    imported: number
    rejected: number
    phonesDropped: number
    unmappedAreas: number
    attributesMapped: number
    highlightsKept: number
    withoutCoords: number
  }
}

/**
 * منبع همه‌ی داده‌ی این import.
 *
 * `instagram` نیست چون فایل ندارد؛ `field_visit` هم نیست چون کسی این‌ها را
 * حضوری ندیده. صادق‌ترین برچسب `inferred` است: از یک فایل موجود آمده،
 * تأیید نشده. همین باعث می‌شود امتیاز تازگی و اطمینان واقع‌بینانه بماند.
 */
const SOURCE = 'inferred' as const
const CONFIDENCE = 45

export function importPlaces(raw: RawCafe[], now = new Date()): ImportResult {
  const places: Place[] = []
  const issues: ImportIssue[] = []
  const seenSlugs = new Set<string>()

  let phonesDropped = 0
  let unmappedAreas = 0
  let attributesMapped = 0
  let highlightsKept = 0
  let withoutCoords = 0

  const iso = now.toISOString()

  for (const rec of raw) {
    const name = (rec.name_fa || '').trim()

    if (!name) {
      issues.push({
        rawId: rec.id,
        name: '(بدون نام)',
        field: 'name_fa',
        reason: 'نام خالی — رکورد بدون نام قابل استفاده نیست',
        severity: 'rejected',
      })
      continue
    }

    // ── محله ──
    const districtId = mapArea(rec.area)
    if (!districtId) {
      unmappedAreas += 1
      issues.push({
        rawId: rec.id,
        name,
        field: 'area',
        reason: `محله‌ی «${rec.area}» در جدول محله‌ها نیست — رکورد رد شد`,
        severity: 'rejected',
      })
      continue
    }
    const district = DISTRICT_BY_ID.get(districtId)

    // ── slug یکتا ──
    let slug = makeSlug(rec.name_en ?? '', name, rec.id)
    if (seenSlugs.has(slug)) {
      const unique = `${slug}-${rec.id}`
      issues.push({
        rawId: rec.id,
        name,
        field: 'slug',
        reason: `slug تکراری «${slug}» — به «${unique}» تغییر کرد`,
        severity: 'warning',
      })
      slug = unique
    }
    seenSlugs.add(slug)

    // ── تلفن ──
    const phone = normalizePhone(rec.phone)
    if (rec.phone && !phone) {
      phonesDropped += 1
      issues.push({
        rawId: rec.id,
        name,
        field: 'phone',
        reason: `تلفن نامعتبر «${rec.phone}» — وارد نشد (شماره‌ی غلط بدتر از نبود شماره است)`,
        severity: 'warning',
      })
    }

    // ── امکانات ──
    const { attributes: attrMap, highlights } = mapAmenities(rec.amenities ?? [])
    attributesMapped += attrMap.size
    highlightsKept += highlights.length

    const attributes: PlaceAttribute[] = [...attrMap].map(([attributeId, value]) => ({
      attributeId,
      value,
      confidence: CONFIDENCE,
      source: SOURCE,
      verifiedAt: null, // هیچ‌کس این را تأیید نکرده
    }))

    // ── مختصات ──
    // فایل ورودی مختصات ندارد. مرکز محله را می‌گذاریم تا نقشه و سورت فاصله
    // در سطح محله کار کند، ولی با اطمینان پایین ثبت می‌شود و در provenance
    // به‌عنوان inferred می‌آید — تا کسی فکر نکند این موقعیت دقیق کافه است.
    withoutCoords += 1
    const coords = district ? district.center : null

    const provenance: FieldProvenance[] = [
      { field: 'address', source: SOURCE, confidence: CONFIDENCE, observedAt: iso },
      { field: 'attributes', source: SOURCE, confidence: CONFIDENCE, observedAt: iso },
    ]
    if (phone) {
      provenance.push({ field: 'phone', source: SOURCE, confidence: CONFIDENCE, observedAt: iso })
    }

    places.push({
      id: `import-${rec.id}`,
      slug,
      name,
      nameNormalized: normalizePlaceName(name),
      kind: mapCategory(rec.category ?? '', rec.signature_item ?? ''),
      status: 'published',
      mergedInto: null,
      coords,
      address: (rec.address ?? '').trim(),
      districtId,
      priceTier: mapPriceRange(rec.price_range ?? ''),
      phone,
      instagram: null,

      // بدون نظر وارد می‌شوند. ساختن امتیاز جعلی، همان چیزی است که کل
      // ارزش «امتیاز واقعی محلی‌ها» را از بین می‌برد.
      ratingSum: 0,
      ratingCount: 0,

      attributes,
      hours: [], // فایل ورودی ساعت کاری ندارد
      hoursExceptions: [],
      menu: [],
      reviews: [],
      photos: [],
      provenance,

      description: rec.category?.trim() ? `${rec.category.trim()}` : undefined,
      highlights,
      signatureItem: rec.signature_item?.trim() || undefined,

      lastVerifiedAt: null, // ← هرگز تأیید نشده، و صفحه همین را نشان می‌دهد
      createdAt: iso,
      updatedAt: iso,
    })
  }

  return {
    places,
    issues,
    stats: {
      total: raw.length,
      imported: places.length,
      rejected: raw.length - places.length,
      phonesDropped,
      unmappedAreas,
      attributesMapped,
      highlightsKept,
      withoutCoords,
    },
  }
}
