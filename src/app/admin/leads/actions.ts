'use server'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/core/auth/currentUser'
import { LEAD_LABELS, parseFollowUp, type LeadStatus } from '@/core/leads/policy'
import { approveVenueClaim, updateVenueLead } from '@/core/leads/service'
import type { LeadActionState } from '@/core/leads/state'
import { cleanUserText } from '@/core/security/input'

export async function manageLeadAction(_previous: LeadActionState, form: FormData): Promise<LeadActionState> {
  const { user, actor } = await getSession()
  if (!user || actor || user.role !== 'admin') return { ok: false, error: 'دسترسی مدیریت معتبر نیست؛ مشاهده به‌عنوان فقط خواندنی است.' }
  const str = (key: string) => typeof form.get(key) === 'string' ? String(form.get(key)).trim() : ''
  const revision = Number(str('revision')), id = str('leadId')
  if (!/^[a-f0-9-]{36}$/i.test(id) || !Number.isSafeInteger(revision) || revision < 0) return { ok: false, error: 'درخواست معتبر نیست.' }
  try {
    if (str('mode') === 'approve') {
      if (str('ownershipChecked') !== 'yes') return { ok: false, error: 'مالکیت شعبه باید به‌صورت انسانی بررسی شود.' }
      await approveVenueClaim(user.id, id, revision, cleanUserText(str('rationale'), 500))
    } else {
      const status = str('status') as LeadStatus
      if (!Object.hasOwn(LEAD_LABELS, status)) return { ok: false, error: 'وضعیت معتبر نیست.' }
      await updateVenueLead(user.id, id, revision, { status, assignedToUserId: str('assignee') || null, nextFollowUpAt: parseFollowUp(str('followUp')), internalNote: cleanUserText(str('note'), 2000) })
    }
    revalidatePath('/admin/leads'); revalidatePath('/profile/venue-requests'); revalidatePath('/admin/venue')
    return { ok: true, message: 'تغییر ذخیره و در سابقه ثبت شد.' }
  } catch (error) {
    return { ok: false, error: error instanceof Error && !/SQL|query|constraint|database/i.test(error.message) ? error.message : 'تغییر ذخیره نشد؛ دوباره تلاش کنید.' }
  }
}
