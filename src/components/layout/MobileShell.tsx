import type { ReactNode } from 'react'
import styles from './MobileShell.module.css'

export { styles as shellStyles }

/**
 * Phone-width frame for the app screens. The home page is a full responsive
 * marketing page and deliberately does not use this.
 */
export function MobileShell({ children }: { children: ReactNode }) {
  return <div className={styles.shell}>{children}</div>
}

/** Back chevron. Points left in RTL, which is "back" for a right-to-left reader. */
export function BackChevron() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}
