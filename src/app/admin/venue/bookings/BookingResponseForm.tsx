'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { respondBookingAction, type VenueBookingActionState } from './actions'
import styles from './bookings.module.css'

export function BookingResponseForm({ placeId, bookingId, revision, status }: {
  placeId: number; bookingId: string; revision: number; status: string
}) {
  const [decision, setDecision] = useState<'confirmed' | 'rejected' | 'completed'>(status === 'confirmed' ? 'completed' : 'confirmed')
  const [state, action, pending] = useActionState(respondBookingAction, {} as VenueBookingActionState)
  const router = useRouter()
  const refreshed = useRef(false)
  useEffect(() => { if (state.success && !refreshed.current) { refreshed.current = true; router.refresh() } }, [state.success, router])
  if (status !== 'pending' && status !== 'confirmed') return null
  return <form action={action} className={styles.responseForm}>
    <input type="hidden" name="placeId" value={placeId} />
    <input type="hidden" name="bookingId" value={bookingId} />
    <input type="hidden" name="revision" value={revision} />
    {status === 'pending' ? <fieldset><legend>پاسخ به درخواست</legend>
      <label><input type="radio" name="decision" value="confirmed" checked={decision === 'confirmed'} onChange={() => setDecision('confirmed')} /> تأیید توسط کافه</label>
      <label><input type="radio" name="decision" value="rejected" checked={decision === 'rejected'} onChange={() => setDecision('rejected')} /> رد درخواست</label>
    </fieldset> : <input type="hidden" name="decision" value="completed" />}
    {status === 'pending' && <label>پیام برای کاربر{decision === 'rejected' ? ' (الزامی)' : ' (اختیاری)'}
      <textarea name="response" rows={3} maxLength={1000} required={decision === 'rejected'} placeholder={decision === 'rejected' ? 'دلیل رد درخواست را محترمانه توضیح دهید' : 'جزئیات هماهنگی را بنویسید'} />
    </label>}
    {status === 'confirmed' && <p>فقط پس از انجام واقعی مراجعه، وضعیت را «انجام‌شده» کنید.</p>}
    {state.error && <p role="alert" className={styles.error}>{state.error}</p>}
    {state.success && <p role="status" className={styles.success}>{state.success}</p>}
    <button type="submit" disabled={pending || Boolean(state.success)}>{pending ? 'در حال ثبت…' : status === 'confirmed' ? 'ثبت انجام مراجعه' : decision === 'confirmed' ? 'تأیید صریح درخواست' : 'رد درخواست با دلیل'}</button>
  </form>
}
