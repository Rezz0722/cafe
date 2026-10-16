import { cleanUserText } from '@/core/security/input'
import { clockMinute, tehranCivilNow, validLocalDate } from '@/core/booking/policy'
import { EVENT_PARTICIPATION_MODE, VENUE_EVENT_CATEGORY } from '@/db/schema'

export interface EventDraft {
  placeId: number
  title: string
  description: string
  startDate: string
  startLocalTime: string
  endDate: string
  endLocalTime: string
  category: (typeof VENUE_EVENT_CATEGORY)[number]
  capacity?: number | null
  terms?: string | null
  participationMode: (typeof EVENT_PARTICIPATION_MODE)[number]
  coverMediaId?: number | null
}

export function eventHasEnded(endDate: string, endTime: string, now = new Date()): boolean {
  const current = tehranCivilNow(now)
  return endDate < current.date || (endDate === current.date && (clockMinute(endTime) ?? -1) <= current.minuteOfDay)
}

export function normalizeEventDraft(input: EventDraft, now = new Date()): EventDraft {
  if (!Number.isSafeInteger(input.placeId) || input.placeId <= 0) throw new Error('شعبه معتبر نیست.')
  const title = cleanUserText(input.title, 160)
  const description = cleanUserText(input.description, 4000)
  const terms = cleanUserText(input.terms, 2000) || null
  if (title.length < 5 || description.length < 30) throw new Error('عنوان یا توضیحات رویداد کافی نیست.')
  if (!validLocalDate(input.startDate) || !validLocalDate(input.endDate)) throw new Error('تاریخ رویداد معتبر نیست.')
  const startMinute = clockMinute(input.startLocalTime), endMinute = clockMinute(input.endLocalTime)
  if (startMinute === null || endMinute === null) throw new Error('ساعت رویداد معتبر نیست.')
  const startDay = Date.parse(`${input.startDate}T00:00:00Z`)
  const endDay = Date.parse(`${input.endDate}T00:00:00Z`)
  const today = tehranCivilNow(now)
  const todayDay = Date.parse(`${today.date}T00:00:00Z`)
  if (startDay < todayDay || startDay - todayDay > 365 * 86_400_000 ||
    (startDay === todayDay && startMinute <= today.minuteOfDay)) throw new Error('شروع رویداد باید در آیندهٔ مجاز باشد.')
  if (endDay < startDay || endDay - startDay > 7 * 86_400_000 ||
    (endDay === startDay && endMinute <= startMinute)) throw new Error('پایان رویداد باید بعد از شروع و حداکثر تا هفت روز باشد.')
  if (!VENUE_EVENT_CATEGORY.includes(input.category) || !EVENT_PARTICIPATION_MODE.includes(input.participationMode)) {
    throw new Error('دسته یا روش مشارکت رویداد معتبر نیست.')
  }
  const capacity = input.capacity ?? null
  if (capacity !== null && (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 5000)) throw new Error('ظرفیت اعلام‌شده معتبر نیست.')
  const coverMediaId = input.coverMediaId ?? null
  if (coverMediaId !== null && (!Number.isSafeInteger(coverMediaId) || coverMediaId <= 0)) throw new Error('تصویر رویداد معتبر نیست.')
  return { ...input, title, description, terms, capacity, coverMediaId,
    startLocalTime: input.startLocalTime.slice(0, 5), endLocalTime: input.endLocalTime.slice(0, 5) }
}
