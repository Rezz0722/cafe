import Link from 'next/link'
import { CafeCard } from '@/components/cafe/CafeCard'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { ChipLink } from '@/components/ui/Chip'
import { fa } from '@/lib/format'
import { paths } from '@/routes'
import type { District, PlaceView } from '@/core/places/types'
import styles from './CollectionPage.module.css'

interface CrumbItem {
  label: string
  href?: string
}

interface CollectionPageProps {
  title: string
  lede: string
  crumbs: CrumbItem[]
  places: PlaceView[]
  districts: District[]
  /** لینک‌های مرتبط پایین صفحه — پیوند داخلی برای کرالر و کاربر. */
  related?: { label: string; href: string }[]
  emptyNote?: string
}

/**
 * صفحه‌ی مجموعه — پایه‌ی صفحات محله و محله × نیت.
 *
 * server component و کاملاً استاتیک: هیچ تعاملی ندارد، پس هیچ جاوااسکریپتی
 * برایش به کلاینت نمی‌رود. این‌ها صفحاتی‌اند که باید در گوگل رتبه بگیرند،
 * پس سبک‌بودن و SSR بودنشان مستقیماً روی رتبه اثر دارد.
 */
export function CollectionPage({
  title,
  lede,
  crumbs,
  places,
  districts,
  related = [],
  emptyNote,
}: CollectionPageProps) {
  const districtName = (id: string) => districts.find((d) => d.id === id)?.name ?? ''

  return (
    <div className="page">
      <SiteHeader />

      <main>
        <div className={`container ${styles.head}`}>
          <nav className={styles.crumbs} aria-label="مسیر">
            {crumbs.map((crumb, i) => (
              <span key={crumb.label}>
                {i > 0 && (
                  <span className={styles.crumbSep} aria-hidden="true">
                    {' › '}
                  </span>
                )}
                {crumb.href ? (
                  <Link href={crumb.href}>{crumb.label}</Link>
                ) : (
                  <span className={styles.crumbCurrent}>{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>

          <h1 className={styles.title}>{title}</h1>
          <p className={styles.lede}>{lede}</p>
          <div className={styles.count}>{fa(places.length)} کافه</div>
        </div>

        <section className={`container ${styles.section}`}>
          {places.length > 0 ? (
            <div className={styles.grid}>
              {places.map((place) => (
                <CafeCard
                  key={place.id}
                  place={place}
                  districtName={districtName(place.districtId)}
                />
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <p>{emptyNote ?? 'هنوز کافه‌ای برای این ترکیب ثبت نشده.'}</p>
              <Link href={paths.search} className={styles.emptyCta}>
                همه‌ی کافه‌ها را ببین
              </Link>
            </div>
          )}
        </section>

        {related.length > 0 && (
          <section className={`container ${styles.section}`}>
            <h2 className={styles.h2}>جست‌وجوهای مرتبط</h2>
            <div className={styles.relatedRow}>
              {related.map((item) => (
                <ChipLink
                  key={item.href}
                  label={item.label}
                  href={item.href}
                  variant="outline"
                  size="lg"
                />
              ))}
            </div>
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
