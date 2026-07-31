'use client'

import Link from 'next/link'
import { BookmarkButton } from '@/components/ui/BookmarkButton'
import { CafePhoto } from '@/components/ui/CafePhoto'
import { fa, faDecimal } from '@/lib/format'
import { paths } from '@/routes'
import { attributeLabel } from '@/core/taxonomy/attributes'
import { PRICE_TIER_LABELS } from '@/types'
import type { PlaceView } from '@/core/places/types'
import styles from './ResultCard.module.css'

interface ResultCardProps {
  place: PlaceView
  /** نیت‌هایی که کاربر فیلتر کرده — این‌ها برجسته و اول نمایش داده می‌شوند. */
  selectedAttributeIds: string[]
  saved: boolean
  onToggleSave: () => void
}

/** ویژگی‌های منطبق با فیلتر کاربر اول می‌آیند. */
function attributesByRelevance(place: PlaceView, selected: string[]): string[] {
  return [...place.activeAttributeIds].sort(
    (a, b) => Number(selected.includes(b)) - Number(selected.includes(a)),
  )
}

/** یک ردیف در فهرست نتایج جست‌وجو. */
export function ResultCard({
  place,
  selectedAttributeIds,
  saved,
  onToggleSave,
}: ResultCardProps) {
  const shown = attributesByRelevance(place, selectedAttributeIds).slice(0, 2)

  return (
    <Link href={paths.cafe(place.slug)} className={styles.card}>
      <div className={styles.media}>
        <CafePhoto alt={`فضای ${place.name}`} src={place.photos[0]?.url} />
        <div className={styles.bookmark}>
          <BookmarkButton saved={saved} onToggle={onToggleSave} cafeName={place.name} />
        </div>
        <div
          className={`${styles.statusPill} ${place.isOpenNow ? styles.open : styles.closed}`}
        >
          {place.isOpenNow ? 'باز' : 'بسته'}
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.topRow}>
          <div className={styles.identity}>
            <div className={styles.name}>{place.name}</div>
            <div className={styles.where}>
              <span className={styles.pin} aria-hidden="true">
                ◍
              </span>
              {place.address.split('،')[1]?.trim() || place.address}
              {place.distanceKm !== null && (
                <>
                  <span className={styles.sep} aria-hidden="true">
                    ·
                  </span>
                  {`${faDecimal(Number(place.distanceKm.toFixed(1)))} کیلومتر`}
                </>
              )}
            </div>
          </div>

          <div className={styles.scoreCol}>
            {/* بدون نظر یعنی «هنوز کسی نظر نداده»، نه امتیاز صفر. */}
            {place.ratingCount > 0 ? (
              <>
                <div className={styles.score}>
                  <span className={styles.star} aria-hidden="true">
                    ★
                  </span>{' '}
                  {faDecimal(Number(place.rawRating.toFixed(1)))}
                </div>
                <div className={styles.scoreSub}>
                  {`${fa(place.ratingCount)} نظر · ${PRICE_TIER_LABELS[place.priceTier]}`}
                </div>
              </>
            ) : (
              <div className={styles.scoreSub}>
                {`بدون نظر · ${PRICE_TIER_LABELS[place.priceTier]}`}
              </div>
            )}
          </div>
        </div>

        <div className={styles.tags}>
          {shown.map((id) => (
            <span
              key={id}
              className={`${styles.tag} ${
                selectedAttributeIds.includes(id) ? styles.tagMatched : ''
              }`}
            >
              {attributeLabel(id)}
            </span>
          ))}
        </div>
      </div>
    </Link>
  )
}
