import { Link } from 'react-router-dom'
import { CafePhoto } from '@/components/ui/CafePhoto'
import { PRICE_LABELS } from '@/data/taxonomy'
import { faDecimal } from '@/lib/format'
import { paths } from '@/routes'
import type { Cafe } from '@/types'
import styles from './CafeCard.module.css'

interface CafeCardProps {
  cafe: Cafe
  /** Editorial badges can be switched off per-section. */
  showRibbon?: boolean
}

/**
 * The featured-venue card on the home page. The whole card is one link, so the
 * "مشاهده" button is decorative — a nested <button> inside the link would be a
 * second tab stop to the same destination.
 */
export function CafeCard({ cafe, showRibbon = true }: CafeCardProps) {
  return (
    <Link to={paths.cafe(cafe.id)} className={styles.card}>
      <div className={styles.media}>
        <CafePhoto alt={`فضای ${cafe.name}`} />
        {showRibbon && cafe.ribbon && <div className={styles.ribbon}>{cafe.ribbon}</div>}
      </div>

      <div className={styles.body}>
        <div className={styles.name}>{cafe.name}</div>
        <div className={styles.hood}>
          <span className={styles.pin} aria-hidden="true">
            ◍
          </span>
          {cafe.hood}
        </div>

        <div className={styles.tags}>
          {cafe.tags.slice(0, 2).map((tag) => (
            <span key={tag} className={styles.tag}>
              {tag}
            </span>
          ))}
        </div>

        <div className={styles.footer}>
          <div className={styles.meta}>
            <span className={styles.star} aria-hidden="true">
              ★
            </span>
            <span className={styles.rating}>{faDecimal(cafe.rating)}</span>
            <span className={styles.dot} aria-hidden="true">
              ·
            </span>
            <span className={styles.price}>{PRICE_LABELS[cafe.priceKey]}</span>
          </div>
          <span className={styles.cta}>مشاهده</span>
        </div>
      </div>
    </Link>
  )
}
