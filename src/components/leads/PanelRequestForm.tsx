'use client'
import { useActionState, useState } from 'react'
import Link from 'next/link'
import { requestPanelAction } from '@/app/for-cafes/actions'
import { authUrl } from '@/routes'
import type { LeadActionState } from '@/core/leads/state'
import styles from './leads.module.css'

const fields = [
  { name: 'contactName', label: 'نام شما', max: 120, required: true, auto: 'name' },
  { name: 'contactPhone', label: 'موبایل برای تماس', max: 20, required: true, auto: 'tel' },
  { name: 'cafeName', label: 'نام کافه', max: 160, required: true, auto: 'organization' },
  { name: 'city', label: 'شهر', max: 80, required: true, auto: 'address-level2' },
  { name: 'branch', label: 'نام یا محلهٔ شعبه (اختیاری)', max: 120, required: false, auto: 'off' },
] as const

export function PanelRequestForm({ requestKey, source }: { requestKey: string; source: string }) {
  const [state, action, pending] = useActionState<LeadActionState, FormData>(requestPanelAction, {})
  const [values, setValues] = useState({ contactName: '', contactPhone: '', cafeName: '', city: '', branch: '' })
  const [consent, setConsent] = useState(false)
  if (state.ok) return <div className={styles.receipt} role="status"><h3>درخواست شما دریافت شد</h3><p>{state.message}</p>{state.trackingCode && <p>کد پیگیری: <code dir="ltr">{state.trackingCode}</code></p>}<p>کد را نگه دارید. جزئیات درخواست عمومی نیست و فقط در حساب دارای همین شمارهٔ تأییدشده نمایش داده می‌شود.</p><Link className={styles.button} href={authUrl('/profile/venue-requests')}>ورود و پیگیری درخواست</Link></div>
  return <form action={action} className={styles.form} aria-busy={pending} aria-describedby="request-help">
    <p id="request-help">بدون ورود درخواست بدهید. این فرم برای گفتگو دربارهٔ پنل است، نه انتشار کافه یا تأیید مالکیت.</p>
    <input type="hidden" name="requestKey" value={requestKey} /><input type="hidden" name="source" value={source} />
    <div className={styles.fields}>{fields.map(f => <div key={f.name} className={styles.field}>
      <label htmlFor={`lead-${f.name}`}>{f.label}{f.required && <span> *</span>}</label>
      <input id={`lead-${f.name}`} name={f.name} type={f.name === 'contactPhone' ? 'tel' : 'text'} inputMode={f.name === 'contactPhone' ? 'tel' : undefined} dir={f.name === 'contactPhone' ? 'ltr' : undefined} autoComplete={f.auto} maxLength={f.max} required={f.required} value={values[f.name]} onChange={e => setValues({ ...values, [f.name]: e.target.value })} aria-invalid={Boolean(state.errors?.[f.name])} aria-describedby={state.errors?.[f.name] ? `lead-error-${f.name}` : undefined} />
      {state.errors?.[f.name] && <p id={`lead-error-${f.name}`} className={styles.error}>{state.errors[f.name]}</p>}
    </div>)}</div>
    <div className={styles.honeypot} aria-hidden="true"><label htmlFor="lead-website">Website</label><input id="lead-website" name="website" tabIndex={-1} autoComplete="off" /></div>
    <label className={styles.consent}><input type="checkbox" name="consent" value="yes" checked={consent} onChange={e => setConsent(e.target.checked)} required aria-invalid={Boolean(state.errors?.consent)} aria-describedby="consent-help" /><span>اجازه می‌دهم تیم کو کافه فقط برای پیگیری این درخواست با من تماس بگیرد.</span></label>
    <p id="consent-help" className={state.errors?.consent ? styles.error : styles.muted}>{state.errors?.consent || 'رضایت تماس، عضویت در پیامک تبلیغاتی نیست. برای توقف پیگیری با پشتیبانی تماس بگیرید.'}</p>
    {state.error && <p role="alert" className={styles.error}>{state.error}</p>}
    <button className={styles.button} disabled={pending} type="submit">{pending ? 'در حال ثبت درخواست…' : 'ثبت درخواست پنل'}</button>
  </form>
}
