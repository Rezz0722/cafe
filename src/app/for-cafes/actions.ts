'use server'
import { headers } from 'next/headers'
import { getSession } from '@/core/auth/currentUser'
import { SESSION_SECRET } from '@/core/config/env'
import { consumeLeadQuota, createVenueLead } from '@/core/leads/service'
import { validateLead } from '@/core/leads/policy'
import type { LeadActionState } from '@/core/leads/state'

export async function requestPanelAction(_previous: LeadActionState, form: FormData): Promise<LeadActionState> {
  const str = (name: string) => typeof form.get(name) === 'string' ? String(form.get(name)) : ''
  const { data, errors } = validateLead({ contactName: str('contactName'), contactPhone: str('contactPhone'), cafeName: str('cafeName'), city: str('city'), branch: str('branch'), source: str('source'), requestKey: str('requestKey'), consent: str('consent') === 'yes', website: str('website') })
  if (Object.keys(errors).length) return { ok: false, error: 'اطلاعات مشخص‌شده را اصلاح کنید.', errors }
  const { actor } = await getSession()
  if (actor) return { ok: false, error: 'در حالت مشاهده به‌عنوان، ثبت درخواست مجاز نیست.' }
  try {
    const h = await headers()
    const ip = h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!await consumeLeadQuota(SESSION_SECRET, ip, data.contactPhone)) return { ok: false, error: 'تعداد تلاش‌ها زیاد است؛ یک ساعت دیگر تلاش کنید یا از تماس مستقیم استفاده کنید.' }
    const result = await createVenueLead(data, SESSION_SECRET)
    return { ok: true, trackingCode: result.trackingCode, message: result.duplicate ? 'درخواست مشابه قبلاً دریافت شده؛ درخواست دیگری ایجاد نکردیم. برای پیگیری، با همان شماره وارد حساب شوید یا تماس بگیرید.' : 'درخواست دریافت شد. برای هماهنگی راه‌اندازی با شما تماس می‌گیریم؛ هنوز دسترسی پنل فعال نشده است.' }
  } catch {
    console.warn('[venue-lead] intake failed; no private payload logged')
    return { ok: false, error: 'درخواست ذخیره نشد. دوباره تلاش کنید یا از تماس مستقیم استفاده کنید.' }
  }
}
