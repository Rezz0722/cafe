import type { MouseEvent } from 'react'
import styles from './BookmarkButton.module.css'

interface BookmarkButtonProps {
  saved: boolean
  onToggle: () => void
  /** Name of the venue, folded into the accessible label. */
  cafeName: string
}

/**
 * Save/unsave toggle. Result cards are themselves clickable, so the click is
 * stopped from bubbling into the card's navigation.
 */
export function BookmarkButton({ saved, onToggle, cafeName }: BookmarkButtonProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    event.preventDefault()
    onToggle()
  }

  return (
    <button
      type="button"
      className={styles.button}
      onClick={handleClick}
      aria-pressed={saved}
      aria-label={saved ? `حذف ${cafeName} از ذخیره‌شده‌ها` : `ذخیرهٔ ${cafeName}`}
    >
      <svg
        className={styles.icon}
        viewBox="0 0 24 24"
        fill={saved ? 'var(--c-accent)' : 'none'}
        stroke={saved ? 'var(--c-accent)' : 'var(--c-ink)'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  )
}
