'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { respondParticipationAction, type EventActionState } from './actions'
import styles from './events.module.css'

export function ParticipationResponseForm({ placeId, eventId, participationId, revision }: {
  placeId: number; eventId: string; participationId: string; revision: number
}) {
  const [decision, setDecision] = useState<'confirmed' | 'rejected'>('confirmed')
  const [state, action, pending] = useActionState(respondParticipationAction, {} as EventActionState)
  const router = useRouter(), refreshed = useRef(false)
  useEffect(() => { if (state.success && !refreshed.current) { refreshed.current = true; router.refresh() } }, [state.success, router])
  return <form action={action} className={styles.actionForm}>
    <input type="hidden" name="placeId" value={placeId} /><input type="hidden" name="eventId" value={eventId} />
    <input type="hidden" name="participationId" value={participationId} /><input type="hidden" name="revision" value={revision} />
    <fieldset><legend>پاسخ کافه</legend><label><input type="radio" name="decision" value="confirmed" checked={decision === 'confirmed'} onChange={() => setDecision('confirmed')} /> تأیید</label>
      <label><input type="radio" name="decision" value="rejected" checked={decision === 'rejected'} onChange={() => setDecision('rejected')} /> رد</label></fieldset>
    <label>پیام به کاربر {decision === 'rejected' ? '(الزامی)' : '(اختیاری)'}<textarea name="response" rows={2} maxLength={500} required={decision === 'rejected'} /></label>
    {state.error && <p role="alert" className={styles.error}>{state.error}</p>}
    {state.success && <p role="status" className={styles.success}>{state.success}</p>}
    <button type="submit" disabled={pending || Boolean(state.success)}>{pending ? 'در حال ثبت…' : decision === 'confirmed' ? 'تأیید شرکت' : 'رد با دلیل'}</button>
  </form>
}
