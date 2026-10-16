'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/core/auth/currentUser'
import { completeVenueBookingRequest, respondToBookingRequest, saveVenueBookingConfiguration } from '@/core/booking/service'
import { publicBookingError } from '@/core/booking/error'
import { paths } from '@/routes'

export type VenueBookingActionState = { error?: string; success?: string }

function field(form: FormData, name: string): string {
  const raw = form.get(name)
  return typeof raw === 'string' ? raw : ''
}

export async function saveBookingSettingsAction(_previous: VenueBookingActionState, form: FormData): Promise<VenueBookingActionState> {
  const placeId = Number(field(form, 'placeId'))
  try {
    await saveVenueBookingConfiguration(await getSession(), placeId, Number(field(form, 'revision')), {
      enabled: form.has('enabled'),
      requestFrom: field(form, 'requestFrom') || null,
      requestUntil: field(form, 'requestUntil') || null,
      maxPartySize: Number(field(form, 'maxPartySize')) || null,
      minNoticeMinutes: Number(field(form, 'minNoticeMinutes')),
      maxAdvanceDays: Number(field(form, 'maxAdvanceDays')),
      instructions: field(form, 'instructions') || null,
    })
    revalidatePath(paths.venueBookings(placeId).split('?')[0])
    return { success: 'تنظیمات ثبت شد.' }
  } catch (error) {
    return { error: publicBookingError(error, 'ثبت تنظیمات ممکن نشد.') }
  }
}

export async function respondBookingAction(_previous: VenueBookingActionState, form: FormData): Promise<VenueBookingActionState> {
  const placeId = Number(field(form, 'placeId'))
  const decision = field(form, 'decision')
  if (decision !== 'confirmed' && decision !== 'rejected' && decision !== 'completed') return { error: 'پاسخ معتبر نیست.' }
  try {
    if (decision === 'completed') await completeVenueBookingRequest(await getSession(), placeId, field(form, 'bookingId'), Number(field(form, 'revision')))
    else await respondToBookingRequest(await getSession(), placeId, field(form, 'bookingId'), Number(field(form, 'revision')), decision, field(form, 'response'))
    revalidatePath(paths.venueBookings(placeId).split('?')[0])
    return { success: 'وضعیت درخواست ثبت شد.' }
  } catch (error) {
    return { error: publicBookingError(error, 'پاسخ ثبت نشد.') }
  }
}
