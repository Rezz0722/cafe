'use client'
import { useActionState, type ReactNode } from 'react'
import type { LeadActionState } from '@/core/leads/state'
import styles from './leads.module.css'
export function LeadActionForm({ action, children, label }: { action: (state: LeadActionState, form: FormData) => Promise<LeadActionState>; children: ReactNode; label: string }) {
  const [state, submit, pending] = useActionState(action, {})
  return <form action={submit} className={styles.form} aria-busy={pending}>{children}{state.error && <p role="alert" className={styles.error}>{state.error}</p>}{state.message && <p role="status">{state.message}</p>}<button type="submit" className={styles.button} disabled={pending}>{pending ? 'در حال ذخیره…' : label}</button></form>
}
