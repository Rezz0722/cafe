import type { Metadata } from 'next'
import Link from 'next/link'
import { PlaceCardView } from '@/components/cafe/PlaceCardView'
import { HomeSearch } from '@/components/home/HomeSearch'
import {
  getSiteStats,
  listDistricts,
  listFilterFacets,
  listPlaceCards,
  listPopularDishes,
} from '@/core/places/queries'
import { searchPath } from '@/core/search/filters'
import { fa, faCount, toman } from '@/lib/format'
import { paths } from '@/routes'
import styles from './page.module.css'

/**
 * صفحه‌ی اول.
 *
 * ═══ چه چیزی اینجاست و چرا ═══
 *
 * صفحه‌ی اول یک راهنمای شهری باید به یک سؤال جواب بدهد: «الان کجا برم؟»
 * پس ساختارش سه لایه است، از عام به خاص:
 *
 *   ۱. جست‌وجو + «نزدیک من»          — کاربری که می‌داند چه می‌خواهد
 *   ۲. «بهترین X نزدیک من»           — کاربری که هوس چیزی کرده
 *   ۳. دسته‌ها و محله‌ها               — کاربری که می‌خواهد بگردد
 *
 * همه‌ی اعداد از دیتابیس می‌آیند، هیچ‌کدام دستی نوشته نشده‌اند: «۱۰۹ کافه پاستا
 * دارند» یک واقعیت است و اگر داده عوض شود، عدد هم عوض می‌شود.
 */

export const metadata: Metadata = {
  title: 'کافه‌گرد — راهنمای کافه‌ها و رستوران‌های مشهد',
  description:
    'قیمت واقعی منو، ساعت کاری، نقشه و مسیریابی برای کافه‌ها و رستوران‌های مشهد. فیلتر بر اساس قیمت، محله و منو.',
  alternates: { canonical: '/' },
}

export default async function HomePage() {
  const [stats, facets, dishes, districts, topRated, cheapest] = await Promise.all([
    getSiteStats(),
    listFilterFacets(),
    listPopularDishes(16),
    listDistricts(),
    listPlaceCards({ limit: 6, sort: 'quality' }),
    listPlaceCards({ limit: 6, sort: 'price_asc' }),
  ])

  const popularFacets = facets.filter((facet) => facet.isPopular).slice(0, 12)
  const activeDistricts = districts
    .filter((district) => district.placeCount > 0)
    .sort((a, b) => b.placeCount - a.placeCount)

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.title}>کافه‌های مشهد، با قیمت واقعی منو</h1>
        <p className={styles.lead}>
          {faCount(stats.publishedPlaces)} مجموعه · {faCount(stats.menuItems)} آیتم منو با قیمت ·{' '}
          {faCount(stats.itemsWithImage)} عکس · روی نقشه‌ی آفلاین
        </p>

        <HomeSearch />

        <div className={styles.heroLinks}>
          <Link href={searchPath({ nearMe: true, sort: 'distance' })} className={styles.heroPrimary}>
            نزدیک من
          </Link>
          <Link href={searchPath({ openNow: true })} className={styles.heroSecondary}>
            الان باز است
          </Link>
          <Link href={searchPath({ view: 'map' })} className={styles.heroSecondary}>
            نمای نقشه
          </Link>
          <Link href={searchPath({ maxPrice: 200_000 })} className={styles.heroSecondary}>
            تا ۲۰۰ هزار تومان
          </Link>
        </div>
      </section>

      {/* ── بهترین X نزدیک من ─────────────────────────────────────── */}
      {dishes.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>بهترین … نزدیک من</h2>
            <p>
              از {faCount(stats.menuItems)} آیتم منو ساخته شده — روی هرکدام بزنید، نزدیک‌ترین‌ها
              مرتب می‌شوند.
            </p>
          </div>
          <div className={styles.dishGrid}>
            {dishes.map((dish) => (
              <Link
                key={dish.slug}
                href={searchPath({ dish: dish.slug, nearMe: true, sort: 'distance' })}
                className={styles.dishCard}
              >
                <span className={styles.dishName}>{dish.nameFa}</span>
                <span className={styles.dishMeta}>
                  {fa(dish.placeCount)} مجموعه
                  {dish.minPrice ? ` · از ${toman(dish.minPrice)}` : ''}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── دسته‌های پرمصرف ───────────────────────────────────────── */}
      {popularFacets.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>دنبال چه هستید؟</h2>
            <p>
              این دسته‌ها از منوی واقعی مجموعه‌ها استخراج شده‌اند. عددها تعداد مجموعه‌اند.
            </p>
          </div>
          <div className={styles.facetGrid}>
            {popularFacets.map((facet) => (
              <Link
                key={facet.id}
                href={searchPath({ facets: [facet.id] })}
                className={styles.facetCard}
              >
                <span className={styles.facetIcon} aria-hidden="true">
                  {facet.icon}
                </span>
                <span className={styles.facetName}>{facet.labelFa}</span>
                <span className={styles.facetCount}>{fa(facet.placeCount)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── کامل‌ترین پروفایل‌ها ──────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>کامل‌ترین اطلاعات</h2>
          <p>
            مجموعه‌هایی که منو، ساعت کاری، مختصات و تماسشان ثبت شده — یعنی می‌توانید
            رویشان حساب کنید.
          </p>
        </div>
        <ul className={styles.cardList}>
          {topRated.map((card) => (
            <li key={card.id}>
              <PlaceCardView card={card} />
            </li>
          ))}
        </ul>
        <Link href={searchPath({ sort: 'quality' })} className={styles.more}>
          دیدن همه
        </Link>
      </section>

      {/* ── ارزان‌ترین‌ها ─────────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>اقتصادی‌ترین منوها</h2>
          <p>بر اساس میانه‌ی قیمت منو، نه یک آیتم انتخابی.</p>
        </div>
        <ul className={styles.cardList}>
          {cheapest.map((card) => (
            <li key={card.id}>
              <PlaceCardView card={card} />
            </li>
          ))}
        </ul>
        <Link href={searchPath({ sort: 'price_asc' })} className={styles.more}>
          دیدن همه
        </Link>
      </section>

      {/* ── محله‌ها ───────────────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>محله‌ها</h2>
          <p>{fa(activeDistricts.length)} محله‌ی مشهد و حومه، با تعداد مجموعه.</p>
        </div>
        <div className={styles.districtGrid}>
          {activeDistricts.map((district) => (
            <Link
              key={district.id}
              href={paths.district(district.slug)}
              className={styles.districtCard}
            >
              <span>{district.name}</span>
              <span className={styles.districtCount}>{fa(district.placeCount)}</span>
            </Link>
          ))}
        </div>
      </section>

      <footer className={styles.dataFoot}>
        <p>
          داده‌ی منو و قیمت از منوی رسمی مجموعه‌ها گرفته شده و ممکن است تغییر کرده باشد.
          نقشه بر پایه‌ی OpenStreetMap است و کاملاً لوکال سرو می‌شود.
        </p>
      </footer>
    </div>
  )
}
