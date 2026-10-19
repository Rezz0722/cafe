import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft, Search, UtensilsCrossed } from 'lucide-react'
import { BreadcrumbJsonLd } from '@/components/seo/PlaceJsonLd'
import { FacetIcon } from '@/components/ui/FacetIcon'
import { MaintenanceScreen } from '@/components/site/MaintenanceScreen'
import { listFilterFacets } from '@/core/places/queries'
import { maintenanceState } from '@/core/settings/maintenance'
import { getLocalePolicy, getSiteName } from '@/core/settings/policies'
import { faCount } from '@/lib/format'
import { absoluteUrl, paths } from '@/routes'
import styles from './menu.module.css'
import { FEATURED_MENU_IDS, groupMenuFacets, MENU_ART } from './discovery'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const [locale, siteName] = await Promise.all([getLocalePolicy(), getSiteName()])
  const title = `منوی کافه‌ها و رستوران‌های ${locale.cityName} با قیمت`
  const description = `دسته‌های منوی کافه‌ها و رستوران‌های ${locale.cityName}: قهوه، صبحانه، پاستا، نوشیدنی و غذا؛ مشاهدهٔ منو و قیمت ثبت‌شدهٔ هر مجموعه در ${siteName}.`
  return {
    title,
    description,
    alternates: { canonical: paths.menuHub },
    openGraph: { type: 'website', title, description, url: paths.menuHub },
  }
}

export default async function MenuHubPage() {
  const gate = await maintenanceState()
  if (gate.closed) return <MaintenanceScreen siteName={gate.siteName} message={gate.message} />

  const [locale, siteName, allFacets] = await Promise.all([
    getLocalePolicy(),
    getSiteName(),
    listFilterFacets(),
  ])
  const facets = allFacets.filter((facet) => !['addons', 'service'].includes(facet.id))
  const featured = FEATURED_MENU_IDS.flatMap(id => {
    const facet = facets.find(item => item.id === id)
    return facet ? [facet] : []
  })
  const groups = groupMenuFacets(facets)
  const description = `دسترسی به ${faCount(facets.length)} دستهٔ منوی کافه‌ها و رستوران‌های ${locale.cityName}`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': absoluteUrl(paths.menuHub),
    name: `منوی کافه‌ها و رستوران‌های ${locale.cityName}`,
    description,
    inLanguage: 'fa-IR',
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: facets.map((facet, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: facet.labelFa,
        url: absoluteUrl(paths.menuCategory(facet.id)),
      })),
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <BreadcrumbJsonLd
        items={[
          { name: siteName, path: paths.home },
          { name: 'منوهای مشهد', path: paths.menuHub },
        ]}
      />
      <main className={styles.page}>
        <nav className={styles.breadcrumbs} aria-label="مسیر صفحه">
          <Link href={paths.home}>خانه</Link><ChevronLeft size={14} aria-hidden="true" />
          <span aria-current="page">منوهای {locale.cityName}</span>
        </nav>

        <header className={styles.hubHero}>
          <div>
            <span className={styles.kicker}><UtensilsCrossed size={15} aria-hidden="true" /> راهنمای منو و قیمت</span>
            <h1>منوی کافه‌ها و رستوران‌های {locale.cityName}</h1>
            <p>
              چی میل داری؟ یک دسته را انتخاب کن و مجموعه‌هایی را ببین که آن را
              در منوی ثبت‌شده دارند.
            </p>
          </div>
          <a className={styles.heroAction} href="#all-categories">همهٔ {faCount(facets.length)} دسته <ChevronLeft size={16} aria-hidden="true" /></a>
        </header>

        <section className={styles.section} aria-labelledby="featured-categories">
          <div className={styles.sectionHead}>
            <div><span>از اینجا شروع کن</span><h2 id="featured-categories">چی میل داری؟</h2></div>
            <Link href={`${paths.search}?scope=items`}><Search size={15} aria-hidden="true" /> جست‌وجوی منو</Link>
          </div>
          <div className={styles.facetGrid}>
            {featured.map((facet) => (
              <Link key={facet.id} href={paths.menuCategory(facet.id)} className={styles.facetCard}>
                <img src={MENU_ART[facet.id]} alt="" width={480} height={320} loading="lazy" className={styles.facetPhoto} />
                <span className={styles.facetText}>
                  <strong>{facet.labelFa}</strong>
                  <small>{faCount(facet.placeCount)} مجموعه</small>
                </span>
                <ChevronLeft size={18} aria-hidden="true" />
              </Link>
            ))}
          </div>
          <p className={styles.artNote}>تصاویر دسته‌ها نمادین‌اند؛ منو و قیمت هر مجموعه در صفحهٔ خودش است.</p>
        </section>

        <section id="all-categories" className={styles.allCategories} aria-labelledby="all-categories-title">
          <div className={styles.sectionHead}>
            <div><h2 id="all-categories-title">همهٔ دسته‌ها</h2><p className={styles.sectionDescription}>گروه دلخواهت را باز کن تا دسته‌های بیشتری ببینی.</p></div>
          </div>
          <div className={styles.categoryGroups}>
            {groups.map(group => (
              <details key={group.kind} className={styles.categoryGroup}>
                <summary>{group.label}<span>{faCount(group.facets.length)} دسته</span></summary>
                <ul className={styles.categoryLinks}>
                  {group.facets.map(facet => (
                    <li key={facet.id}>
                      <Link href={paths.menuCategory(facet.id)}>
                        <span aria-hidden="true"><FacetIcon id={facet.id} size={19} /></span>
                        <span>{facet.labelFa}</span>
                        <small>{faCount(facet.placeCount)} مجموعه</small>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </section>
      </main>
    </>
  )
}
