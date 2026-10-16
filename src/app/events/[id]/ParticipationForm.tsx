'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { EVENT_PARTICIPATION_LABEL } from '@/core/events/presentation'
import { paths } from '@/routes'
import { participateInEventAction, type ParticipationState } from './actions'
import styles from './event.module.css'

export function ParticipationForm({ eventId, mode }: { eventId: string; mode: 'interest' | 'request' }) {
  const [state, action, pending] = useActionState(participateInEventAction, {} as ParticipationState)
  if (state.status) return <div className={styles.success} role="status"><strong>{EVENT_PARTICIPATION_LABEL[state.status]}</strong>
    <p>{state.status === 'pending' ? 'درخواست شرکت هنوز قطعی نیست و کافه باید پاسخ دهد.' : 'این ثبت به معنی بلیت یا حضور تضمین‌شده نیست.'}</p>
    <Link href={paths.myEvents}>پیگیری در حساب من</Link></div>
  return <form action={action} className={styles.form}>
    <input type="hidden" name="eventId" value={eventId} />
    <label>پیام برای کافه (اختیاری)<textarea name="note" maxLength={500} rows={3} placeholder="اگر نکته‌ای برای هماهنگی دارید بنویسید" /></label>
    <label className={styles.consent}><input type="checkbox" name="consent" required />
      {mode === 'request' ? 'می‌دانم این فقط درخواست شرکت است و شمارهٔ تأییدشدهٔ حسابم برای پاسخ در اختیار کافه قرار می‌گیرد.' : 'می‌دانم ثبت علاقه‌مندی، حضور یا بلیت قطعی نیست.'}
    </label>
    {state.error && <p className={styles.error} role="alert">{state.error}</p>}
    <button type="submit" disabled={pending}>{pending ? 'در حال ثبت…' : mode === 'request' ? 'ارسال درخواست شرکت' : 'ثبت علاقه‌مندی'}</button>
  </form>
}
