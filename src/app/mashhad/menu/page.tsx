import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft, Coffee, Search, UtensilsCrossed } from 'lucide-react'
import { BreadcrumbJsonLd } from '@/components/seo/PlaceJsonLd'
import { FacetIcon } from '@/components/ui/FacetIcon'
import { MaintenanceScreen } from '@/components/site/MaintenanceScreen'
import { listFilterFacets, listPopularDishes } from '@/core/places/queries'
import { maintenanceState } from '@/core/settings/maintenance'
import { getLocalePolicy, getSiteName } from '@/core/settings/policies'
import { faCount, toman } from '@/lib/format'
import { absoluteUrl, paths } from '@/routes'
import styles from './menu.module.css'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const [locale, siteName] = await Promise.all([getLocalePolicy(), getSiteName()])
  const title = `منوی کافه‌ها و رستوران‌های ${locale.cityName} با قیمت`
  const description = `دسته‌های منوی کافه‌ها و رستوران‌های ${locale.cityName}: قهوه، صبحانه، پاستا، نوشیدنی و غذا؛ مشاهده و مقایسهٔ قیمت در ${siteName}.`
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

  const [locale, siteName, allFacets, dishes] = await Promise.all([
    getLocalePolicy(),
    getSiteName(),
    listFilterFacets(),
    listPopularDishes(16),
  ])
  const facets = allFacets.filter((facet) => !['addons', 'service'].includes(facet.id))
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
          <Link href={paths.home}>خانه</Link><ChevronLeft size={14} />
          <span aria-current="page">منوهای {locale.cityName}</span>
        </nav>

        <header className={styles.hubHero}>
          <div>
            <span className={styles.kicker}><UtensilsCrossed size={15} /> راهنمای منو و قیمت</span>
            <h1>منوی کافه‌ها و رستوران‌های {locale.cityName}</h1>
            <p>
              از یک دسته یا خوراکی شروع کن؛ کافه‌هایی که واقعاً آن را در منوی ثبت‌شده دارند
              ببین و برای مقایسهٔ دقیق‌تر وارد صفحهٔ هر آیتم شو.
            </p>
          </div>
          <div className={styles.hubStats}>
            <div><strong>{faCount(facets.length)}</strong><span>دستهٔ قابل مرور</span></div>
            <div><strong>{faCount(dishes.length)}</strong><span>خوراکی محبوب</span></div>
          </div>
        </header>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div><span>دسته‌بندی‌ها</span><h2>چی میل داری؟</h2></div>
            <Link href={`${paths.search}?scope=items`}><Search size={15} /> جست‌وجوی آزاد منو</Link>
          </div>
          <div className={styles.facetGrid}>
            {facets.map((facet) => (
              <Link key={facet.id} href={paths.menuCategory(facet.id)} className={styles.facetCard}>
                <span className={styles.facetIcon}><FacetIcon id={facet.id} size={25} /></span>
                <span className={styles.facetText}>
                  <strong>{facet.labelFa}</strong>
                  <small>{faCount(facet.placeCount)} مجموعه</small>
                </span>
                <ChevronLeft size={18} />
              </Link>
            ))}
          </div>
        </section>

        {dishes.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <div><span>مقایسهٔ مستقیم</span><h2>خوراکی‌های محبوب</h2></div>
            </div>
            <div className={styles.dishGrid}>
              {dishes.map((dish) => (
                <Link key={dish.id} href={paths.dish(dish.slug)} className={styles.dishCard}>
                  <span className={styles.dishIcon}><Coffee size={20} /></span>
                  <span><strong>{dish.nameFa}</strong><small>در {faCount(dish.placeCount)} مجموعه</small></span>
                  <span className={styles.price}>{dish.minPrice === null ? 'دیدن قیمت‌ها' : `از ${toman(dish.minPrice)}`}</span>
                  <ChevronLeft size={17} />
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  )
}
