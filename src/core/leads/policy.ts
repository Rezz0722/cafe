import { createHmac } from 'node:crypto'
import { normalizePhone } from '@/core/auth/phone'
import { cleanUserText } from '@/core/security/input'
import { normalizeFa } from '@/core/text/normalize'

export const LEAD_LABELS = { new: 'درخواست دریافت شد', contacted: 'در حال گفتگو', demo: 'هماهنگی دمو', review: 'بررسی مالکیت شعبه', active: 'پنل فعال شد', rejected: 'درخواست تأیید نشد', closed: 'درخواست بسته شد' } as const
export type LeadStatus = keyof typeof LEAD_LABELS
export interface LeadInput { contactName: string; contactPhone: string; cafeName: string; city: string; branch: string; source: string; requestKey: string; consent: boolean; website?: string }
export type LeadErrors = Partial<Record<keyof LeadInput, string>>

export function validateLead(raw: LeadInput): { data: LeadInput; errors: LeadErrors } {
  const errors: LeadErrors = {}
  const data = { ...raw, contactName: cleanUserText(raw.contactName, 120), contactPhone: normalizePhone(raw.contactPhone) ?? '', cafeName: cleanUserText(raw.cafeName, 160), city: cleanUserText(raw.city, 80), branch: cleanUserText(raw.branch, 120), source: ['home', 'cafe', 'direct'].includes(raw.source) ? raw.source : 'direct' }
  for (const [key, min, max] of [['contactName', 2, 120], ['cafeName', 2, 160], ['city', 2, 80], ['branch', 0, 120]] as const) {
    if (data[key].length < min || String(raw[key]).length > max) errors[key] = `این بخش باید بین ${min} و ${max} نویسه باشد.`
  }
  if (!data.contactPhone || raw.contactPhone.length > 20) errors.contactPhone = 'شمارهٔ موبایل معتبر وارد کنید؛ مثلاً 09123456789.'
  if (!raw.consent) errors.consent = 'برای پیگیری درخواست، رضایت تماس لازم است.'
  if (!/^[a-f0-9-]{36}$/i.test(raw.requestKey)) errors.requestKey = 'صفحه را تازه کنید و دوباره تلاش کنید.'
  if (raw.website) errors.website = 'درخواست ثبت نشد.'
  return { data, errors }
}

export function privateHash(secret: string, value: string): string {
  if (secret.length < 32) throw new Error('Lead intake is not configured')
  return createHmac('sha256', secret).update(value).digest('hex')
}
export function leadDedupe(secret: string, input: LeadInput): string {
  return privateHash(secret, JSON.stringify([input.contactPhone, ...[input.cafeName, input.city, input.branch].map(x => normalizeFa(x).replace(/\s+/g, ' ').trim())]))
}

const transitions: Record<LeadStatus, readonly LeadStatus[]> = {
  new: ['contacted', 'demo', 'review', 'rejected', 'closed'],
  contacted: ['demo', 'review', 'rejected', 'closed'],
  demo: ['contacted', 'review', 'rejected', 'closed'],
  review: ['contacted', 'demo', 'rejected', 'closed'],
  active: [], rejected: ['new'], closed: ['new'],
}
export function canChangeLead(from: LeadStatus, to: LeadStatus): boolean { return from === to || transitions[from].includes(to) }
export function canLinkLead(account: { id: string; phone: string | null; status: string; phoneVerifiedAt: Date | null }, lead: { contactPhone: string; userId: string | null }): boolean {
  return account.status === 'active' && Boolean(account.phone && account.phoneVerifiedAt) && account.phone === lead.contactPhone && (!lead.userId || lead.userId === account.id)
}
export function parseFollowUp(raw: string): Date | null {
  if (!raw) return null
  // datetime-local in this UI is explicitly Tehran time, independent of server TZ.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) throw new Error('زمان پیگیری معتبر نیست.')
  const date = new Date(`${raw}:00+03:30`)
  if (!Number.isFinite(date.getTime()) || new Date(date.getTime() + 12600000).toISOString().slice(0, 16) !== raw) throw new Error('زمان پیگیری معتبر نیست.')
  return date
}
