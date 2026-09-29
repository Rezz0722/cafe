import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BadgeCheck, ChevronLeft, Search, Tags } from 'lucide-react'
import { CafeCard } from '@/components/cafe/CafeCard'
import { BreadcrumbJsonLd } from '@/components/seo/PlaceJsonLd'
import { FacetIcon } from '@/components/ui/FacetIcon'
import { MaintenanceScreen } from '@/components/site/MaintenanceScreen'
import { listFilterFacets, listPlaceCards, listPopularDishes } from '@/core/places/queries'
import { robotsFor } from '@/core/seo/indexability'
import { searchPath } from '@/core/search/filters'
import { maintenanceState } from '@/core/settings/maintenance'
import { getLocalePolicy, getSiteName } from '@/core/settings/policies'
import { faCount } from '@/lib/format'
import { absoluteUrl, paths } from '@/routes'
import styles from '../menu.module.css'

interface PageProps { params: Promise<{ facet: string }> }

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const facetId = decodeURIComponent((await params).facet)
  const [facets, locale, siteName] = await Promise.all([
    listFilterFacets(),
    getLocalePolicy(),
    getSiteName(),
  ])
  const facet = facets.find((item) => item.id === facetId && !['addons', 'service'].includes(item.id))
  if (!facet) return { title: 'دستهٔ منو پیدا نشد', robots: { index: false, follow: true } }

  const title = `${facet.labelFa} در کافه‌های ${locale.cityName} | منو و قیمت`
  const description = `${faCount(facet.placeCount)} کافه و رستوران دارای ${facet.labelFa} در ${locale.cityName}. منو، قیمت ثبت‌شده، محله، ساعت کاری و صفحهٔ هر مجموعه در ${siteName}.`
  return {
    title,
    description,
    alternates: { canonical: paths.menuCategory(facet.id) },
    robots: robotsFor(facet.placeCount),
    openGraph: {
      type: 'website',
      title,
      description,
      url: paths.menuCategory(facet.id),
    },
  }
}

export default async function MenuCategoryPage({ params }: PageProps) {
  const gate = await maintenanceState()
  if (gate.closed) return <MaintenanceScreen siteName={gate.siteName} message={gate.message} />

  const facetId = decodeURIComponent((await params).facet)
  const [facets, locale, siteName, allDishes] = await Promise.all([
    listFilterFacets(),
    getLocalePolicy(),
    getSiteName(),
    listPopularDishes(100),
  ])
  const facet = facets.find((item) => item.id === facetId && !['addons', 'service'].includes(item.id))
  if (!facet) notFound()

  const cards = await listPlaceCards({ facetIds: [facet.id], limit: 60, sort: 'rating' })
  if (cards.length === 0) notFound()

  const facetLabels: Record<string, string> = {}
  for (const item of facets) facetLabels[item.id] = item.labelFa
  const relatedDishes = allDishes.filter((dish) => dish.facetId === facet.id).slice(0, 10)
  const districtCounts = new Map<string, { slug: string; name: string; count: number }>()
  for (const card of cards) {
    if (!card.districtSlug || !card.districtName) continue
    const current = districtCounts.get(card.districtSlug)
    if (current) current.count += 1
    else districtCounts.set(card.districtSlug, { slug: card.districtSlug, name: card.districtName, count: 1 })
  }
  const topDistricts = [...districtCounts.values()].sort((a, b) => b.count - a.count).slice(0, 8)

  const pageUrl = paths.menuCategory(facet.id)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': absoluteUrl(pageUrl),
    name: `${facet.labelFa} در کافه‌های ${locale.cityName}`,
    description: `${faCount(facet.placeCount)} مجموعه با ${facet.labelFa} در منوی ثبت‌شده`,
    inLanguage: 'fa-IR',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: facet.placeCount,
      itemListElement: cards.slice(0, 30).map((card, index) => ({
        '@type': 'ListItem',
        position: index + 1,
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
          { name: facet.labelFa, path: pageUrl },
        ]}
      />
      <main className={styles.page}>
        <nav className={styles.breadcrumbs} aria-label="مسیر صفحه">
          <Link href={paths.home}>خانه</Link><ChevronLeft size={14} />
          <Link href={paths.menuHub}>منوهای {locale.cityName}</Link><ChevronLeft size={14} />
          <span aria-current="page">{facet.labelFa}</span>
        </nav>

        <header className={styles.categoryHero}>
          <div className={styles.categoryHeroIcon}><FacetIcon id={facet.id} size={34} /></div>
          <div className={styles.categoryHeroCopy}>
            <span className={styles.kicker}><Tags size={15} /> بر اساس منوی ثبت‌شدهٔ کافه‌ها</span>
            <h1>{facet.labelFa} در کافه‌های {locale.cityName}</h1>
            <p>
              {faCount(facet.placeCount)} مجموعه در {locale.cityName} این دسته را در منوی خود دارند.
              صفحهٔ هر کافه را باز کن تا آیتم‌ها، قیمت ثبت‌شده، ساعت کاری و مسیر را ببینی.
            </p>
          </div>
          <Link className={styles.heroAction} href={searchPath({ facets: [facet.id] })}>
            <Search size={16} /> فیلتر و مرتب‌سازی
          </Link>
        </header>

        {(relatedDishes.length > 0 || topDistricts.length > 0) && (
          <section className={styles.contextGrid} aria-label="دسترسی‌های مرتبط">
            {relatedDishes.length > 0 && (
              <div className={styles.contextCard}>
                <h2>محبوب‌ها در این دسته</h2>
                <div className={styles.linkChips}>
                  {relatedDishes.map((dish) => (
                    <Link key={dish.id} href={paths.dish(dish.slug)}>{dish.nameFa}<span>{faCount(dish.placeCount)}</span></Link>
                  ))}
                </div>
              </div>
            )}
            {topDistricts.length > 0 && (
              <div className={styles.contextCard}>
                <h2>محله‌های پرتکرار</h2>
                <div className={styles.linkChips}>
                  {topDistricts.map((district) => (
                    <Link key={district.slug} href={paths.district(district.slug)}>{district.name}<span>{faCount(district.count)}</span></Link>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <section className={styles.resultsSection}>
          <div className={styles.resultHead}>
            <div><BadgeCheck size={19} /><h2>مجموعه‌های دارای {facet.labelFa}</h2></div>
            <span>{faCount(cards.length)} نتیجهٔ قابل نمایش</span>
          </div>
          <div className={styles.cafeGrid}>
            {cards.map((card) => <CafeCard key={card.id} card={card} facetLabels={facetLabels} />)}
          </div>
        </section>

        <aside className={styles.methodNote}>
          <strong>این فهرست چطور ساخته شده؟</strong>
          <p>حضور یک مجموعه در این صفحه از دسته‌ها و آیتم‌های منوی ثبت‌شدهٔ همان مجموعه استخراج می‌شود؛ صرفاً بر اساس نام یا متن تبلیغاتی کافه نیست.</p>
        </aside>
      </main>
    </>
  )
}
