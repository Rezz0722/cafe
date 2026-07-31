import Link from 'next/link'
import { paths, searchByIntents } from '@/routes'
import styles from './SiteFooter.module.css'

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'کشف',
    links: [
      { label: 'کافه‌های منتخب', href: paths.search },
      { label: 'باز الان', href: paths.search },
      // نیت با شناسه پاس داده می‌شود نه با برچسب فارسی، تا لینک به تطبیق متن وابسته نباشد.
      { label: 'مناسب کار', href: searchByIntents(['laptop_friendly']) },
      { label: 'روی نقشه', href: paths.search },
    ],
  },
  {
    // این‌ها حالا به صفحات محله می‌روند — صفحات SEO، نه جست‌وجوی متنی.
    title: 'محله‌ها',
    links: [
      { label: 'احمدآباد', href: paths.district('ahmadabad') },
      { label: 'بلوار سجاد', href: paths.district('sajad') },
      { label: 'قاسم‌آباد', href: paths.district('ghasemabad') },
      { label: 'کوهسنگی', href: paths.district('kuhsangi') },
    ],
  },
  {
    title: 'کافه‌گرد',
    links: [
      { label: 'دربارهٔ ما', href: paths.home },
      { label: 'مشارکت', href: paths.home },
      { label: 'تماس', href: paths.home },
      // `/admin` حالا پنل ادمین است، نه پنل مالک؛ این لینک همان پنل مالک را
      // می‌خواهد و باید مستقیم به `/admin/venue` برود.
      { label: 'پنل مدیریت کافه', href: `${paths.admin}/venue` },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.grid}>
          <div className={styles.brandCol}>
            <div className={styles.brandName}>کافه‌گرد</div>
            <p className={styles.tagline}>
              راهنمای گرم و قابل‌اعتماد کافه و رستوران‌های مشهد. اسم مکان رو جستجو نکن، حالت رو بگو.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <div className={styles.colTitle}>{column.title}</div>
              <div className={styles.links}>
                {column.links.map((link) => (
                  <Link key={link.label} href={link.href}>
                    {link.label}
                  </Link>
                ))}
              </div>
            </nav>
          ))}
        </div>

        <div className={styles.bottom}>
          <div className={styles.madeBy}>
            ساختهٔ جوون‌های مشهد <span className={styles.heart}>❤</span>
          </div>
          <div className={styles.copyright}>© ۱۴۰۴ کافه‌گرد — همهٔ حقوق محفوظ است.</div>
        </div>
      </div>
    </footer>
  )
}
