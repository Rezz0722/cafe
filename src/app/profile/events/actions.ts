'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/core/auth/currentUser'
import { publicBookingError } from '@/core/booking/error'
import { cancelMyEventParticipation } from '@/core/events/service'
import { paths } from '@/routes'

export type CancelEventState = { error?: string; success?: string }
export async function cancelEventAction(_previous: CancelEventState, form: FormData): Promise<CancelEventState> {
  const participationId = form.get('participationId'), revision = Number(form.get('revision'))
  if (typeof participationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(participationId) || !Number.isSafeInteger(revision)) {
    return { error: 'شناسهٔ درخواست معتبر نیست.' }
  }
  try {
    await cancelMyEventParticipation(await getSession(), participationId, revision)
    revalidatePath(paths.myEvents)
    return { success: 'درخواست شما لغو شد.' }
  } catch (error) { return { error: publicBookingError(error, 'لغو درخواست ممکن نشد.') } }
}
