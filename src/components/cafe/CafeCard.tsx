import Link from 'next/link'
import { faDecimal, toman } from '@/lib/format'
import { paths } from '@/routes'
import { PRICE_TIER_LABELS } from '@/types'
import type { PlaceCard } from '@/core/places/queries'
import styles from './CafeCard.module.css'
import { Coffee, MapPin, Star } from 'lucide-react'

interface CafeCardProps {
  card: PlaceCard
  /**
   * برچسب فارسی facetها. از `listFilterFacets()` ساخته می‌شود و از بیرون
   * تزریق می‌شود، تا نگاشت دستیِ دومی در پروژه نماند: صفحه یک‌بار واژگان را
   * می‌خواند و همان را به همه‌ی کارت‌ها می‌دهد.
   */
  facetLabels: Record<string, string>
  /** نشان تحریریه‌ای را می‌شود در هر بخش خاموش کرد. */
  showRibbon?: boolean
  /** دادهٔ سبک برای ثبت کلیک در صفحهٔ Experience؛ handler روی خود کارت نیست. */
  experienceTracking?: {
    slug: string
    resultCount: number
    rank: number
  }
}

const TAG_LIMIT = 2

/**
 * کارت کافه‌ی منتخب روی صفحه‌ی اصلی — کارت بلندِ عکس‌دار.
 *
 * با `PlaceCardView` اشتباه نشود: آن ردیفِ افقیِ فهرست نتایج است، این کارتِ
 * گریدِ صفحه‌ی اول.
 *
 * کل کارت یک لینک است، پس دکمه‌ی «مشاهده» تزئینی است — یک `<button>` تودرتو
 * داخل لینک، یک توقف‌گاه tab اضافه به همان مقصد می‌ساخت.
 *
 * server component است: نه hook دارد نه handler، پس اصلاً به بسته‌ی
 * جاوااسکریپت کلاینت فرستاده نمی‌شود.
 */
export function CafeCard({ card, facetLabels, showRibbon = true, experienceTracking }: CafeCardProps) {
  const tags = card.facetIds
    .map((id) => facetLabels[id])
    .filter(Boolean)
    .slice(0, TAG_LIMIT)

  const image = card.cover ?? card.logo

  return (
    <Link
      href={paths.cafe(card.slug)}
      className={styles.card}
      data-experience-track={experienceTracking ? 'result_click' : undefined}
      data-experience-slug={experienceTracking?.slug}
      data-experience-count={experienceTracking?.resultCount}
      data-experience-place-id={experienceTracking ? card.id : undefined}
      data-experience-rank={experienceTracking?.rank}
    >
      <div className={styles.media}>
        {image ? (
          <img
            className={styles.photo}
            src={image.url}
            alt={`تصویر ثبت‌شده برای ${card.name}`}
            width={image.width ?? 400}
            height={image.height ?? 300}
            loading="lazy"
          />
        ) : (
          <span className={styles.photoEmpty} aria-hidden="true">
            <Coffee size={26} strokeWidth={1.6} />
          </span>
        )}
        {showRibbon && card.ribbon && <div className={styles.ribbon}>{card.ribbon}</div>}
        {Number(card.bloggerReviewCount)>0 && <span className={styles.bloggerBadge}>بررسی بلاگرها</span>}
      </div>

      <div className={styles.body}>
        <div className={styles.name}>{card.name}</div>
        {card.districtName && (
          <div className={styles.hood}>
            <span className={styles.pin} aria-hidden="true">
              <MapPin size={13} />
            </span>
            {card.districtName}
          </div>
        )}

        {tags.length > 0 && (
          <div className={styles.tags}>
            {tags.map((label) => (
              <span key={label} className={styles.tag}>
                {label}
              </span>
            ))}
          </div>
        )}

        <div className={styles.footer}>
          <div className={styles.meta}>
            {/*
              ستاره فقط وقتی نظری وجود دارد. هیچ‌کدام از ۳۲۶ مکان فعلاً نظر
              ثبت‌شده ندارد، پس `rating` صرفاً پیشِ‌فرض بیزی است — یک عددِ
              یکسان روی هر ۶ کارت. همان قاعده‌ای که `PlaceCardView` هم دارد.
            */}
            {card.ratingCount > 0 && (
              <>
                <span className={styles.star} aria-hidden="true">
                  <Star size={13} className={styles.starIcon} />
                </span>
                <span className={styles.rating}>{faDecimal(Number(card.rating.toFixed(1)))}</span>
                <span className={styles.dot} aria-hidden="true">
                  ·
                </span>
              </>
            )}
            <span className={styles.price}>
              {card.priceMedian !== null
                ? toman(card.priceMedian)
                : PRICE_TIER_LABELS[card.priceTier]}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

export default CafeCard
