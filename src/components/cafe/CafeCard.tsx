import Link from 'next/link'
import { CafePhoto } from '@/components/ui/CafePhoto'
import { faDecimal } from '@/lib/format'
import { paths } from '@/routes'
import { attributeLabel } from '@/core/taxonomy/attributes'
import { PRICE_TIER_LABELS } from '@/types'
import type { PlaceView } from '@/core/places/types'
import styles from './CafeCard.module.css'

interface CafeCardProps {
  place: PlaceView
  districtName: string
  /** نشان تحریریه‌ای را می‌شود در هر بخش خاموش کرد. */
  showRibbon?: boolean
}

/**
 * کارت کافه‌ی منتخب روی صفحه‌ی اصلی.
 *
 * کل کارت یک لینک است، پس دکمه‌ی «مشاهده» تزئینی است — یک `<button>` تودرتو
 * داخل لینک، یک توقف‌گاه tab اضافه به همان مقصد می‌ساخت.
 *
 * server component است: نه hook دارد نه handler، پس اصلاً به بسته‌ی
 * جاوااسکریپت کلاینت فرستاده نمی‌شود.
 */
export function CafeCard({ place, districtName, showRibbon = true }: CafeCardProps) {
  return (
    <Link href={paths.cafe(place.slug)} className={styles.card}>
      <div className={styles.media}>
        <CafePhoto alt={`فضای ${place.name}`} src={place.photos[0]?.url} />
        {showRibbon && place.ribbon && <div className={styles.ribbon}>{place.ribbon}</div>}
      </div>

      <div className={styles.body}>
        <div className={styles.name}>{place.name}</div>
        <div className={styles.hood}>
          <span className={styles.pin} aria-hidden="true">
            ◍
          </span>
          {districtName}
        </div>

        <div className={styles.tags}>
          {place.activeAttributeIds.slice(0, 2).map((id) => (
            <span key={id} className={styles.tag}>
              {attributeLabel(id)}
            </span>
          ))}
        </div>

        <div className={styles.footer}>
          <div className={styles.meta}>
            {/*
              کافه‌ی بدون نظر «★ ۰» نشان داده نمی‌شود — صفر شبیه امتیاز بد
              به نظر می‌رسد، در حالی که یعنی «هنوز کسی نظر نداده».
            */}
            {place.ratingCount > 0 ? (
              <>
                <span className={styles.star} aria-hidden="true">
                  ★
                </span>
                <span className={styles.rating}>
                  {faDecimal(Number(place.rawRating.toFixed(1)))}
                </span>
              </>
            ) : (
              <span className={styles.noRating}>بدون نظر</span>
            )}
            <span className={styles.dot} aria-hidden="true">
              ·
            </span>
            <span className={styles.price}>{PRICE_TIER_LABELS[place.priceTier]}</span>
          </div>
          <span className={styles.cta}>مشاهده</span>
        </div>
      </div>
    </Link>
  )
}
