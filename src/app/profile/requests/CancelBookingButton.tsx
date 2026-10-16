'use client'

import { useActionState } from 'react'
import { cancelBookingAction, type CancelState } from './actions'
import styles from './requests.module.css'

export function CancelBookingButton({ bookingId, revision }: { bookingId: string; revision: number }) {
  const [state, action, pending] = useActionState(cancelBookingAction, {} as CancelState)
  if (state.success) return <span role="status">درخواست لغو شد.</span>
  return <form action={action} className={styles.cancelForm}>
    <input type="hidden" name="bookingId" value={bookingId} />
    <input type="hidden" name="revision" value={revision} />
    <button type="submit" disabled={pending}>{pending ? 'در حال لغو…' : 'لغو درخواست'}</button>
    {state.error && <span role="alert" className={styles.error}>{state.error}</span>}
  </form>
}
