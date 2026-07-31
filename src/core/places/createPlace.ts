/**
 * ساخت `Place` از ورودی فرم، با اعتبارسنجی.
 *
 * منطق اینجاست نه داخل server action، تا بشود جدا تستش کرد. action فقط
 * اعتبارسنجی می‌کند و ذخیره؛ هیچ قاعده‌ای داخلش نیست.
 */

import type { AttributeValue, DataSource, Place, PlaceKind, PriceTier } from './types'
import { normalizePlaceName, normalizeFa } from '@/core/text/normalize'
import { isKnownAttribute } from '@/core/taxonomy/attributes'
import { makeSlug, normalizePhone } from '@/core/import/mapping'
import { DISTRICT_BY_ID } from '@/data/districts'

export interface NewPlaceInput {
  name: string
  nameEn?: string
  districtId: string
  address: string
  kind: PlaceKind
  priceTier: PriceTier
  phone?: string
  instagram?: string
  description?: string
  signatureItem?: string
  /** شناسه‌ی ویژگی → درجه (۰ نه · ۱ تاحدی · ۲ بله). */
  attributes: Record<string, AttributeValue>
  highlights?: string[]
  /** منبع داده — مستقیماً روی اطمینان و امتیاز تازگی اثر دارد. */
  source: DataSource
  /** ساعت کاری یکنواخت هفتگی؛ خالی یعنی ثبت‌نشده. */
  opensAt?: string
  closesAt?: string
}

export interface ValidationError {
  field: string
  message: string
}

/** اطمینان بر اساس منبع — ادعای مالک و مشاهده‌ی میدانی وزن یکسان ندارند. */
const CONFIDENCE_BY_SOURCE: Record<DataSource, number> = {
  field_visit: 90,
  owner: 65,
  instagram: 55,
  user: 50,
  inferred: 40,
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export function validateNewPlace(input: NewPlaceInput): ValidationError[] {
  const errors: ValidationError[] = []

  const name = (input.name ?? '').trim()
  if (!name) errors.push({ field: 'name', message: 'نام کافه لازم است.' })
  else if (name.length > 120) errors.push({ field: 'name', message: 'نام خیلی بلند است.' })

  if (!input.districtId) {
    errors.push({ field: 'districtId', message: 'محله را انتخاب کنید.' })
  } else if (!DISTRICT_BY_ID.has(input.districtId)) {
    errors.push({ field: 'districtId', message: 'محله‌ی انتخاب‌شده معتبر نیست.' })
  }

  if (!(input.address ?? '').trim()) {
    errors.push({ field: 'address', message: 'آدرس لازم است.' })
  }

  if (![1, 2, 3].includes(input.priceTier)) {
    errors.push({ field: 'priceTier', message: 'سطح قیمت معتبر نیست.' })
  }

  if (!['cafe', 'cafe_restaurant', 'restaurant'].includes(input.kind)) {
    errors.push({ field: 'kind', message: 'نوع مکان معتبر نیست.' })
  }

  // تلفن اختیاری است، ولی اگر داده شد باید معتبر باشد — شماره‌ی غلط از
  // نبودِ شماره بدتر است.
  if ((input.phone ?? '').trim() && !normalizePhone(input.phone)) {
    errors.push({
      field: 'phone',
      message: 'شماره‌ی تلفن معتبر نیست. اگر مطمئن نیستید خالی بگذارید.',
    })
  }

  const hasOpen = Boolean((input.opensAt ?? '').trim())
  const hasClose = Boolean((input.closesAt ?? '').trim())
  if (hasOpen !== hasClose) {
    errors.push({ field: 'hours', message: 'هر دو ساعت باز و بسته شدن را وارد کنید.' })
  }
  if (hasOpen && !TIME_RE.test(input.opensAt!.trim())) {
    errors.push({ field: 'opensAt', message: 'ساعت باید به شکل HH:MM باشد.' })
  }
  if (hasClose && !TIME_RE.test(input.closesAt!.trim())) {
    errors.push({ field: 'closesAt', message: 'ساعت باید به شکل HH:MM باشد.' })
  }

  return errors
}

/**
 * `Place` می‌سازد. فرض بر این است که `validateNewPlace` قبلاً پاس شده.
 *
 * `slugTaken` را صدا زننده می‌دهد تا این تابع خالص بماند (بدون I/O) و
 * قابل تست باشد.
 */
export function buildPlace(
  input: NewPlaceInput,
  opts: { slugTaken?: (slug: string) => boolean; now?: Date } = {},
): Place {
  const now = opts.now ?? new Date()
  const iso = now.toISOString()
  const name = input.name.trim()
  const confidence = CONFIDENCE_BY_SOURCE[input.source] ?? 50

  // slug یکتا — اگر گرفته شده بود عدد اضافه می‌شود، نه اینکه بازنویسی شود.
  let slug = makeSlug(input.nameEn ?? '', name, Math.floor(now.getTime() / 1000))
  if (opts.slugTaken?.(slug)) {
    let n = 2
    while (opts.slugTaken(`${slug}-${n}`)) n += 1
    slug = `${slug}-${n}`
  }

  const attributes = Object.entries(input.attributes ?? {})
    .filter(([id, value]) => isKnownAttribute(id) && value >= 0 && value <= 2)
    .map(([attributeId, value]) => ({
      attributeId,
      value,
      confidence,
      // فقط بازدید میدانی «تأیید» حساب می‌شود؛ بقیه ادعای گزارش‌شده‌اند.
      source: input.source,
      verifiedAt: input.source === 'field_visit' ? iso : null,
    }))

  const hours =
    input.opensAt?.trim() && input.closesAt?.trim()
      ? Array.from({ length: 7 }, (_, dow) => ({
          dow,
          opensAt: input.opensAt!.trim(),
          closesAt: input.closesAt!.trim(),
          crossesMidnight: input.closesAt!.trim() < input.opensAt!.trim(),
          closed: false,
        }))
      : []

  const provenance = [
    { field: 'address', source: input.source, confidence, observedAt: iso },
    { field: 'attributes', source: input.source, confidence, observedAt: iso },
  ]
  const phone = normalizePhone(input.phone)
  if (phone) provenance.push({ field: 'phone', source: input.source, confidence, observedAt: iso })
  if (hours.length) {
    provenance.push({ field: 'hours', source: input.source, confidence, observedAt: iso })
  }

  const district = DISTRICT_BY_ID.get(input.districtId)

  return {
    id: `custom-${now.getTime()}`,
    slug,
    name,
    nameNormalized: normalizePlaceName(name),
    kind: input.kind,
    status: 'published',
    mergedInto: null,
    // مثل import، مرکز محله. مختصات دقیق فقط با بازدید میدانی می‌آید.
    coords: district ? district.center : null,
    address: input.address.trim(),
    districtId: input.districtId,
    priceTier: input.priceTier,
    phone,
    instagram: (input.instagram ?? '').trim().replace(/^@/, '') || null,
    ratingSum: 0,
    ratingCount: 0,
    attributes,
    hours,
    hoursExceptions: [],
    menu: [],
    reviews: [],
    photos: [],
    provenance,
    description: (input.description ?? '').trim() || undefined,
    highlights: (input.highlights ?? []).map((h) => h.trim()).filter(Boolean),
    signatureItem: (input.signatureItem ?? '').trim() || undefined,
    lastVerifiedAt: input.source === 'field_visit' ? iso : null,
    createdAt: iso,
    updatedAt: iso,
  }
}

/**
 * کاندیدهای تکراری را پیدا می‌کند — قدم اول dedupe (بخش ۳ سند معماری).
 *
 * اینجا فقط روی نامِ نرمال‌شده و محله کار می‌کند. blocking جغرافیایی وقتی
 * معنی پیدا می‌کند که مختصات واقعیِ هر کافه را داشته باشیم، نه مرکز محله.
 */
export function findDuplicateCandidates(
  name: string,
  districtId: string,
  existing: { slug: string; name: string; nameNormalized: string; districtId: string }[],
): { slug: string; name: string }[] {
  const target = normalizePlaceName(name)
  if (!target) return []

  return existing
    .filter((p) => {
      if (p.districtId !== districtId) return false
      const other = p.nameNormalized || normalizeFa(p.name)
      return other === target || other.includes(target) || target.includes(other)
    })
    .map((p) => ({ slug: p.slug, name: p.name }))
}
