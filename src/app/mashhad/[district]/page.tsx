import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PlaceCardView } from '@/components/cafe/PlaceCardView'
import { DiscoveryPagination } from '@/components/discovery/DiscoveryPagination'
import { getDiscoveryPage, pagePath } from '@/core/discovery/pagination'
import { LazyCafeMap } from '@/components/map/LazyCafeMap'
import { BreadcrumbJsonLd } from '@/components/seo/PlaceJsonLd'
import { getMapLabels } from '@/core/map/labels'
import {
  getDistrictBySlug,
  listDistricts,
  listFilterFacets,
  listPlaceCards,
  countPlaces,
} from '@/core/places/queries'
import { searchPath } from '@/core/search/filters'
import { fa, toman } from '@/lib/format'
import { MaintenanceScreen } from '@/components/site/MaintenanceScreen'
import { maintenanceState } from '@/core/settings/maintenance'
import { getLocalePolicy, getMapPolicy, getSiteName } from '@/core/settings/policies'
import { paths } from '@/routes'
import { robotsFor } from '@/core/seo/indexability'
import styles from './page.module.css'
import { FacetIcon } from '@/components/ui/FacetIcon'

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
  searchParams: Promise<{ page?: string | string[] }>
}

export async function generateStaticParams() {
  const districts = await listDistricts()
  return districts.filter((district) => district.placeCount > 0).map((district) => ({
    district: district.slug,
  }))
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { district: slug } = await params
  const [district, locale] = await Promise.all([getDistrictBySlug(slug), getLocalePolicy()])
  if (!district) return { title: 'محله پیدا نشد' }
  const page = getDiscoveryPage((await searchParams).page, district.placeCount)
  const canonical = pagePath(paths.district(district.slug), page.page)

  return {
    title: `کافه‌ها و رستوران‌های ${district.name}، ${locale.cityName}`,
    description: `${fa(district.placeCount)} مجموعه در ${district.name}. قیمت واقعی منو، ساعت کاری، نقشه و مسیریابی.`,
    alternates: { canonical },
    openGraph: { type: 'website', title: `کافه‌های ${district.name}، ${locale.cityName}`, url: canonical },
    robots: robotsFor(district.placeCount),
  }
}

export default async function DistrictPage({ params, searchParams }: PageProps) {
  const gate = await maintenanceState()
  if (gate.closed) {
    return <MaintenanceScreen siteName={gate.siteName} message={gate.message} />
  }

  const { district: slug } = await params
  const district = await getDistrictBySlug(slug)
  if (!district || district.placeCount === 0) notFound()

  const total = await countPlaces({ districtId: district.id })
  const page = getDiscoveryPage((await searchParams).page, total)
  const [cards, facets, allDistricts, map, siteName] = await Promise.all([
    // Retain district-wide map/facet summaries; only one page enters the DOM.
    // These are light card rows, never the menu catalogue.
    listPlaceCards({ districtId: district.id, limit: Math.max(total, 1), sort: 'quality' }),
    listFilterFacets(),
    listDistricts(),
    getMapPolicy(),
    getSiteName(),
  ])
  const visibleCards = cards.slice(page.offset, page.offset + page.limit)

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
          { name: siteName, path: paths.home },
          { name: district.name, path: paths.district(district.slug) },
        ]}
      />

      <main className={styles.page}>
        <header className={styles.head}>
          <h1 className={styles.title}>کافه‌ها و رستوران‌های {district.name}</h1>
          <p className={styles.lead}>
            {fa(total)} مجموعه
            {medianOfMedians !== null && <> · میانه‌ی قیمت منو {toman(medianOfMedians)}</>}
            {mapPlaces.length > 0 && <> · {fa(mapPlaces.length)} مجموعه روی نقشه</>}
          </p>

          {localFacets.length > 0 && (
            <div className={styles.chips}>
              {localFacets.slice(0, 4).map((facet) => (
                <Link
                  key={facet.id}
                  href={searchPath({ districtId: district.id, facets: [facet.id] })}
                  className={styles.chip}
                >
                  <FacetIcon id={facet.id} size={14} /> {facet.labelFa}
                  <span className={styles.chipCount}>{fa(facet.localCount)}</span>
                </Link>
              ))}
            </div>
          )}
          {localFacets.length > 4 && <details className={styles.moreFilters}><summary>نمایش فیلترهای بیشتر</summary><div className={styles.chips}>{localFacets.slice(4).map(facet => <Link key={facet.id} className={styles.chip} href={searchPath({ districtId: district.id, facets: [facet.id] })}><FacetIcon id={facet.id} size={14} />{facet.labelFa}<span className={styles.chipCount}>{fa(facet.localCount)}</span></Link>)}</div></details>}
          <nav className={styles.quickLinks} aria-label="دسترسی محله"><Link href={paths.districtHub}>همه محله‌ها</Link><Link href="#district-results">دیدن کافه‌ها</Link>{mapPlaces.length > 0 && <Link href="#district-map">نقشهٔ محله</Link>}</nav>
        </header>

        {mapPlaces.length > 0 && (
          <section className={styles.mapSection} id="district-map" aria-label="نقشهٔ کافه‌های محله">
            <LazyCafeMap
              places={mapPlaces}
              labels={getMapLabels({ zoom: 14, limit: 24 })}
              center={district.center}
              zoom={Math.min(14, map.maxZoom)}
              height="260px"
            />
          </section>
        )}

        <section id="district-results" className={styles.results} aria-labelledby="district-results-title">
        <h2 id="district-results-title">کافه‌های {district.name}</h2>
        <p className={styles.lead}>{fa(visibleCards.length)} گزینه از {fa(total)} مجموعه · صفحهٔ {fa(page.page)}</p>
        <ul className={styles.list}>
          {visibleCards.map((card) => (
            <li key={card.id} data-discovery-card={card.id}>
              <PlaceCardView card={card} />
            </li>
          ))}
        </ul>
        <DiscoveryPagination basePath={paths.district(district.slug)} page={page.page} totalPages={page.totalPages} anchor="district-results" />
        </section>

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
      </main>
    </>
  )
}
