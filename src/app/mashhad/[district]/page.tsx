import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PlaceCardView } from '@/components/cafe/PlaceCardView'
import { CafeMap } from '@/components/map/CafeMap'
import { BreadcrumbJsonLd } from '@/components/seo/PlaceJsonLd'
import { getMapLabels } from '@/core/map/labels'
import {
  getDistrictBySlug,
  listDistricts,
  listFilterFacets,
  listPlaceCards,
} from '@/core/places/queries'
import { searchPath } from '@/core/search/filters'
import { fa, toman } from '@/lib/format'
import { paths } from '@/routes'
import styles from './page.module.css'

/**
 * صفحه‌ی محله — مسیر کانونیِ SEO.
 *
 * ═══ چرا این صفحه ایندکس می‌شود ولی `/search` نه ═══
 *
 * «کافه‌های وکیل‌آباد» یک جست‌وجوی واقعی با حجم مشخص است و URL پایدار دارد.
 * در مقابل `/search?f=pasta&tier=1&max=300000` بی‌نهایت ترکیب می‌سازد که
 * همه‌شان محتوای تقریباً یکسان دارند — همان چیزی که گوگل «محتوای تکراری»
 * می‌نامد و به کل دامنه آسیب می‌زند.
 */

interface PageProps {
  params: Promise<{ district: string }>
}

export async function generateStaticParams() {
  const districts = await listDistricts()
  return districts.filter((district) => district.placeCount > 0).map((district) => ({
    district: district.slug,
  }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { district: slug } = await params
  const district = await getDistrictBySlug(slug)
  if (!district) return { title: 'محله پیدا نشد' }

  return {
    title: `کافه‌ها و رستوران‌های ${district.name}، مشهد`,
    description: `${fa(district.placeCount)} مجموعه در ${district.name}. قیمت واقعی منو، ساعت کاری، نقشه و مسیریابی.`,
    alternates: { canonical: paths.district(district.slug) },
  }
}

export default async function DistrictPage({ params }: PageProps) {
  const { district: slug } = await params
  const district = await getDistrictBySlug(slug)
  if (!district || district.placeCount === 0) notFound()

  const [cards, facets, allDistricts] = await Promise.all([
    listPlaceCards({ districtId: district.id, limit: 60, sort: 'quality' }),
    listFilterFacets(),
    listDistricts(),
  ])

  const mapPlaces = cards
    .filter((card) => card.coords)
    .map((card) => ({
      id: card.id,
      slug: card.slug,
      name: card.name,
      lat: card.coords!.lat,
      lng: card.coords!.lng,
      logoUrl: card.logo?.url ?? null,
    }))

  /**
   * facetهایی که در **همین محله** وجود دارند.
   *
   * نمایش facetهای کل شهر در صفحه‌ی محله، فیلترهایی می‌سازد که صفر نتیجه
   * می‌دهند — کاربر می‌زند و به صفحه‌ی خالی می‌رسد. اینجا از خودِ کارت‌های
   * همین محله شمرده می‌شود.
   */
  const localCounts = new Map<string, number>()
  for (const card of cards) {
    for (const facetId of card.facetIds) {
      localCounts.set(facetId, (localCounts.get(facetId) ?? 0) + 1)
    }
  }
  const localFacets = facets
    .filter((facet) => (localCounts.get(facet.id) ?? 0) > 0)
    .map((facet) => ({ ...facet, localCount: localCounts.get(facet.id)! }))
    .sort((a, b) => b.localCount - a.localCount)
    .slice(0, 10)

  const priced = cards.map((card) => card.priceMedian).filter((value): value is number => value !== null)
  const medianOfMedians =
    priced.length > 0 ? [...priced].sort((a, b) => a - b)[Math.floor(priced.length / 2)]! : null

  const neighbours = allDistricts
    .filter((item) => item.id !== district.id && item.placeCount > 0)
    .slice(0, 12)

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: 'کافه‌گرد', path: paths.home },
          { name: district.name, path: paths.district(district.slug) },
        ]}
      />

      <div className={styles.page}>
        <header className={styles.head}>
          <h1 className={styles.title}>کافه‌ها و رستوران‌های {district.name}</h1>
          <p className={styles.lead}>
            {fa(district.placeCount)} مجموعه
            {medianOfMedians !== null && <> · میانه‌ی قیمت منو {toman(medianOfMedians)}</>}
            {mapPlaces.length > 0 && <> · {fa(mapPlaces.length)} مجموعه روی نقشه</>}
          </p>

          {localFacets.length > 0 && (
            <div className={styles.chips}>
              {localFacets.map((facet) => (
                <Link
                  key={facet.id}
                  href={searchPath({ districtId: district.id, facets: [facet.id] })}
                  className={styles.chip}
                >
                  <span aria-hidden="true">{facet.icon}</span> {facet.labelFa}
                  <span className={styles.chipCount}>{fa(facet.localCount)}</span>
                </Link>
              ))}
            </div>
          )}
        </header>

        {mapPlaces.length > 0 && (
          <section className={styles.mapSection}>
            <CafeMap
              places={mapPlaces}
              labels={getMapLabels({ zoom: 14, limit: 24 })}
              center={district.center}
              zoom={14}
              height="320px"
            />
          </section>
        )}

        <ul className={styles.list}>
          {cards.map((card) => (
            <li key={card.id}>
              <PlaceCardView card={card} />
            </li>
          ))}
        </ul>

        <section className={styles.neighbours}>
          <h2>محله‌های دیگر</h2>
          <div className={styles.neighbourGrid}>
            {neighbours.map((item) => (
              <Link key={item.id} href={paths.district(item.slug)} className={styles.neighbour}>
                {item.name}
                <span className={styles.chipCount}>{fa(item.placeCount)}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
