import { Link } from 'react-router-dom'
import { BookmarkButton } from '@/components/ui/BookmarkButton'
import { CafePhoto } from '@/components/ui/CafePhoto'
import { PRICE_LABELS } from '@/data/taxonomy'
import { fa, faDecimal } from '@/lib/format'
import { tagsByRelevance } from '@/lib/search'
import { paths } from '@/routes'
import type { Cafe } from '@/types'
import styles from './ResultCard.module.css'

interface ResultCardProps {
  cafe: Cafe
  /** Intents the user filtered on — these get highlighted and sorted first. */
  selectedTags: string[]
  saved: boolean
  onToggleSave: () => void
}

/** A single row in the search result list. */
export function ResultCard({ cafe, selectedTags, saved, onToggleSave }: ResultCardProps) {
  const tags = tagsByRelevance(cafe, selectedTags).slice(0, 2)

  return (
    <Link to={paths.cafe(cafe.id)} className={styles.card}>
      <div className={styles.media}>
        <CafePhoto alt={`فضای ${cafe.name}`} />
        <div className={styles.bookmark}>
          <BookmarkButton saved={saved} onToggle={onToggleSave} cafeName={cafe.name} />
        </div>
        <div className={`${styles.statusPill} ${cafe.isOpen ? styles.open : styles.closed}`}>
          {cafe.isOpen ? 'باز' : 'بسته'}
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.topRow}>
          <div className={styles.identity}>
            <div className={styles.name}>{cafe.name}</div>
            <div className={styles.where}>
              <span className={styles.pin} aria-hidden="true">
                ◍
              </span>
              {cafe.hood}
              <span className={styles.sep} aria-hidden="true">
                ·
              </span>
              {`${faDecimal(cafe.distanceKm)} کیلومتر`}
            </div>
          </div>

          <div className={styles.scoreCol}>
            <div className={styles.score}>
              <span className={styles.star} aria-hidden="true">
                ★
              </span>{' '}
              {faDecimal(cafe.rating)}
            </div>
            <div className={styles.scoreSub}>
              {`${fa(cafe.reviewCount)} نظر · ${PRICE_LABELS[cafe.priceKey]}`}
            </div>
          </div>
        </div>

        <div className={styles.tags}>
          {tags.map((tag) => (
            <span
              key={tag}
              className={`${styles.tag} ${selectedTags.includes(tag) ? styles.tagMatched : ''}`}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </Link>
  )
}
