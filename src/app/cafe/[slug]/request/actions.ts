'use server'

import { getSession } from '@/core/auth/currentUser'
import { createBookingRequest } from '@/core/booking/service'
import type { BookingDraft, MenuIntentInput } from '@/core/booking/policy'
import { BOOKING_KIND } from '@/db/schema'
import { publicBookingError } from '@/core/booking/error'

export type BookingFormState = { error?: string; bookingId?: string }

function value(form: FormData, name: string): string {
  const raw = form.get(name)
  return typeof raw === 'string' ? raw : ''
}

function numberOrNull(value: string): number | null {
  return value ? Number(value) : null
}

export async function submitBookingRequest(_previous: BookingFormState, form: FormData): Promise<BookingFormState> {
  const kind = value(form, 'kind')
  let items: MenuIntentInput[] = []
  try {
    const raw = value(form, 'items')
    if (raw.length > 3000) throw new Error('تعداد اقلام انتخاب‌شده بیش از حد مجاز است.')
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) throw new Error('اقلام انتخاب‌شده معتبر نیستند.')
      items = parsed as MenuIntentInput[]
    }
    const draft: BookingDraft = {
      placeId: Number(value(form, 'placeId')),
      kind: BOOKING_KIND.includes(kind as BookingDraft['kind']) ? kind as BookingDraft['kind'] : 'table',
      experienceSlug: value(form, 'experienceSlug') || null,
      requestedDate: value(form, 'requestedDate'),
      requestedLocalTime: value(form, 'requestedLocalTime'),
      partySize: Number(value(form, 'partySize')),
      durationMinutes: numberOrNull(value(form, 'durationMinutes')),
      needsCake: form.has('needsCake'),
      needsDecoration: form.has('needsDecoration'),
      needsPrivateSpace: form.has('needsPrivateSpace'),
      customerNote: value(form, 'customerNote'),
      termsAccepted: form.has('termsAccepted'),
      idempotencyKey: value(form, 'idempotencyKey'),
      items,
    }
    if (!BOOKING_KIND.includes(kind as BookingDraft['kind'])) throw new Error('نوع درخواست معتبر نیست.')
    const result = await createBookingRequest(await getSession(), draft)
    return { bookingId: result.id }
  } catch (error) {
    return { error: publicBookingError(error, 'ثبت درخواست ممکن نشد. دوباره تلاش کنید.') }
  }
}
