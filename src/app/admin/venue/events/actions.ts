'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/core/auth/currentUser'
import { publicBookingError } from '@/core/booking/error'
import { createVenueEvent, respondToEventParticipation, transitionVenueEvent, updateDraftVenueEvent } from '@/core/events/service'
import type { EventDraft } from '@/core/events/policy'
import { VENUE_EVENT_CATEGORY } from '@/db/schema'
import { paths } from '@/routes'

export type EventActionState = { error?: string; success?: string; eventId?: string }
function field(form: FormData, name: string): string { const value = form.get(name); return typeof value === 'string' ? value : '' }

export async function saveEventAction(_previous: EventActionState, form: FormData): Promise<EventActionState> {
  const category = field(form, 'category')
  if (!VENUE_EVENT_CATEGORY.includes(category as EventDraft['category'])) return { error: 'دستهٔ رویداد معتبر نیست.' }
  const mode = field(form, 'participationMode')
  if (mode !== 'interest' && mode !== 'request') return { error: 'روش مشارکت معتبر نیست.' }
  const draft: EventDraft = {
    placeId: Number(field(form, 'placeId')), title: field(form, 'title'), description: field(form, 'description'),
    startDate: field(form, 'startDate'), startLocalTime: field(form, 'startLocalTime'),
    endDate: field(form, 'endDate'), endLocalTime: field(form, 'endLocalTime'),
    category: category as EventDraft['category'], participationMode: mode,
    capacity: field(form, 'capacity') ? Number(field(form, 'capacity')) : null,
    terms: field(form, 'terms') || null, coverMediaId: field(form, 'coverMediaId') ? Number(field(form, 'coverMediaId')) : null,
  }
  try {
    const eventId = field(form, 'eventId')
    const result = eventId ? await updateDraftVenueEvent(await getSession(), eventId, Number(field(form, 'revision')), draft)
      : await createVenueEvent(await getSession(), draft)
    revalidatePath(paths.venueEvents(draft.placeId).split('?')[0])
    return { eventId: result.id, success: eventId ? 'پیش‌نویس ویرایش شد.' : 'پیش‌نویس رویداد ساخته شد؛ انتشار جداگانه انجام می‌شود.' }
  } catch (error) { return { error: publicBookingError(error, 'ثبت رویداد ممکن نشد.') } }
}

export async function transitionEventAction(_previous: EventActionState, form: FormData): Promise<EventActionState> {
  const next = field(form, 'next')
  if (next !== 'published' && next !== 'cancelled' && next !== 'ended') return { error: 'وضعیت نامعتبر است.' }
  const placeId = Number(field(form, 'placeId')), eventId = field(form, 'eventId')
  try {
    await transitionVenueEvent(await getSession(), placeId, eventId, Number(field(form, 'revision')), next)
    revalidatePath(`/admin/venue/events/${eventId}`)
    return { success: 'وضعیت رویداد ثبت شد.', eventId }
  } catch (error) { return { error: publicBookingError(error, 'تغییر وضعیت رویداد ممکن نشد.') } }
}

export async function respondParticipationAction(_previous: EventActionState, form: FormData): Promise<EventActionState> {
  const decision = field(form, 'decision')
  if (decision !== 'confirmed' && decision !== 'rejected') return { error: 'پاسخ نامعتبر است.' }
  try {
    await respondToEventParticipation(await getSession(), Number(field(form, 'placeId')),
      field(form, 'participationId'), Number(field(form, 'revision')), decision, field(form, 'response'))
    revalidatePath(`/admin/venue/events/${field(form, 'eventId')}`)
    return { success: 'پاسخ شرکت‌کننده ثبت شد.' }
  } catch (error) { return { error: publicBookingError(error, 'ثبت پاسخ ممکن نشد.') } }
}
