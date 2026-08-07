import Link from 'next/link'
import { fa, toman } from '@/lib/format'
import { paths } from '@/routes'
import styles from './PlaceCardView.module.css'
import { Coffee, Star } from 'lucide-react'

/**
 * کارت کافه در فهرست و نتیجه‌ی جست‌وجو.
 *
 * ═══ چه چیزی روی کارت است و چرا ═══
 *
 * فقط چیزهایی که در تصمیمِ «کلیک کنم یا نه» نقش دارند:
 *
 *   نام + نوع + محله      هویت
 *   میانگین قیمت منو      اولین سؤال واقعی کاربر ایرانی
 *   فاصله                 وقتی موقعیت داریم
 *   قیمت دیشِ فیلترشده    در «بهترین پاستا نزدیک من»، پاستای همین کافه چند است
 *   دسته‌های شاخص         «پاستا · برگر · صبحانه»
 *
 * امتیاز عمداً **نیست** مگر نظری وجود داشته باشد: ستاره‌ی خالی یا «۴٫۲ از ۰
 * نظر» به کاربر اطلاعاتی نمی‌دهد و فقط اعتماد به بقیه‌ی داده را خراب می‌کند.
 */

export interface CardData {
  id: number
  slug: string
  name: string
  kind: string
  coords: { lat: number; lng: number } | null
  districtName: string | null
  priceTier: number
  priceMedian: number | null
  signatureItem: string | null
  ribbon: string | null
  logo: { url: string; width: number | null; height: number | null } | null
  rating: number
  ratingCount: number
  facetIds: string[]
  /** از سرور در حالت فیلتر دیش، یا از کلاینت بعد از گرفتن موقعیت. */
  dishPrice?: number | null
  distanceKm?: number | null
}

const KIND_LABELS: Record<string, string> = {
  cafe: 'کافه',
  cafe_restaurant: 'کافه‌رستوران',
  restaurant: 'رستوران',
  bakery: 'بیکری',
  lounge: 'لانژ',
  shop: 'فروشگاه',
}

const TIER_MARK: Record<number, string> = { 1: 'ارزان', 2: 'متوسط', 3: 'گران' }

/** برچسب فارسی چند facet پرکاربرد — برای نمایش روی کارت بدون پرس‌وجوی دوم. */
const FACET_LABELS: Record<string, string> = {
  coffee: 'قهوه',
  cold_coffee: 'قهوه سرد',
  brewed_coffee: 'دمی',
  matcha: 'ماچا',
  tea: 'چای',
  hot_drinks: 'نوشیدنی گرم',
  mocktail: 'ماکتیل',
  shake: 'شیک',
  smoothie: 'اسموتی',
  juice: 'آبمیوه',
  breakfast: 'صبحانه',
  bakery: 'بیکری',
  cake_dessert: 'کیک و دسر',
  ice_cream: 'بستنی',
  pasta: 'پاستا',
  pizza: 'پیتزا',
  burger: 'برگر',
  sandwich: 'ساندویچ',
  steak: 'استیک',
  fried: 'سوخاری',
  salad: 'سالاد',
  appetizer: 'پیش غذا',
  sushi: 'سوشی',
  healthy: 'رژیمی',
  persian_food: 'غذای ایرانی',
  kebab: 'کباب',
  seafood: 'دریایی',
  main_dish: 'غذای اصلی',
  fast_food: 'فست فود',
  hookah: 'قلیان',
}

function formatDistance(km: number): string {
  return km < 1 ? `${fa(Math.round(km * 1000))} متر` : `${fa(km.toFixed(1))} کیلومتر`
}

export function PlaceCardView({
  card,
  dishLabel,
}: {
  card: CardData
  /** نام دیشی که فیلتر رویش اعمال شده — «پاستا آلفردو: ۴۲۰ هزار». */
  dishLabel?: string | null
}) {
  const facetChips = card.facetIds
    .map((id) => FACET_LABELS[id])
    .filter(Boolean)
    .slice(0, 4)

  return (
    <Link href={paths.cafe(card.slug)} className={styles.card}>
      {card.logo ? (
        <img
          src={card.logo.url}
          alt=""
          width={card.logo.width ?? 72}
          height={card.logo.height ?? 72}
          loading="lazy"
          className={styles.logo}
        />
      ) : (
        <span className={styles.logoEmpty} aria-hidden="true">
          <Coffee size={24} strokeWidth={1.6} />
        </span>
      )}

      <div className={styles.body}>
        <div className={styles.topRow}>
          <h3 className={styles.name}>{card.name}</h3>
          {card.ribbon && <span className={styles.ribbon}>{card.ribbon}</span>}
        </div>

        <p className={styles.meta}>
          <span>{KIND_LABELS[card.kind] ?? 'کافه'}</span>
          {card.districtName && <span>· {card.districtName}</span>}
          {card.distanceKm !== null && card.distanceKm !== undefined && (
            <span className={styles.distance}>· {formatDistance(card.distanceKm)}</span>
          )}
          {card.ratingCount > 0 && (
            <span className={styles.rating}>
              · <Star size={12} className={styles.starIcon} aria-hidden="true" /> {fa(card.rating.toFixed(1))} ({fa(card.ratingCount)})
            </span>
          )}
        </p>

        {facetChips.length > 0 && (
          <p className={styles.facets}>{facetChips.join(' · ')}</p>
        )}

        {card.signatureItem && <p className={styles.signature}>ویژه: {card.signatureItem}</p>}
      </div>

      <div className={styles.priceCol}>
        {/* در حالت فیلتر دیش، قیمتِ همان دیش مهم‌تر از میانگین کل منوست:
            کاربری که «بهترین پاستا» را می‌جوید، قیمت پاستا را می‌خواهد. */}
        {dishLabel && card.dishPrice !== null && card.dishPrice !== undefined ? (
          <>
            <span className={styles.dishPrice}>{toman(card.dishPrice)}</span>
            <span className={styles.priceLabel}>{dishLabel}</span>
          </>
        ) : card.priceMedian !== null ? (
          <>
            <span className={styles.price}>{toman(card.priceMedian)}</span>
            <span className={styles.priceLabel}>میانگین منو</span>
          </>
        ) : (
          <span className={styles.priceLabel}>قیمت ثبت نشده</span>
        )}
        <span className={styles.tier}>{TIER_MARK[card.priceTier]}</span>
      </div>
    </Link>
  )
}

export default PlaceCardView
