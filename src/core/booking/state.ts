import { BOOKING_STATUS } from '@/db/schema'
import { clockMinute, tehranCivilNow } from './policy'

export type BookingStatus = (typeof BOOKING_STATUS)[number]
export type BookingTransitionActor = 'customer' | 'venue' | 'system'

export function isProposedTimePast(requestedDate: string, requestedLocalTime: string, now = new Date()): boolean {
  const current = tehranCivilNow(now)
  return requestedDate < current.date ||
    (requestedDate === current.date && (clockMinute(requestedLocalTime) ?? -1) <= current.minuteOfDay)
}

/** One contract for all writers; merely viewing a request never changes status. */
export function assertBookingTransition(
  from: BookingStatus,
  to: BookingStatus,
  actor: BookingTransitionActor,
  requestedDate: string,
  requestedLocalTime: string,
  now = new Date(),
): void {
  const past = isProposedTimePast(requestedDate, requestedLocalTime, now)
  const allowed =
    (actor === 'customer' && from === 'pending' && to === 'cancelled') ||
    (actor === 'venue' && from === 'pending' && to === 'confirmed' && !past) ||
    (actor === 'venue' && from === 'pending' && to === 'rejected') ||
    (actor === 'venue' && from === 'confirmed' && to === 'completed' && past) ||
    (actor === 'system' && from === 'pending' && to === 'expired' && past)
  if (!allowed) throw new Error('این تغییر وضعیت مجاز نیست؛ صفحه را تازه کنید.')
}
