import { absoluteUrl, paths } from '@/routes'

/**
 * JSON-LD برای schema.org.
 *
 * سمت *سرور* رندر می‌شود. گوگل داده‌ی ساخت‌یافته‌ای را که با جاوااسکریپت بعداً
 * تزریق شود کم‌ارزش‌تر می‌بیند، و برای دامنه‌ی تازه ممکن است اصلاً نبیندش.
 *
 * ═══ چرا props شکل خودش را دارد و نه `PlaceDetail` را ═══
 *
 * این کامپوننت فقط زیرمجموعه‌ی کوچکی از داده را لازم دارد. گرفتنِ کل
 * `PlaceDetail` یعنی هر تغییری در آن تایپ، اینجا هم باید بازبینی شود، و یعنی
 * برای رندر JSON-LD در جایی مثل صفحه‌ی محله باید کل منو خوانده شود.
 *
 * ═══ قاعده‌ی سخت ═══
 *
 * هیچ فیلدی از هوا ساخته نمی‌شود. `aggregateRating` فقط وقتی می‌آید که واقعاً
 * نظری وجود داشته باشد — ساختن آن نقض راهنمای گوگل است و به جریمه‌ی دستی
 * منجر می‌شود. `hasMenu` فقط آیتم‌های **قیمت‌دار** را می‌آورد، چون
 * `Offer` بدون `price` داده‌ی نامعتبر است.
 */

/** schema.org روزهای هفته را با نام انگلیسی می‌خواهد. */
const SCHEMA_DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

const KIND_TO_SCHEMA: Record<string, string> = {
  cafe: 'CafeOrCoffeeShop',
  cafe_restaurant: 'Restaurant',
  restaurant: 'Restaurant',
  bakery: 'Bakery',
  lounge: 'Restaurant',
  shop: 'Store',
}

const PRICE_RANGE: Record<number, string> = { 1: '$', 2: '$$', 3: '$$$' }

export interface JsonLdMenuItem {
  name: string
  description?: string | null
  price: number | null
}

export interface JsonLdMenuSection {
  name: string
  items: JsonLdMenuItem[]
}

export interface PlaceJsonLdProps {
  name: string
  slug: string
  kind?: string
  address: string
  coords: { lat: number; lng: number } | null
  phone?: string | null
  priceTier?: number
  /** میانگین نمایشی — فقط وقتی `ratingCount > 0` استفاده می‌شود. */
  rating?: number
  ratingCount?: number
  imageUrl?: string | null
  description?: string | null
  /** یک ردیف به‌ازای هر روز، با همه‌ی شیفت‌هایش. */
  hours?: { dow: number; ranges: string[] }[]
  menu?: JsonLdMenuSection[]
}

/**
 * شهر و استان از تنظیمات می‌آیند.
 *
 * قبلاً «مشهد» و «خراسان رضوی» در همین فایل هاردکد بودند. برای راه‌اندازی
 * سایت در شهر دیگر، این یعنی ویرایش کد — دقیقاً چیزی که قرار است لازم نباشد.
 */
export interface JsonLdLocale {
  cityName: string
  regionName: string
  countryCode: string
}

const DEFAULT_LOCALE: JsonLdLocale = {
  cityName: 'مشهد',
  regionName: 'خراسان رضوی',
  countryCode: 'IR',
}

export function PlaceJsonLd({
  place,
  locale = DEFAULT_LOCALE,
}: {
  place: PlaceJsonLdProps
  locale?: JsonLdLocale
}) {
  const url = absoluteUrl(paths.cafe(place.slug))

  /**
   * ساعت کاری با شیفت شکسته.
   *
   * schema.org برای هر بازه یک `OpeningHoursSpecification` جدا می‌خواهد، پس
   * روزِ دوشیفته دو ردیف می‌شود. ادغامشان در یک بازه‌ی «۱۲:۰۰ تا ۲۳:۳۰»
   * به گوگل می‌گفت این مکان ساعت ۱۸ باز است، که نیست.
   */
  const openingHours = (place.hours ?? []).flatMap((day) =>
    day.ranges.map((range) => {
      const [opens, closes] = range.split('–')
      return {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: SCHEMA_DAYS[day.dow],
        opens,
        closes,
      }
    }),
  )

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': KIND_TO_SCHEMA[place.kind ?? 'cafe'] ?? 'LocalBusiness',
    '@id': url,
    name: place.name,
    url,
    address: {
      '@type': 'PostalAddress',
      streetAddress: place.address,
      addressLocality: locale.cityName,
      addressRegion: locale.regionName,
      addressCountry: locale.countryCode,
    },
    priceRange: PRICE_RANGE[place.priceTier ?? 2] ?? '$$',
  }

  if (place.description) data.description = place.description
  if (place.phone) data.telephone = place.phone
  if (place.imageUrl) data.image = absoluteUrl(place.imageUrl)
  if (openingHours.length) data.openingHoursSpecification = openingHours

  if (place.coords) {
    data.geo = {
      '@type': 'GeoCoordinates',
      latitude: place.coords.lat,
      longitude: place.coords.lng,
    }
  }

  if ((place.ratingCount ?? 0) > 0 && place.rating !== undefined) {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: place.rating.toFixed(1),
      reviewCount: place.ratingCount,
      bestRating: 5,
      worstRating: 1,
    }
  }

  /**
   * منو در JSON-LD.
   *
   * ۱۹٬۳۸۶ آیتم در کل سایت داریم و یک منوی ۲۸۷ آیتمی، JSON-LD را چند صد
   * کیلوبایت می‌کند — بزرگ‌تر از خودِ HTML صفحه. پس سقف گذاشته شده: ۱۲ دسته
   * و ۱۵ آیتم در هر دسته. گوگل هم برای فهمِ «این‌جا چه می‌فروشد» به بیشتر از
   * این نیاز ندارد؛ منوی کامل در HTML صفحه هست.
   *
   * فقط آیتم‌های قیمت‌دار: `Offer` بدون `price` داده‌ی نامعتبر است و ۹۲۸ آیتم
   * در داده قیمت معتبر ندارند.
   */
  const menuSections = (place.menu ?? [])
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.price !== null && item.price > 0).slice(0, 15),
    }))
    .filter((section) => section.items.length > 0)
    .slice(0, 12)

  if (menuSections.length > 0) {
    data.hasMenu = {
      '@type': 'Menu',
      hasMenuSection: menuSections.map((section) => ({
        '@type': 'MenuSection',
        name: section.name,
        hasMenuItem: section.items.map((item) => ({
          '@type': 'MenuItem',
          name: item.name,
          ...(item.description ? { description: item.description } : {}),
          offers: {
            '@type': 'Offer',
            // تومان واحد رسمی ISO ندارد؛ IRR ریال است و قیمت‌ها تومان‌اند.
            // ×۱۰ می‌شود تا عدد و واحد با هم بخوانند.
            price: item.price! * 10,
            priceCurrency: 'IRR',
          },
        })),
      })),
    }
  }

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  )
}

/** breadcrumb — به گوگل ساختار سایت را نشان می‌دهد. */
export function BreadcrumbJsonLd({ items }: { items: { name: string; path: string }[] }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  )
}
