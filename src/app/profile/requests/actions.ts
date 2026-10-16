'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/core/auth/currentUser'
import { cancelMyBookingRequest } from '@/core/booking/service'
import { publicBookingError } from '@/core/booking/error'
import { paths } from '@/routes'

export type CancelState = { error?: string; success?: boolean }

export async function cancelBookingAction(_previous: CancelState, form: FormData): Promise<CancelState> {
  const bookingId = form.get('bookingId')
  const revision = Number(form.get('revision'))
  if (typeof bookingId !== 'string' || !/^[0-9a-f-]{36}$/i.test(bookingId) || !Number.isSafeInteger(revision) || revision < 0) {
    return { error: 'درخواست معتبر نیست.' }
  }
  try {
    await cancelMyBookingRequest(await getSession(), bookingId, revision)
    revalidatePath(paths.myBookings)
    return { success: true }
  } catch (error) {
    return { error: publicBookingError(error, 'لغو درخواست ممکن نشد.') }
  }
}
