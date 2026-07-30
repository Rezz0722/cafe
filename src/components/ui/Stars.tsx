import { fa } from '@/lib/format'

interface StarsProps {
  /** Whole stars to fill, 0–5. */
  count: number
}

/**
 * Star row for reviews. The accessible label carries the number, so the stars
 * themselves are hidden from assistive tech instead of read out five times.
 */
export function Stars({ count }: StarsProps) {
  const filled = Math.max(0, Math.min(5, Math.round(count)))

  return (
    <span style={{ color: 'var(--c-accent)', fontSize: '14px', letterSpacing: '1px' }}>
      <span aria-hidden="true">{'★'.repeat(filled)}</span>
      <span className="visually-hidden">{fa(filled)} از ۵</span>
    </span>
  )
}
