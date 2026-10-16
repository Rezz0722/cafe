import { createHash } from 'node:crypto'
import { cleanUserText } from '@/core/security/input'
import { BOOKING_KIND } from '@/db/schema'
import { EXPERIENCES } from '@/core/experience/registry'

export type BookingKind = (typeof BOOKING_KIND)[number]
export type MenuIntentInput = { itemId: number; variantId?: number | null; quantity: number }

export interface BookingDraft {
  placeId: number
  kind: BookingKind
  experienceSlug?: string | null
  requestedDate: string
  requestedLocalTime: string
  partySize: number
  durationMinutes?: number | null
  needsCake?: boolean
  needsDecoration?: boolean
  needsPrivateSpace?: boolean
  customerNote?: string | null
  termsAccepted: boolean
  idempotencyKey: string
  items?: MenuIntentInput[]
}

export interface BookingWindow {
  requestFrom: string | null
  requestUntil: string | null
  maxPartySize: number | null
  minNoticeMinutes: number
  maxAdvanceDays: number
}

const TEHRAN_CLOCK = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

export function tehranCivilNow(now = new Date()): { date: string; minuteOfDay: number } {
  const values = Object.fromEntries(TEHRAN_CLOCK.formatToParts(now).map(part => [part.type, part.value]))
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minuteOfDay: Number(values.hour) * 60 + Number(values.minute),
  }
}

export function validLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year!, month! - 1, day!))
  return parsed.toISOString().slice(0, 10) === value
}

export function clockMinute(value: string): number | null {
  const match = /^(\d{2}):(\d{2})(?::00)?$/.exec(value)
  if (!match) return null
  const hour = Number(match[1]), minute = Number(match[2])
  return hour < 24 && minute < 60 ? hour * 60 + minute : null
}

export function validateBookingWindow(window: BookingWindow): void {
  const from = window.requestFrom === null ? null : clockMinute(window.requestFrom)
  const until = window.requestUntil === null ? null : clockMinute(window.requestUntil)
  if (from === null || until === null || from >= until) throw new Error('بازهٔ پذیرش درخواست معتبر نیست.')
  if (!Number.isSafeInteger(window.maxPartySize) || (window.maxPartySize ?? 0) < 1 || (window.maxPartySize ?? 0) > 60) {
    throw new Error('حداکثر تعداد نفرات باید بین ۱ و ۶۰ باشد.')
  }
  if (!Number.isSafeInteger(window.minNoticeMinutes) || window.minNoticeMinutes < 0 || window.minNoticeMinutes > 10080) {
    throw new Error('فاصلهٔ زمانی درخواست معتبر نیست.')
  }
  if (!Number.isSafeInteger(window.maxAdvanceDays) || window.maxAdvanceDays < 1 || window.maxAdvanceDays > 180) {
    throw new Error('بازهٔ روزهای آینده معتبر نیست.')
  }
}

/** Stable payload for idempotent retries even after a venue later disables requests. */
export function canonicalBookingDraft(input: BookingDraft): BookingDraft {
  if (!Number.isSafeInteger(input.placeId) || input.placeId <= 0) throw new Error('شعبه نامعتبر است.')
  if (!BOOKING_KIND.includes(input.kind)) throw new Error('نوع درخواست نامعتبر است.')
  if (!Number.isSafeInteger(input.partySize) || input.partySize < 1 || input.partySize > 60) throw new Error('تعداد نفرات نامعتبر است.')
  if (!validLocalDate(input.requestedDate)) throw new Error('تاریخ درخواست معتبر نیست.')
  if (clockMinute(input.requestedLocalTime) === null) throw new Error('ساعت پیشنهادی معتبر نیست.')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.idempotencyKey)) {
    throw new Error('شناسهٔ ارسال معتبر نیست؛ فرم را دوباره باز کنید.')
  }
  if (input.termsAccepted !== true) throw new Error('برای ارسال، شرایط درخواست را تأیید کنید.')
  const duration = input.durationMinutes ?? null
  if (duration !== null && (!['birthday', 'gathering', 'special_occasion'].includes(input.kind) || !Number.isSafeInteger(duration) || duration < 30 || duration > 720)) {
    throw new Error('مدت پیشنهادی معتبر نیست.')
  }
  const items = input.items ?? []
  if (items.length > 12) throw new Error('حداکثر ۱۲ قلم می‌توان انتخاب کرد.')
  const seen = new Set<string>()
  for (const item of items) {
    if (!Number.isSafeInteger(item.itemId) || item.itemId <= 0 ||
      (item.variantId != null && (!Number.isSafeInteger(item.variantId) || item.variantId <= 0)) ||
      !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10) throw new Error('انتخاب منو معتبر نیست.')
    const key = `${item.itemId}:${item.variantId ?? ''}`
    if (seen.has(key)) throw new Error('یک قلم منو دوبار انتخاب شده است.')
    seen.add(key)
  }
  const experienceSlug = cleanUserText(input.experienceSlug, 48) || null
  if (experienceSlug && !EXPERIENCES.some(experience => experience.slug === experienceSlug)) throw new Error('تجربهٔ انتخاب‌شده معتبر نیست.')
  return {
    placeId: input.placeId, kind: input.kind, experienceSlug,
    requestedDate: input.requestedDate,
    requestedLocalTime: input.requestedLocalTime.slice(0, 5),
    partySize: input.partySize, durationMinutes: duration,
    needsCake: input.needsCake === true,
    needsDecoration: input.needsDecoration === true,
    needsPrivateSpace: input.needsPrivateSpace === true,
    customerNote: cleanUserText(input.customerNote, 1000) || null,
    termsAccepted: true,
    idempotencyKey: input.idempotencyKey.toLowerCase(),
    items: items.map(item => ({ itemId: item.itemId, variantId: item.variantId ?? null, quantity: item.quantity })),
  }
}

export function normalizeBookingDraft(input: BookingDraft, window: BookingWindow, now = new Date()): BookingDraft {
  const draft = canonicalBookingDraft(input)
  validateBookingWindow(window)
  if (draft.partySize > window.maxPartySize!) throw new Error('تعداد نفرات خارج از محدودهٔ این شعبه است.')
  const proposedMinute = clockMinute(draft.requestedLocalTime)!
  if (proposedMinute < clockMinute(window.requestFrom!)! || proposedMinute > clockMinute(window.requestUntil!)!) {
    throw new Error('ساعت پیشنهادی خارج از بازهٔ پذیرش شعبه است.')
  }
  const current = tehranCivilNow(now)
  const dayDifference = (Date.parse(`${draft.requestedDate}T00:00:00Z`) - Date.parse(`${current.date}T00:00:00Z`)) / 86_400_000
  if (dayDifference < 0 || dayDifference > window.maxAdvanceDays || dayDifference * 1440 + proposedMinute - current.minuteOfDay < window.minNoticeMinutes) {
    throw new Error('تاریخ یا ساعت پیشنهادی در بازهٔ مجاز نیست.')
  }
  return draft
}

export function hashBookingDraft(draft: BookingDraft): string {
  return createHash('sha256').update(JSON.stringify(draft)).digest('hex')
}
