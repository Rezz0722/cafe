import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Search } from 'lucide-react'
import { MenuItemCard } from '@/components/items/MenuItemCard'
import { BreadcrumbJsonLd } from '@/components/seo/PlaceJsonLd'
import { getDishBySlug } from '@/core/places/queries'
import { countMenuItems, listMenuItemCards } from '@/core/items/queries'
import { itemSlug } from '@/core/items/identity'
import { MaintenanceScreen } from '@/components/site/MaintenanceScreen'
import { maintenanceState } from '@/core/settings/maintenance'
import { getSiteName } from '@/core/settings/policies'
import { absoluteUrl, paths } from '@/routes'
import { robotsFor } from '@/core/seo/indexability'
import { faCount, toman } from '@/lib/format'
import styles from './page.module.css'

interface PageProps { params: Promise<{ slug: string }> }

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const dish = await getDishBySlug((await params).slug)
  if (!dish) return { title: 'خوراکی پیدا نشد', robots: { index: false, follow: true } }
  const description = `${dish.nameFa} در منوی کافه‌های مشهد؛ مقایسهٔ قیمت و دیدن صفحهٔ هر آیتم و کافهٔ ارائه‌دهنده.`
  return {
    title: `${dish.nameFa} در مشهد؛ منو و مقایسه قیمت`,
    description,
    alternates: { canonical: paths.dish(dish.slug) },
    robots: robotsFor(['addons', 'service'].includes(dish.facetId ?? '') || dish.slug === 'hookah' ? 0 : dish.placeCount),
  }
}

export default async function DishPage({ params }: PageProps) {
  const gate = await maintenanceState()
  if (gate.closed) return <MaintenanceScreen siteName={gate.siteName} message={gate.message} />

  const dish = await getDishBySlug((await params).slug)
  if (!dish) notFound()

  const [items, total, siteName] = await Promise.all([
    listMenuItemCards({ dishId: dish.id, availableOnly: true, limit: 24 }),
    countMenuItems({ dishId: dish.id, availableOnly: true }),
    getSiteName(),
  ])

  const pageUrl = paths.dish(dish.slug)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': absoluteUrl(pageUrl),
    url: absoluteUrl(pageUrl),
    name: `${dish.nameFa} در کافه‌های مشهد`,
    description: `مقایسهٔ ${faCount(total)} آیتم ${dish.nameFa} در منوهای ثبت‌شده`,
    inLanguage: 'fa-IR',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: total,
      itemListElement: items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'MenuItem',
          name: item.name,
          url: absoluteUrl(paths.item(item.publicId, itemSlug(item.name))),
          ...(item.description ? { description: item.description } : {}),
          ...(item.image ? { image: item.image.fullUrl } : {}),
          ...(item.price !== null
            ? { offers: { '@type': 'Offer', price: item.price * 10, priceCurrency: 'IRR' } }
            : {}),
          provider: {
            '@type': 'FoodEstablishment',
            name: item.place.name,
            url: absoluteUrl(paths.cafe(item.place.slug)),
          },
        },
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
          { name: dish.nameFa, path: pageUrl },
        ]}
      />
      <main className={styles.wrap}>
        <nav className={styles.breadcrumbs} aria-label="مسیر صفحه">
        <Link href={paths.home}>خانه</Link>
        <ChevronLeft size={14} aria-hidden="true" />
        <Link href={paths.menuHub}>منوهای مشهد</Link>
        <ChevronLeft size={14} aria-hidden="true" />
        <span aria-current="page">{dish.nameFa}</span>
        </nav>

      <header className={styles.hero}>
        <div>
          <span className={styles.kicker}>مقایسهٔ یک خوراکی در منوهای واقعی</span>
          <h1>{dish.nameFa} در کافه‌های مشهد</h1>
          <p>
            {faCount(total)} آیتم موجود از منوی کافه‌ها؛ هر کارت یک محصول مشخص با
            قیمت و کافهٔ ارائه‌دهنده است، نه یک نتیجهٔ کلی از خود کافه.
          </p>
        </div>
        <dl className={styles.stats}>
          <div><dt>کافه‌ها</dt><dd>{faCount(dish.placeCount)}</dd></div>
          <div><dt>کمترین قیمت</dt><dd>{dish.minPrice === null ? 'نامشخص' : toman(dish.minPrice)}</dd></div>
          <div><dt>میانهٔ قیمت</dt><dd>{dish.medianPrice === null ? 'نامشخص' : toman(dish.medianPrice)}</dd></div>
        </dl>
      </header>

      {items.length > 0 ? (
        <>
          <div className={styles.resultHead}>
            <h2>آیتم‌های موجود</h2>
            <Link href={`/search?scope=items&dish=${encodeURIComponent(dish.slug)}`}>
              <Search size={16} aria-hidden="true" />
              فیلتر و مرتب‌سازی همهٔ نتایج
            </Link>
          </div>
          <ul className={styles.grid}>
            {items.map((item) => <li key={item.id}><MenuItemCard item={item} /></li>)}
          </ul>
          {total > items.length && (
            <Link className={styles.more} href={`/search?scope=items&dish=${encodeURIComponent(dish.slug)}`}>
              دیدن هر {faCount(total)} آیتم
            </Link>
          )}
        </>
      ) : (
        <div className={styles.empty}>در حال حاضر آیتم موجودی برای این دسته ثبت نشده است.</div>
      )}
      </main>
    </>
  )
}
