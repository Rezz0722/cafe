import styles from './Toast.module.css'

interface ToastProps {
  visible: boolean
  message: string
}

/**
 * Transient confirmation banner. Rendered as a live region so the message is
 * announced — it is the only feedback some of these actions give.
 */
export function Toast({ visible, message }: ToastProps) {
  return (
    <div className={styles.toast} role="status" aria-live="polite">
      {visible && <div className={styles.bubble}>{message}</div>}
    </div>
  )
}
