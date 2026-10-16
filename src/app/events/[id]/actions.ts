'use server'

import { getSession } from '@/core/auth/currentUser'
import { publicBookingError } from '@/core/booking/error'
import { requestEventParticipation } from '@/core/events/service'

export type ParticipationState = { error?: string; status?: 'interested' | 'pending' | 'confirmed' | 'rejected' | 'cancelled' }

export async function participateInEventAction(_previous: ParticipationState, form: FormData): Promise<ParticipationState> {
  const eventId = form.get('eventId'), note = form.get('note')
  if (typeof eventId !== 'string' || !/^[0-9a-f-]{36}$/i.test(eventId) || !form.has('consent')) {
    return { error: 'شناسهٔ رویداد یا تأیید شرایط معتبر نیست.' }
  }
  try {
    const result = await requestEventParticipation(await getSession(), eventId, typeof note === 'string' ? note : null)
    return { status: result.status }
  } catch (error) { return { error: publicBookingError(error, 'ثبت درخواست رویداد ممکن نشد.') } }
}
