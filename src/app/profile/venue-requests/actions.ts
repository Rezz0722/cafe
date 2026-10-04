'use server'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/core/auth/currentUser'
import { submitVenueClaim } from '@/core/leads/service'
import type { LeadActionState } from '@/core/leads/state'
export async function claimLeadAction(_previous: LeadActionState, form: FormData): Promise<LeadActionState> {
  const { user, actor } = await getSession()
  if (!user || actor) return { ok: false, error: 'با حساب خودتان وارد شوید؛ حالت مشاهده فقط خواندنی است.' }
  const placeId = Number(form.get('placeId')), leadId = String(form.get('leadId') || '')
  if (!Number.isSafeInteger(placeId) || placeId < 1 || !/^[a-f0-9-]{36}$/i.test(leadId)) return { ok: false, error: 'شعبه و درخواست معتبر انتخاب کنید.' }
  try {
    await submitVenueClaim(user.id, leadId, placeId)
    revalidatePath('/profile/venue-requests'); revalidatePath('/admin/leads')
    return { ok: true, message: 'درخواست بررسی مالکیت ثبت شد؛ فعال‌سازی پس از بررسی انسانی انجام می‌شود.' }
  } catch (error) {
    return { ok: false, error: error instanceof Error && !/SQL|query|constraint|database/i.test(error.message) ? error.message : 'درخواست ذخیره نشد؛ دوباره تلاش کنید.' }
  }
}
