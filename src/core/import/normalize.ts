/**
 * نرمال‌سازی داده‌ی خام منبع به مقادیر قابل ذخیره.
 *
 * همه‌ی توابع این فایل **خالص** (pure) هستند و به دیتابیس دست نمی‌زنند، تا
 * هرکدام جدا تست شوند. قواعد از تحلیل داده‌ی واقعی آمده‌اند
 * (`task/01-data-audit/`), نه از حدس؛ هرجا قاعده‌ای عجیب به‌نظر می‌رسد،
 * کامنتش می‌گوید کدام رکورد واقعی باعثش شده.
 */

import { normalizeFa, squashFa, toAsciiDigits } from '@/core/text/normalize'
import { DISTRICTS } from '@/data/districts'
import { distanceKm } from '@/core/geo/distance'

// ═══════════════════════════════════════════════════════════════════════
// متن
// ═══════════════════════════════════════════════════════════════════════

const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&zwnj;': '‌',
}

/**
 * حذف تگ HTML و decode موجودیت‌ها.
 *
 * ۶۴ رکورد «درباره» و بخش بزرگی از توضیحات آیتم‌ها HTML دارند
 * (`<p>`، `<br>`، `&nbsp;`). ذخیره‌ی خام آن یعنی یا تگ‌ها را به کاربر نشان
 * بدهیم یا با `dangerouslySetInnerHTML` رندر کنیم — دومی روی متنی که از
 * منبع بیرونی آمده، یک XSS آماده است.
 *
 * `<br>` و `</p>` به newline تبدیل می‌شوند تا پاراگراف‌بندی از دست نرود.
 */
export function stripHtml(input: string | null | undefined): string {
  if (!input) return ''
  let out = input
  out = out.replace(/<\s*br\s*\/?\s*>/gi, '\n')
  out = out.replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
  out = out.replace(/<[^>]*>/g, '')
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    out = out.split(entity).join(char)
  }
  out = out.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  // فاصله‌های افقی را جمع کن ولی newline را نگه دار
  out = out.replace(/[ \t ]+/g, ' ')
  out = out.replace(/\n{3,}/g, '\n\n')
  return out
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()
}

/** متن تک‌خطی برای فیلدهایی مثل نام دسته — newline در آن‌ها معنا ندارد. */
export function cleanLine(input: string | null | undefined): string {
  return stripHtml(input).replace(/\s+/g, ' ').trim()
}

// ═══════════════════════════════════════════════════════════════════════
// slug
// ═══════════════════════════════════════════════════════════════════════

/**
 * slug از **یوزرنیم منبع** ساخته می‌شود نه از نام.
 *
 * دلیل: ۷ نام تکراری در داده وجود دارد (`شوگر` سه بار، `دیزی سرای سعیدی` سه
 * بار) ولی یوزرنیم ۱۰۰٪ یکتاست. اگر slug از نام ساخته شود، آن ۷ مورد به هم
 * برخورد می‌کنند و باید با پسوند عددی از هم جدا شوند — که یعنی آدرس صفحه به
 * *ترتیب واردکردن* وابسته می‌شود و در ایمپورت بعدی جابه‌جا می‌شود.
 *
 * یوزرنیم‌ها لاتین‌اند (`jan_majnoon_lounge`) که برای URL هم بهتر است.
 */
export function makeSlug(
  username: string | null | undefined,
  name: string,
  isTaken: (slug: string) => boolean,
): string {
  const fromUsername = (username ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const base =
    fromUsername ||
    normalizeFa(name).replace(/\s+/g, '-').replace(/^-+|-+$/g, '') ||
    'cafe'

  if (!isTaken(base)) return base
  for (let i = 2; i < 200; i++) {
    const candidate = `${base}-${i}`
    if (!isTaken(candidate)) return candidate
  }
  throw new Error(`نمی‌توان slug یکتا ساخت برای «${name}»`)
}

// ═══════════════════════════════════════════════════════════════════════
// تلفن
// ═══════════════════════════════════════════════════════════════════════

export type PhoneKind = 'mobile' | 'landline' | 'reservation' | 'other'

export interface ParsedPhone {
  phone: string
  kind: PhoneKind
}

/** پیش‌شماره‌ی استان خراسان رضوی — برای شماره‌های ۸ رقمیِ بی‌کد. */
const MASHHAD_AREA_CODE = '051'

/**
 * جدا و نرمال‌کردن شماره‌ها.
 *
 * قواعد از داده: ۹۲ رکورد چند شماره دارند (با جداکننده‌های `,` `،` `/` `|`
 * `؛` `;` و فاصله‌ی خالی)، ۱۱ رکورد شماره‌ی **۸ رقمی بی‌پیش‌شماره** دارند که
 * بدون `051` قابل تماس نیست، و ۶۴ رکورد متنِ بی‌شماره دارند که دور ریخته
 * می‌شود.
 */
export function parsePhones(raw: string | null | undefined): ParsedPhone[] {
  if (!raw) return []
  const text = toAsciiDigits(raw)
  const parts = text
    .split(/[,،\/|؛;\n]+|\s{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  const seen = new Set<string>()
  const out: ParsedPhone[] = []

  for (const part of parts) {
    // کلمه‌ی «رزرو» کنار شماره یعنی خط رزرواسیون است، نه خط عادی.
    const isReservation = /رزرو|reserv/i.test(part)
    const digits = part.replace(/\D/g, '')
    if (digits.length < 8) continue

    let phone = digits
    if (/^9\d{9}$/.test(phone)) phone = `0${phone}` // 9xxxxxxxxx → 09xxxxxxxxx
    if (/^98\d{10}$/.test(phone)) phone = `0${phone.slice(2)}` // 98…  → 0…
    if (phone.length === 8) phone = `${MASHHAD_AREA_CODE}${phone}`

    let kind: PhoneKind = 'other'
    if (/^09\d{9}$/.test(phone)) kind = 'mobile'
    else if (/^0\d{10}$/.test(phone)) kind = 'landline'
    if (isReservation) kind = 'reservation'

    // شماره‌های خیلی بلند (مثل چند شماره‌ی به‌هم‌چسبیده) قابل اعتماد نیستند.
    if (phone.length > 13) continue
    if (seen.has(phone)) continue
    seen.add(phone)
    out.push({ phone, kind })
  }

  return out
}

// ═══════════════════════════════════════════════════════════════════════
// شبکه‌های اجتماعی
// ═══════════════════════════════════════════════════════════════════════

export type SocialKind =
  | 'instagram'
  | 'telegram'
  | 'whatsapp'
  | 'website'
  | 'reservation'
  | 'virtual_tour'
  | 'survey'
  | 'rubika'
  | 'eitaa'
  | 'bale'
  | 'other'

export interface ParsedSocial {
  kind: SocialKind
  label: string
  url: string
  handle: string | null
}

/** فقط handle نگه داشته می‌شود؛ URL در لایه‌ی نمایش ساخته می‌شود. */
export function parseInstagramHandle(raw: string | null | undefined): string | null {
  if (!raw) return null
  const text = raw.trim()
  if (!text) return null
  const match = text.match(/(?:instagram\.com|instagr\.am)\/+([^/?#\s]+)/i)
  const handle = (match?.[1] ?? text.replace(/^@/, '')).trim().replace(/\/+$/, '')
  if (!handle || /^https?:/i.test(handle) || handle.length > 100) return null
  // `explore`، `p` و امثالش handle نیستند.
  if (/^(explore|p|reel|reels|stories)$/i.test(handle)) return null
  return handle
}

/**
 * نگاشت برچسب‌های فارسیِ «سایر شبکه‌های اجتماعی» به نوع.
 *
 * ۱۲ برچسب متمایز در داده هست و دوتاشان دو املا دارند
 * («واتس اپ»/«واتساپ»، «رزرواسیون»/«لینک رزرواسیون») که یکی می‌شوند.
 */
const SOCIAL_LABELS: [RegExp, SocialKind][] = [
  [/اینستا|instagram/i, 'instagram'],
  [/تلگرام|telegram/i, 'telegram'],
  [/واتس\s*اپ|واتساپ|whats/i, 'whatsapp'],
  [/وب\s*سایت|وبسایت|سایت|website/i, 'website'],
  [/رزرو/i, 'reservation'],
  [/تور\s*مجازی|virtual/i, 'virtual_tour'],
  [/نظرسنجی|survey/i, 'survey'],
  [/روبیکا|rubika/i, 'rubika'],
  [/ایتا|eitaa/i, 'eitaa'],
  [/^\s*بله\s*$|bale/i, 'bale'],
]

/**
 * تجزیه‌ی فیلد «سایر شبکه‌های اجتماعی».
 *
 * شکل واقعی: `تلگرام: https://t.me/x | رزرواسیون: 09123456789`
 * بعضی مقادیر URL نیستند بلکه شماره تلفن‌اند (۲۴ مورد «رزرواسیون»)، پس
 * شماره به لینک `tel:` تبدیل می‌شود — وگرنه روی موبایل قابل استفاده نیست.
 */
export function parseSocials(raw: string | null | undefined): ParsedSocial[] {
  if (!raw) return []
  const out: ParsedSocial[] = []
  const seen = new Set<string>()

  for (const segment of raw.split(/[|\n]+/)) {
    const text = segment.trim()
    if (!text) continue

    const colon = text.indexOf(':')
    // «https://…» خودش کولن دارد؛ برچسب فقط وقتی است که قبل از کولن URL نباشد.
    const hasLabel = colon > 0 && !/^https?$/i.test(text.slice(0, colon).trim())
    const label = hasLabel ? text.slice(0, colon).trim() : ''
    const value = (hasLabel ? text.slice(colon + 1) : text).trim()
    if (!value) continue

    let kind: SocialKind = 'other'
    for (const [pattern, mapped] of SOCIAL_LABELS) {
      if (pattern.test(label)) {
        kind = mapped
        break
      }
    }
    if (kind === 'other' && !label) {
      if (/t\.me|telegram/i.test(value)) kind = 'telegram'
      else if (/wa\.me|whatsapp/i.test(value)) kind = 'whatsapp'
      else if (/instagram/i.test(value)) kind = 'instagram'
      else if (/^https?:\/\//i.test(value)) kind = 'website'
    }

    let url = value
    let handle: string | null = null

    if (/^https?:\/\//i.test(value)) {
      handle = parseInstagramHandle(value)
    } else if (/^[\d\s+()-]+$/.test(toAsciiDigits(value))) {
      const phones = parsePhones(value)
      if (phones.length === 0) continue
      url = `tel:${phones[0]!.phone}`
    } else if (/^[\w.]+\.[a-z]{2,}/i.test(value)) {
      url = `https://${value}`
    } else if (value.startsWith('@')) {
      handle = value.slice(1)
      url = kind === 'telegram' ? `https://t.me/${handle}` : `https://instagram.com/${handle}`
    } else {
      // متن آزادِ بی‌لینک — چیزی برای کلیک‌کردن ندارد.
      continue
    }

    if (url.length > 480) continue
    if (seen.has(url)) continue
    seen.add(url)
    out.push({ kind, label: label || null, url, handle } as ParsedSocial)
  }

  return out
}

// ═══════════════════════════════════════════════════════════════════════
// ساعت کاری
// ═══════════════════════════════════════════════════════════════════════

/** ترتیب هفته‌ی ایرانی: شنبه صفر است. */
export const WEEKDAY_NAMES = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
] as const

const DOW_BY_NAME = new Map<string, number>()
for (const [index, name] of WEEKDAY_NAMES.entries()) {
  DOW_BY_NAME.set(squashFa(name), index)
}
// املاهای جایگزینی که در داده دیده می‌شوند
DOW_BY_NAME.set(squashFa('سه شنبه'), 3)
DOW_BY_NAME.set(squashFa('پنج شنبه'), 5)
DOW_BY_NAME.set(squashFa('پنجشنبه'), 5)
DOW_BY_NAME.set(squashFa('آدینه'), 6)

export interface ParsedHourShift {
  dow: number
  shiftIndex: number
  opensAt: string | null
  closesAt: string | null
  crossesMidnight: boolean
  closed: boolean
}

export interface ParsedHours {
  shifts: ParsedHourShift[]
  /** بازه‌هایی که قابل فهم نبودند — برای گزارش، نه برای دورانداختن بی‌صدا. */
  warnings: string[]
}

/**
 * `«8»` → `08:00` · `«8:30»` → `08:30` · `«24:00»` → `00:00` + گذر از نیمه‌شب
 *
 * ساعت ۲۴ و ۲۴:۳۰ در داده واقعاً وجود دارند (`08:00-24:00`, `20:00-24:30`) و
 * یعنی نیمه‌شب و نیم بامدادِ روز بعد.
 */
function parseClock(token: string): { time: string; nextDay: boolean } | null {
  const text = toAsciiDigits(token).trim()
  const match = text.match(/^(\d{1,2})(?::(\d{1,2}))?$/)
  if (!match) return null

  let hour = Number(match[1])
  const minute = match[2] === undefined ? 0 : Number(match[2])

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  if (minute > 59) return null
  // ساعت > ۲۴ داده‌ی خراب است (مثل «93:0» که تایپ برعکسِ ۹:۳۰ است). حدس
  // نمی‌زنیم — گزارش می‌دهیم و رد می‌کنیم، چون حدسِ اشتباه بدتر از خالی است.
  if (hour > 24) return null

  let nextDay = false
  if (hour >= 24) {
    hour -= 24
    nextDay = true
  }

  return {
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    nextDay,
  }
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h! * 60 + m!
}

/**
 * تجزیه‌ی رشته‌ی ساعت کاری.
 *
 * شکل منبع: `شنبه: 16:00-00:30 | یکشنبه: 12:00-16:30 و 20:00-23:30 | …`
 *
 * چیزهایی که در داده‌ی واقعی هست و پوشش داده شده‌اند:
 *   • شیفت شکسته با «و» — ۴۱۴ روزِ دو یا سه شیفته
 *   • `تعطیل` — ۲۲ مورد
 *   • ساعت بی‌دقیقه: `8-24`، `11-01`
 *   • ساعت ۲۴ و ۲۴:۳۰ — نیمه‌شب و بعد از آن
 *   • روزهای غایب — ردیفی ساخته نمی‌شود (یعنی «نامشخص»، نه «تعطیل»)
 */
export function parseHours(raw: string | null | undefined): ParsedHours {
  const shifts: ParsedHourShift[] = []
  const warnings: string[] = []
  if (!raw?.trim()) return { shifts, warnings }

  for (const segment of raw.split('|')) {
    const text = segment.trim()
    if (!text) continue

    const colon = text.indexOf(':')
    if (colon < 0) {
      warnings.push(`بدون جداکننده: «${text}»`)
      continue
    }

    const dayToken = text.slice(0, colon).trim()
    const dow = DOW_BY_NAME.get(squashFa(dayToken))
    if (dow === undefined) {
      warnings.push(`روز ناشناس: «${dayToken}»`)
      continue
    }

    const body = text.slice(colon + 1).trim()
    if (!body) continue

    if (/تعطیل|بسته|closed/i.test(body)) {
      shifts.push({
        dow,
        shiftIndex: 0,
        opensAt: null,
        closesAt: null,
        crossesMidnight: false,
        closed: true,
      })
      continue
    }

    const parts = body
      .split(/\s+و\s+|،|,|\+/)
      .map((p) => p.trim())
      .filter(Boolean)

    let shiftIndex = 0
    for (const part of parts) {
      const range = part.match(/^(\d{1,2}(?::\d{1,2})?)\s*[-–—تا]+\s*(\d{1,2}(?::\d{1,2})?)$/)
      if (!range) {
        warnings.push(`بازه‌ی نامعتبر (${dayToken}): «${part}»`)
        continue
      }

      const open = parseClock(range[1]!)
      const close = parseClock(range[2]!)
      if (!open || !close) {
        warnings.push(`ساعت نامعتبر (${dayToken}): «${part}»`)
        continue
      }

      // گذر از نیمه‌شب: یا صریحاً ۲۴+ بوده، یا ساعت بستن ≤ ساعت باز شدن.
      const crossesMidnight =
        close.nextDay || toMinutes(close.time) <= toMinutes(open.time)

      shifts.push({
        dow,
        shiftIndex: shiftIndex++,
        opensAt: open.time,
        closesAt: close.time,
        crossesMidnight,
        closed: false,
      })
    }
  }

  return { shifts, warnings }
}

// ═══════════════════════════════════════════════════════════════════════
// مختصات و محله
// ═══════════════════════════════════════════════════════════════════════

/** کادر مشهد و حومه (طرقبه و شاندیز هم داخلش). */
export const MASHHAD_BBOX = {
  minLat: 36.1,
  maxLat: 36.55,
  minLng: 59.2,
  maxLng: 59.85,
} as const

export type GeoStatus = 'ok' | 'out_of_area' | 'missing'

export function classifyGeo(
  lat: number | null | undefined,
  lng: number | null | undefined,
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number } = MASHHAD_BBOX,
): GeoStatus {
  if (typeof lat !== 'number' || typeof lng !== 'number') return 'missing'
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'missing'
  if (lat === 0 || lng === 0) return 'missing'
  const inside =
    lat >= bbox.minLat && lat <= bbox.maxLat && lng >= bbox.minLng && lng <= bbox.maxLng
  return inside ? 'ok' : 'out_of_area'
}

/**
 * انتساب محله.
 *
 * **اول از متن آدرس**، بعد از مختصات. ترتیب مهم است: آدرس متنی چیزی است که
 * خودِ کافه نوشته («انتهای وکیل آباد») و از حدسِ «نزدیک‌ترین مرکز محله»
 * قابل‌اعتمادتر است، چون مراکز محله در `districts.ts` تقریبی‌اند و محله‌ها
 * هم‌پوشانی دارند.
 *
 * سقف ۴ کیلومتر برای تطابق مختصاتی: بیشتر از آن، «نزدیک‌ترین» دیگر معنی
 * «داخل» ندارد.
 */
export function pickDistrict(
  address: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
  maxKm = 4,
): string | null {
  const squashedAddress = squashFa(address ?? '')

  if (squashedAddress) {
    // بلندترین نام اول، تا «امام رضا» قبل از «رضا» تطبیق بخورد.
    const byLength = [...DISTRICTS].sort(
      (a, b) => squashFa(b.name).length - squashFa(a.name).length,
    )
    for (const district of byLength) {
      const name = squashFa(district.name)
      if (name.length >= 3 && squashedAddress.includes(name)) return district.id
    }
  }

  if (classifyGeo(lat, lng) === 'ok') {
    let best: { id: string; km: number } | null = null
    for (const district of DISTRICTS) {
      const km = distanceKm({ lat: lat as number, lng: lng as number }, district.center)
      if (!best || km < best.km) best = { id: district.id, km }
    }
    if (best && best.km <= maxKm) return best.id
  }

  return null
}

// ═══════════════════════════════════════════════════════════════════════
// قیمت
// ═══════════════════════════════════════════════════════════════════════

/**
 * زیر این عدد، «قیمت» به تومان بی‌معنی است.
 *
 * ارزان‌ترین چیزِ واقعی در منوهای مشهد (آب معدنی کوچک) حدود ۱۰ تا ۳۰ هزار
 * تومان است. ارزان‌ترین *میانه‌ی* یک کافه‌ی سالم در داده ۱۴۸٬۰۰۰ بود. پس
 * ۵٬۰۰۰ فاصله‌ی امنی از هر دو طرف دارد.
 */
export const THOUSAND_UNIT_THRESHOLD = 5_000

/** مقادیری که قیمت نیستند بلکه جای‌نگهدارِ «قیمت روز»اند. */
function isPlaceholderPrice(price: number): boolean {
  return price <= 1
}

export interface PriceContext {
  /** آیا قیمت‌های این مجموعه به «هزار تومان» نوشته شده‌اند؟ */
  thousandUnit: boolean
  /** آستانه‌ای که این تشخیص با آن انجام شد — همان که در ضرب هم به‌کار می‌رود. */
  threshold?: number
}

/**
 * تشخیص واحد قیمت **در سطح مجموعه**.
 *
 * ۲۳ مجموعه قیمت را به هزار تومان نوشته‌اند («لازانیا ۹۲۰» = ۹۲۰٬۰۰۰ تومان).
 * تشخیص در سطح آیتم غلط است: «آب معدنی ۳۰» و «آب معدنی ۳۰۰۰۰» هر دو معتبرند
 * و از خودِ عدد نمی‌شود فهمید. ولی *میانه‌ی* منو سیگنال قاطع می‌دهد.
 */
export function detectPriceContext(
  prices: number[],
  threshold = THOUSAND_UNIT_THRESHOLD,
): PriceContext {
  const real = prices.filter((p) => p > 1)
  if (real.length < 3) return { thousandUnit: false, threshold }
  const sorted = [...real].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]!
  return { thousandUnit: median < threshold, threshold }
}

export interface NormalizedPrice {
  price: number | null
  priceUnknown: boolean
}

/**
 * اصلاح یک قیمت.
 *
 * ═══ چرا اصلاح در سطح آیتم انجام می‌شود، حتی وقتی تشخیص در سطح مجموعه است ═══
 *
 * چون `کافه رستوران شایر` واحدها را **قاطی** کرده: ۶۸ آیتم به هزار تومان
 * (`آمریکانو 170`) و ۱۴ آیتم به تومان کامل (`شیک توت فرنگی 320000`). ضرب کردن
 * همه در ۱۰۰۰ آن شیک را ۳۲۰ میلیون تومان می‌کرد.
 *
 * پس: مجموعه به‌عنوان «هزارتومانی» علامت می‌خورد، ولی ضرب فقط روی آیتم‌هایی
 * اعمال می‌شود که خودشان زیر آستانه‌اند.
 */
export function normalizePrice(
  raw: number | null | undefined,
  context: PriceContext,
): NormalizedPrice {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return { price: null, priceUnknown: true }
  }
  // صفر یک قیمت نیست: در منوی هتل‌ها یعنی «با غذا سرو می‌شود» یا «تماس بگیرید».
  if (raw <= 0 || isPlaceholderPrice(raw)) {
    return { price: null, priceUnknown: true }
  }

  const threshold = context.threshold ?? THOUSAND_UNIT_THRESHOLD
  const price =
    context.thousandUnit && raw < threshold ? Math.round(raw * 1000) : Math.round(raw)

  // قیمت‌های نامعقولِ بزرگ (بالای ۲۰۰ میلیون) داده‌ی خراب‌اند، نه غذا.
  if (price > 200_000_000) return { price: null, priceUnknown: true }

  return { price, priceUnknown: false }
}

/**
 * مرزهای رده‌ی قیمت.
 *
 * از سه‌بخشی‌کردن *میانه‌ی مجموعه‌ها* در داده‌ی واقعی آمده:
 * صدک ۳۳ روی ۲۵۰٬۰۰۰ و صدک ۶۶ روی ۳۸۰٬۰۰۰ افتاد. عددها رُند شدند تا در
 * توضیح UI قابل گفتن باشند («تا ۲۵۰ هزار»).
 */
export const PRICE_TIER_BOUNDS = { cheap: 250_000, mid: 400_000 } as const

/**
 * مرزها از تنظیمات پنل ادمین می‌آیند، ولی پیش‌فرض دارند.
 *
 * تزریق به‌جای خواندنِ مستقیم، چون این ماژول خالص است و باید بدون دیتابیس
 * قابل تست بماند.
 */
export function priceTierFromMedian(
  median: number | null,
  bounds: { cheap: number; mid: number } = PRICE_TIER_BOUNDS,
): 1 | 2 | 3 {
  if (median === null) return 2
  if (median <= bounds.cheap) return 1
  if (median <= bounds.mid) return 2
  return 3
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

// ═══════════════════════════════════════════════════════════════════════
// نوع مجموعه
// ═══════════════════════════════════════════════════════════════════════

export type PlaceKind = 'cafe' | 'cafe_restaurant' | 'restaurant' | 'bakery' | 'lounge' | 'shop'

/** واژه‌هایی که وجودشان در منو یعنی این‌جا خوردنی می‌فروشد. */
const FOOD_SIGNALS = [
  'قهوه', 'کافی', 'اسپرسو', 'لاته', 'کاپوچینو', 'موکا', 'آمریکانو', 'امریکانو',
  'چای', 'دمنوش', 'نوشیدنی', 'ماچا', 'شیک', 'اسموتی', 'ماکتیل', 'ماکتل', 'موکتل',
  'آبمیوه', 'آب میوه', 'بستنی', 'کیک', 'دسر', 'کروسان', 'بیکری', 'پیستری', 'نان',
  'صبحانه', 'برانچ', 'پیتزا', 'برگر', 'ساندویچ', 'پاستا', 'لازانیا', 'سالاد',
  'استیک', 'سوخاری', 'کباب', 'خوراک', 'غذا', 'پیش غذا', 'سوپ', 'سیب زمینی',
  'مخلفات', 'قلیان', 'شکلات', 'وافل', 'پنکیک', 'املت', 'چیزکیک', 'چیز کیک',
  'فست فود', 'رستوران', 'کافه', 'تاپینگ', 'سیروپ', 'افزودنی', 'نوشابه', 'دوغ',
]

/** واژه‌هایی که یعنی این مجموعه اصلاً کافه/رستوران نیست. */
const NON_FOOD_SIGNALS = [
  'پوشاک', 'عطر', 'ادکلن', 'کاکتوس', 'گل و گیاه', 'آرایشی', 'بهداشتی',
  'کیف و کفش', 'طلا', 'جواهر', 'لوازم خانگی', 'موبایل', 'دیجیتال',
  'تخم مرغ', 'نمونه کار', 'خدمات', 'مبلمان', 'ساعت', 'عینک',
]

export interface KindSignal {
  kind: PlaceKind
  /** سهم آیتم‌های خوراکی — زیر ۰٫۲۵ یعنی احتمالاً کافه نیست. */
  foodShare: number
  reason: string
}

/**
 * تشخیص نوع مجموعه از نام و دسته‌بندی‌های منو.
 *
 * ═══ چرا لازم است ═══
 *
 * فایل منبع خروجی یک پلتفرم منوی عمومی است، نه فقط کافه. داخلش
 * `گرینو` (کاکتوس‌فروشی)، `تاپ منو مارکت` (عطر و پوشاک)، `تخم مرغ آمین`
 * (عمده‌فروشی تخم‌مرغ) و `آرایشی گلریز` هم هست. اگر این‌ها به‌عنوان کافه
 * منتشر شوند، «ارزان‌ترین کافه‌های مشهد» یک عطر ۱۱۳ میلیونی نشان می‌دهد.
 *
 * این‌ها **حذف نمی‌شوند** — با `kind: 'shop'` و وضعیت `draft` وارد می‌شوند تا
 * در پنل ادمین دیده و دستی تصمیم‌گیری شوند.
 */
export function detectKind(name: string, sectionNames: string[], itemNames: string[]): KindSignal {
  const haystack = [...sectionNames, ...itemNames].map((s) => squashFa(s))
  const nameSquashed = squashFa(name)

  let foodHits = 0
  let nonFoodHits = 0
  for (const text of haystack) {
    if (FOOD_SIGNALS.some((signal) => text.includes(squashFa(signal)))) foodHits++
    else if (NON_FOOD_SIGNALS.some((signal) => text.includes(squashFa(signal)))) nonFoodHits++
  }

  const total = haystack.length
  const foodShare = total === 0 ? 0 : foodHits / total

  // نامِ مجموعه سیگنال قوی‌تری از منو است — «کافه» در نام، قطعی است.
  const nameSaysCafe = /کافه|کافی|coffee|cafe/i.test(name) || nameSquashed.includes(squashFa('کافه'))
  const nameSaysRestaurant = /رستوران|restaurant/i.test(name)
  const nameSaysBakery = /بیکری|نانوایی|قنادی|شیرینی|bakery/i.test(name)
  const nameSaysLounge = /لانژ|لاונج|lounge|روف|roof/i.test(name)

  if (total > 0 && foodShare < 0.25 && nonFoodHits > foodHits && !nameSaysCafe) {
    return {
      kind: 'shop',
      foodShare,
      reason: `سهم آیتم خوراکی ${(foodShare * 100).toFixed(0)}٪ و ${nonFoodHits} نشانه‌ی غیرخوراکی`,
    }
  }

  if (nameSaysCafe && nameSaysRestaurant) {
    return { kind: 'cafe_restaurant', foodShare, reason: 'نام شامل کافه و رستوران' }
  }
  if (nameSaysBakery) return { kind: 'bakery', foodShare, reason: 'نام شامل بیکری/قنادی' }
  if (nameSaysLounge) return { kind: 'lounge', foodShare, reason: 'نام شامل لانژ/روف' }
  if (nameSaysRestaurant) return { kind: 'restaurant', foodShare, reason: 'نام شامل رستوران' }
  if (nameSaysCafe) return { kind: 'cafe', foodShare, reason: 'نام شامل کافه' }

  // بدون سیگنال نام: از منو حدس بزن.
  const hasRestaurantMenu = haystack.some((t) =>
    [squashFa('غذای اصلی'), squashFa('خوراک'), squashFa('کباب'), squashFa('استیک')].some((s) =>
      t.includes(s),
    ),
  )
  return {
    kind: hasRestaurantMenu ? 'cafe_restaurant' : 'cafe',
    foodShare,
    reason: hasRestaurantMenu ? 'منو شامل غذای اصلی' : 'پیش‌فرض',
  }
}
