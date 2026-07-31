import type { PlaceView } from '@/core/places/types'
import { absoluteUrl, paths } from '@/routes'
import { WEEKDAY_LABELS } from '@/core/hours/weekdays'

/**
 * JSON-LD برای schema.org.
 *
 * سمت *سرور* رندر می‌شود — همان چیزی که در نسخه‌ی SPA ممکن نبود. گوگل داده‌ی
 * ساخت‌یافته‌ای را که با جاوااسکریپت بعداً تزریق شود کم‌ارزش‌تر می‌بیند، و برای
 * دامنه‌ی تازه اصلاً ممکن است نبیندش.
 *
 * `aggregateRating` فقط وقتی می‌آید که واقعاً نظری وجود داشته باشد؛ ساختن این
 * فیلد از هوا نقض راهنمای گوگل است و می‌تواند به جریمه‌ی دستی منجر شود.
 */

/** schema.org روزهای هفته را با نام انگلیسی می‌خواهد. */
const SCHEMA_DAYS = [
  'Saturday',
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
]

const KIND_TO_SCHEMA: Record<string, string> = {
  cafe: 'CafeOrCoffeeShop',
  cafe_restaurant: 'Restaurant',
  restaurant: 'Restaurant',
}

const PRICE_RANGE: Record<number, string> = { 1: '$', 2: '$$', 3: '$$$' }

export function PlaceJsonLd({ place }: { place: PlaceView }) {
  const url = absoluteUrl(paths.cafe(place.slug))

  const openingHours = place.hours
    .filter((h) => !h.closed)
    .map((h) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: SCHEMA_DAYS[h.dow],
      opens: h.opensAt,
      closes: h.closesAt,
    }))

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': KIND_TO_SCHEMA[place.kind] ?? 'LocalBusiness',
    '@id': url,
    name: place.name,
    url,
    address: {
      '@type': 'PostalAddress',
      streetAddress: place.address,
      addressLocality: 'مشهد',
      addressRegion: 'خراسان رضوی',
      addressCountry: 'IR',
    },
    priceRange: PRICE_RANGE[place.priceTier] ?? '$$',
  }

  if (place.description) data.description = place.description
  if (place.phone) data.telephone = place.phone
  if (place.photos.length) data.image = place.photos.map((p) => absoluteUrl(p.url))
  if (openingHours.length) data.openingHoursSpecification = openingHours

  if (place.coords) {
    data.geo = {
      '@type': 'GeoCoordinates',
      latitude: place.coords.lat,
      longitude: place.coords.lng,
    }
  }

  // فقط وقتی نظر واقعی داریم — ساختن این فیلد از هوا نقض راهنمای گوگل است.
  if (place.ratingCount > 0) {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: place.rawRating.toFixed(1),
      reviewCount: place.ratingCount,
      bestRating: 5,
      worstRating: 1,
    }
  }

  if (place.menu.some((s) => s.items.length > 0)) {
    data.hasMenu = {
      '@type': 'Menu',
      hasMenuSection: place.menu.map((section) => ({
        '@type': 'MenuSection',
        name: section.name,
        hasMenuItem: section.items
          .filter((i) => i.active)
          .map((item) => ({
            '@type': 'MenuItem',
            name: item.name,
            ...(item.desc ? { description: item.desc } : {}),
            offers: {
              '@type': 'Offer',
              price: item.price,
              priceCurrency: 'IRR',
            },
          })),
      })),
    }
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

/** breadcrumb — به گوگل ساختار سایت را نشان می‌دهد. */
export function BreadcrumbJsonLd({
  items,
}: {
  items: { name: string; path: string }[]
}) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

export { WEEKDAY_LABELS }
