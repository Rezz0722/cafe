import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BadgeCheck, ChevronLeft, Search, Tags } from 'lucide-react'
import { CafeCard } from '@/components/cafe/CafeCard'
import { DiscoveryPagination } from '@/components/discovery/DiscoveryPagination'
import { BreadcrumbJsonLd } from '@/components/seo/PlaceJsonLd'
import { FacetIcon } from '@/components/ui/FacetIcon'
import { MaintenanceScreen } from '@/components/site/MaintenanceScreen'
import { countPlaces, listFilterFacets, listPlaceCards, listPopularDishes } from '@/core/places/queries'
import { getDiscoveryPage, pagePath } from '@/core/discovery/pagination'
import { robotsFor } from '@/core/seo/indexability'
import { searchPath } from '@/core/search/filters'
import { maintenanceState } from '@/core/settings/maintenance'
import { getLocalePolicy, getSiteName } from '@/core/settings/policies'
import { faCount } from '@/lib/format'
import { absoluteUrl, paths } from '@/routes'
import styles from '../menu.module.css'
import { MENU_ART, MENU_SORTS, menuSort } from '../discovery'

interface PageProps {
  params: Promise<{ facet: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const facetId = decodeURIComponent((await params).facet)
  const [facets, locale, siteName] = await Promise.all([
    listFilterFacets(),
    getLocalePolicy(),
    getSiteName(),
  ])
  const facet = facets.find((item) => item.id === facetId && !['addons', 'service'].includes(item.id))
  if (!facet) return { title: 'دستهٔ منو پیدا نشد', robots: { index: false, follow: true } }

  const [total, query] = await Promise.all([countPlaces({ facetIds: [facet.id] }), searchParams])
  const pagination = getDiscoveryPage(query.page, total)
  const sort = menuSort(query.sort)
  const pageUrl = pagePath(paths.menuCategory(facet.id), pagination.page, sort === 'rating' ? undefined : { sort })
  const pageLabel = pagination.page > 1 ? ` | صفحهٔ ${faCount(pagination.page)}` : ''
  const title = `${facet.labelFa} در کافه‌های ${locale.cityName} | منو و قیمت${pageLabel}`
  const description = `${faCount(total)} کافه و رستوران دارای ${facet.labelFa} در ${locale.cityName}. منو، قیمت ثبت‌شده، محله، ساعت کاری و صفحهٔ هر مجموعه در ${siteName}.${pagination.page > 1 ? ` صفحهٔ ${faCount(pagination.page)} از ${faCount(pagination.totalPages)}.` : ''}`
  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    robots: robotsFor(total),
    openGraph: {
      type: 'website',
      title,
      description,
      url: pageUrl,
    },
  }
}

export default async function MenuCategoryPage({ params, searchParams }: PageProps) {
  const gate = await maintenanceState()
  if (gate.closed) return <MaintenanceScreen siteName={gate.siteName} message={gate.message} />

  const facetId = decodeURIComponent((await params).facet)
  const [facets, locale, siteName, allDishes, query] = await Promise.all([
    listFilterFacets(),
    getLocalePolicy(),
    getSiteName(),
    listPopularDishes(100),
    searchParams,
  ])
  const facet = facets.find((item) => item.id === facetId && !['addons', 'service'].includes(item.id))
  if (!facet) notFound()

  const filters = { facetIds: [facet.id], sort: menuSort(query.sort) }
  const total = await countPlaces(filters)
  if (total === 0) notFound()
  const pagination = getDiscoveryPage(query.page, total)
  const cards = await listPlaceCards({ ...filters, limit: pagination.limit, offset: pagination.offset })

  const facetLabels: Record<string, string> = {}
  for (const item of facets) facetLabels[item.id] = item.labelFa
  const relatedDishes = allDishes.filter((dish) => dish.facetId === facet.id).slice(0, 6)

  const basePath = paths.menuCategory(facet.id)
  const sortQuery = filters.sort === 'rating' ? undefined : { sort: filters.sort }
  const pageUrl = pagePath(basePath, pagination.page, sortQuery)
  const image = MENU_ART[facet.id]
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': absoluteUrl(pageUrl),
    name: `${facet.labelFa} در کافه‌های ${locale.cityName}`,
    description: `${faCount(total)} مجموعه با ${facet.labelFa} در منوی ثبت‌شده`,
    inLanguage: 'fa-IR',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: total,
      itemListElement: cards.map((card, index) => ({
        '@type': 'ListItem',
        position: pagination.offset + index + 1,
        name: card.name,
        url: absoluteUrl(paths.cafe(card.slug)),
      })),
    },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <BreadcrumbJsonLd
        items={[
          { name: siteName, path: paths.home },
          { name: 'منوهای مشهد', path: paths.menuHub },
          { name: facet.labelFa, path: basePath },
        ]}
      />
      <main className={styles.page}>
        <nav className={styles.breadcrumbs} aria-label="مسیر صفحه">
          <Link href={paths.home}>خانه</Link><ChevronLeft size={14} aria-hidden="true" />
          <Link href={paths.menuHub}>منوهای {locale.cityName}</Link><ChevronLeft size={14} aria-hidden="true" />
          <span aria-current="page">{facet.labelFa}</span>
        </nav>

        <header className={styles.categoryHero}>
          {image ? (
            <img className={styles.categoryHeroImage} src={image} alt="" width={160} height={160} />
          ) : (
            <div className={styles.categoryHeroIcon} aria-hidden="true"><FacetIcon id={facet.id} size={28} /></div>
          )}
          <div className={styles.categoryHeroCopy}>
            <span className={styles.kicker}><Tags size={14} aria-hidden="true" /> در منوی ثبت‌شدهٔ مجموعه‌ها</span>
            <h1>{facet.labelFa} در کافه‌های {locale.cityName}</h1>
            <p>
              {faCount(total)} مجموعه؛ برای دیدن آیتم‌ها، قیمت ثبت‌شده و مسیر، صفحهٔ مجموعه را باز کن.
            </p>
          </div>
          <Link className={styles.heroAction} href={searchPath({ facets: [facet.id], sort: filters.sort })}>
            <Search size={16} aria-hidden="true" /> فیلترهای بیشتر
          </Link>
        </header>

        {relatedDishes.length > 0 && (
          <details className={styles.relatedDishes}>
            <summary>خوراکی‌های این دسته <span>{faCount(relatedDishes.length)} پیشنهاد</span></summary>
            <div className={styles.linkChips}>
              {relatedDishes.map((dish) => (
                <Link key={dish.id} href={paths.dish(dish.slug)}>{dish.nameFa}<span>{faCount(dish.placeCount)} مجموعه</span></Link>
              ))}
            </div>
          </details>
        )}

        <section id="results" className={styles.resultsSection} aria-labelledby="results-title">
          <div className={styles.resultHead}>
            <div><BadgeCheck size={19} aria-hidden="true" /><h2 id="results-title">مجموعه‌های دارای {facet.labelFa}</h2></div>
            <span>{faCount(pagination.offset + 1)} تا {faCount(pagination.offset + cards.length)} از {faCount(total)} مجموعه</span>
          </div>
          <form action={`${basePath}#results`} method="get" className={styles.sortForm}>
            <label htmlFor="menu-sort">مرتب‌سازی</label>
            <select id="menu-sort" name="sort" defaultValue={filters.sort}>
              {MENU_SORTS.map(sort => <option key={sort.value} value={sort.value}>{sort.label}</option>)}
            </select>
            <button type="submit">نمایش</button>
          </form>
          {filters.sort.startsWith('price_') && <p className={styles.sortNote}>ترتیب قیمت بر پایهٔ میانهٔ کل منوی هر مجموعه است؛ قیمت این خوراکی را در منوی همان مجموعه ببین.</p>}
          <div className={styles.cafeGrid}>
            {cards.map((card) => <CafeCard key={card.id} card={card} facetLabels={facetLabels} />)}
          </div>
          <DiscoveryPagination basePath={basePath} page={pagination.page} totalPages={pagination.totalPages} query={sortQuery} anchor="results" />
        </section>

        <aside className={styles.methodNote}>
          <strong>این فهرست چطور ساخته شده؟</strong>
          <p>حضور یک مجموعه در این صفحه از دسته‌ها و آیتم‌های منوی ثبت‌شدهٔ همان مجموعه استخراج می‌شود؛ صرفاً بر اساس نام یا متن تبلیغاتی کافه نیست.</p>
        </aside>
      </main>
    </>
  )
}
