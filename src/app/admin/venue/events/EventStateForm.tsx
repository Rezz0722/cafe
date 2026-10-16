'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { transitionEventAction, type EventActionState } from './actions'
import styles from './events.module.css'

export function EventStateForm({ placeId, eventId, revision, status, ended }: {
  placeId: number; eventId: string; revision: number; status: string; ended: boolean
}) {
  const [state, action, pending] = useActionState(transitionEventAction, {} as EventActionState)
  const router = useRouter(), refreshed = useRef(false)
  useEffect(() => { if (state.success && !refreshed.current) { refreshed.current = true; router.refresh() } }, [state.success, router])
  if (status !== 'draft' && status !== 'published') return null
  return <form action={action} className={styles.actionForm}>
    <input type="hidden" name="placeId" value={placeId} /><input type="hidden" name="eventId" value={eventId} />
    <input type="hidden" name="revision" value={revision} />
    {status === 'draft' ? <><input type="hidden" name="next" value="published" /><p>با انتشار، جزئیات رویداد برای همه قابل مشاهده می‌شود. زمان و شرایط را پیش از تأیید بررسی کنید.</p></>
      : <label>تغییر وضعیت<select name="next" defaultValue="cancelled"><option value="cancelled">لغو رویداد</option>{ended && <option value="ended">ثبت پایان رویداد</option>}</select></label>}
    {state.error && <p role="alert" className={styles.error}>{state.error}</p>}
    {state.success && <p role="status" className={styles.success}>{state.success}</p>}
    <button type="submit" disabled={pending || Boolean(state.success)}>{pending ? 'در حال ثبت…' : status === 'draft' ? 'تأیید و انتشار رویداد' : 'ثبت وضعیت رویداد'}</button>
  </form>
}
