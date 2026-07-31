import type { Metadata } from 'next'
import Link from 'next/link'
import { NewPlaceForm } from '@/components/admin/NewPlaceForm'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { requireAdmin } from '@/core/auth/currentUser'
import { loadDistricts, loadPublishedViews } from '@/core/places/repository'
import { fa } from '@/lib/format'
import { paths } from '@/routes'
import styles from './page.module.css'

/**
 * ثبت کافه‌ی جدید — ابزار تیم داده، نه پنل مالک.
 *
 * عمداً صفحه‌ی جدا و تمام‌عرض است، نه یک تب داخل `MobileShell`: ورود داده
 * کارِ گوشی نیست. پنل مالک یک کافه را *ویرایش* می‌کند؛ این صفحه به کاتالوگ
 * *اضافه* می‌کند — دو نقش متفاوت با مخاطب متفاوت.
 */
export const metadata: Metadata = {
  title: 'ثبت کافه‌ی جدید',
  robots: { index: false, follow: false },
}

export default async function NewPlacePage() {
  // نوشتن در کاتالوگ فقط کارِ ادمین است. خودِ اکشن هم جدا بررسی می‌کند —
  // بستن صفحه، اکشن را نمی‌بندد.
  await requireAdmin(`${paths.admin}/new`)

  const [districts, places] = await Promise.all([loadDistricts(), loadPublishedViews()])

  // چند کافه هنوز هیچ ویژگی‌ای ندارند؟ همان صف کار تیم داده است.
  const withoutAttributes = places.filter((p) => p.activeAttributeIds.length === 0).length
  const withoutHours = places.filter((p) => p.hours.length === 0).length

  return (
    <div className="page">
      <SiteHeader />

      <main className={`container ${styles.wrap}`}>
        <nav className={styles.crumbs} aria-label="مسیر">
          <Link href={paths.admin}>پنل</Link>
          <span aria-hidden="true"> › </span>
          <span>ثبت کافه‌ی جدید</span>
        </nav>

        <h1 className={styles.title}>ثبت کافه‌ی جدید</h1>
        <p className={styles.lede}>
          کافه‌ی تازه‌ای پیدا کرده‌اید؟ اینجا اضافه‌اش کنید. بلافاصله در
          جست‌وجو، صفحه‌ی محله و sitemap ظاهر می‌شود.
        </p>

        {/* وضعیت کاتالوگ — صف کار، نه آمار تزئینی */}
        <div className={styles.stats}>
          <div className={styles.stat}>
            <b>{fa(places.length)}</b> کافه در کاتالوگ
          </div>
          {withoutAttributes > 0 && (
            <div className={`${styles.stat} ${styles.statWarn}`}>
              <b>{fa(withoutAttributes)}</b> بدون هیچ ویژگی — در فیلترها دیده نمی‌شوند
            </div>
          )}
          {withoutHours > 0 && (
            <div className={`${styles.stat} ${styles.statWarn}`}>
              <b>{fa(withoutHours)}</b> بدون ساعت کاری
            </div>
          )}
        </div>

        <NewPlaceForm districts={districts} />
      </main>
    </div>
  )
}
