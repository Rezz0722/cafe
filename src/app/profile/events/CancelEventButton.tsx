'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { cancelEventAction, type CancelEventState } from './actions'
import styles from './events.module.css'

export function CancelEventButton({ participationId, revision }: { participationId: string; revision: number }) {
  const [state, action, pending] = useActionState(cancelEventAction, {} as CancelEventState)
  const router = useRouter(), refreshed = useRef(false)
  useEffect(() => { if (state.success && !refreshed.current) { refreshed.current = true; router.refresh() } }, [state.success, router])
  return <form action={action} className={styles.cancelForm}>
    <input type="hidden" name="participationId" value={participationId} /><input type="hidden" name="revision" value={revision} />
    <button type="submit" disabled={pending || Boolean(state.success)}>{pending ? 'در حال لغو…' : 'لغو درخواست'}</button>
    {state.error && <span role="alert">{state.error}</span>}{state.success && <span role="status">{state.success}</span>}
  </form>
}
