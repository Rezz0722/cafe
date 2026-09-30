import type { Metadata } from 'next'
import { DistrictHub, type DistrictCard } from '@/components/districts/DistrictHub'
import { BreadcrumbJsonLd } from '@/components/seo/PlaceJsonLd'
import { serializeJsonLd } from '@/core/security/jsonLd'
import { MaintenanceScreen } from '@/components/site/MaintenanceScreen'
import { getMapLabels } from '@/core/map/labels'
import { listDistricts, listPlaceCards } from '@/core/places/queries'
import { maintenanceState } from '@/core/settings/maintenance'
import { getLocalePolicy, getMapPolicy, getSiteName } from '@/core/settings/policies'
import { fa } from '@/lib/format'
import { absoluteUrl, paths } from '@/routes'

/**
 * لندینگ محله‌ها — `/mashhad`.
 *
 * ═══ چرا این صفحه لازم بود ═══
 *
 * صفحات `/mashhad/[district]` از قبل وجود داشتند و مسیر کانونیِ SEO بودند، ولی
 * هیچ صفحه‌ای بالای سرشان نبود: دکمه‌ی «محله‌ها» در هدر به `paths.home` می‌رفت
 * (یعنی کار نمی‌کرد) و تنها راه رسیدن به یک محله، لینک‌های پاراکنده‌ی پایین
 * صفحه‌ی اصلی بود. کاربری که می‌دانست کدام محله را می‌خواهد، راهی برای گفتنش
 * نداشت.
 *
 * ═══ چرا تصویرِ محله از داده‌ی خودمان می‌آید ═══
 *
 * «تصویر شاخص محله» در دیتابیس وجود ندارد و ساختنش یعنی ۲۹ عکسِ دستی که کسی
 * به‌روزشان نمی‌کند. به‌جایش لوگوی بهترین کافه‌ی همان محله استفاده می‌شود —
 * داده‌ی واقعی، بدون دارایی جدید، و خودبه‌خود با رشد داده به‌روز می‌ماند.
 * محله‌ای که هیچ لوگویی ندارد کاشیِ حرف‌اول می‌گیرد، نه باکس خالی.
 *
 * ═══ چرا یک پرس‌وجو برای همه‌چیز ═══
 *
 * `listPlaceCards` یک بار همه‌ی کارت‌ها را می‌آورد (۳۳۱ ردیف) و شمار و تصویرِ
 * هر محله در حافظه مشتق می‌شود. نوشتن یک کوئری `GROUP BY` جدا با زیرپرس‌وجوی
 * تصویر، برای این حجم فقط پیچیدگی اضافه بود.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const [locale, siteName, districts] = await Promise.all([
    getLocalePolicy(),
    getSiteName(),
    listDistricts(),
  ])
  const active = districts.filter((district) => district.placeCount > 0)

  return {
    title: `کافه‌های ${locale.cityName}؛ منو، قیمت، نقشه و محله‌ها`,
    description: `راهنمای ${fa(active.reduce((sum, district) => sum + district.placeCount, 0))} کافه و رستوران ${locale.cityName} در ${fa(active.length)} محله؛ منوی ثبت‌شده، قیمت، ساعت کاری، نقشه و انتخاب بر اساس محله.`,
    alternates: { canonical: paths.districtHub },
    openGraph: {
      type: 'website',
      title: `کافه‌های ${locale.cityName}؛ منو، قیمت و محله‌ها — ${siteName}`,
      url: paths.districtHub,
    },
  }
}

export default async function DistrictHubPage() {
  const gate = await maintenanceState()
  if (gate.closed) {
    return <MaintenanceScreen siteName={gate.siteName} message={gate.message} />
  }

  const [districts, cards, locale, map, siteName] = await Promise.all([
    listDistricts(),
    // `sort: 'quality'` یعنی اولین کارتِ هر محله، کامل‌ترین پروفایلِ آن محله
    // است — پس تصویرِ شاخص، تصویرِ بهترین کافه می‌شود نه یک کافه‌ی تصادفی.
    listPlaceCards({ limit: 400, sort: 'quality' }),
    getLocalePolicy(),
    getMapPolicy(),
    getSiteName(),
  ])

  /** لوگوی شاخص و میانه‌ی قیمتِ هر محله، از همان یک پرس‌وجو. */
  const coverByDistrict = new Map<string, string>()
  const pricesByDistrict = new Map<string, number[]>()
  for (const card of cards) {
    if (!card.districtId) continue
    if (card.logo && !coverByDistrict.has(card.districtId)) {
      coverByDistrict.set(card.districtId, card.logo.url)
    }
    if (card.priceMedian !== null) {
      const list = pricesByDistrict.get(card.districtId)
      if (list) list.push(card.priceMedian)
      else pricesByDistrict.set(card.districtId, [card.priceMedian])
    }
  }

  const districtCards: DistrictCard[] = districts
    // محله‌ی بدون کافه، کارتی است که به صفحه‌ی خالی می‌رود — `[district]`
    // خودش هم برایشان `notFound` می‌دهد.
    .filter((district) => district.placeCount > 0)
    .map((district) => {
      const prices = pricesByDistrict.get(district.id) ?? []
      const median =
        prices.length > 0 ? [...prices].sort((a, b) => a - b)[Math.floor(prices.length / 2)]! : null
      return {
        id: district.id,
        slug: district.slug,
        name: district.name,
        placeCount: district.placeCount,
        coverUrl: coverByDistrict.get(district.id) ?? null,
        priceMedian: median,
        center: district.center,
      }
    })

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': absoluteUrl(paths.districtHub),
    name: `راهنمای کافه‌های ${locale.cityName}`,
    description: `کافه‌ها و رستوران‌های ${locale.cityName} با منو، قیمت، ساعت کاری، نقشه و تفکیک محله`,
    inLanguage: 'fa-IR',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: districtCards.length,
      itemListElement: districtCards.map((district, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: district.name,
        url: absoluteUrl(paths.district(district.slug)),
      })),
    },
  }

  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <BreadcrumbJsonLd items={[{ name: siteName, path: paths.home }, { name: `کافه‌های ${locale.cityName}`, path: paths.districtHub }]} />
    <DistrictHub
        cityName={locale.cityName}
        districts={districtCards}
        totalPlaces={districtCards.reduce((sum, district) => sum + district.placeCount, 0)}
        labels={getMapLabels({ zoom: 12, limit: 40 })}
        mapConfig={{
          center: map.center,
          // یک پله عقب‌تر از پیش‌فرض تا همه‌ی محله‌ها در کادر جا شوند.
          zoom: Math.max(map.minZoom, Math.min(map.defaultZoom, 11.4)),
          minZoom: map.minZoom,
          maxZoom: map.maxZoom,
        }}
      />
  </>
}
