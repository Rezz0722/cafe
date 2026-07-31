'use client'

import type { ButtonHTMLAttributes } from 'react'
import Link from 'next/link'
import styles from './Chip.module.css'

type ChipVariant = 'solid' | 'outline' | 'suggest'
type ChipSize = 'sm' | 'md' | 'lg'

interface ChipLook {
  selected?: boolean
  variant?: ChipVariant
  size?: ChipSize
}

function chipClass({ selected = false, variant = 'outline', size = 'md' }: ChipLook): string {
  return [styles.chip, styles[variant], styles[size], selected && styles.selected]
    .filter(Boolean)
    .join(' ')
}

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'>, ChipLook {
  label: string
}

/**
 * The pill-shaped toggle used for filters, intents and quick suggestions.
 * `selected` drives `aria-pressed` so screen readers report the toggle state.
 *
 * چون `onClick` از بیرون به این دکمه پاس داده می‌شود، کل فایل `'use client'`
 * است — یک هندلر رویداد فقط در مرز کلاینت معنا دارد.
 */
export function Chip({ label, selected = false, variant, size, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      className={chipClass({ selected, variant, size })}
      aria-pressed={selected}
      {...rest}
    >
      {label}
    </button>
  )
}

interface ChipLinkProps extends ChipLook {
  label: string
  href: string
}

/**
 * A chip that navigates. Separate from `Chip` because a chip that goes somewhere
 * has to be an anchor — nesting a button inside a link is invalid and breaks
 * middle-click and "open in new tab".
 */
export function ChipLink({ label, href, selected, variant, size }: ChipLinkProps) {
  return (
    <Link href={href} className={chipClass({ selected, variant, size })}>
      {label}
    </Link>
  )
}
