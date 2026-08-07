import Link from 'next/link'
import { searchPath } from '@/core/search/filters'
import { paths } from '@/routes'
import styles from './SiteFooter.module.css'
import { Heart } from 'lucide-react'

/** نشانه‌گذارِ ستونی که عنوانش نامِ برند است — در رندر با تنظیمات عوض می‌شود. */
const BRAND_COLUMN = '__brand__'

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    // لینک‌ها با سازنده‌ی فیلتر ساخته می‌شوند نه با رشته‌ی دستی، تا اگر شکل
    // پارامترهای جست‌وجو عوض شد، همه‌جا یک‌جا اصلاح شود.
    title: 'کشف',
    links: [
      { label: 'کامل‌ترین اطلاعات', href: searchPath({ sort: 'quality' }) },
      { label: 'الان باز است', href: searchPath({ openNow: true }) },
      { label: 'نزدیک من', href: searchPath({ nearMe: true, sort: 'distance' }) },
      { label: 'روی نقشه', href: searchPath({ view: 'map' }) },
      { label: 'قهوه دمی', href: searchPath({ facets: ['brewed_coffee'] }) },
      { label: 'صبحانه', href: searchPath({ facets: ['breakfast'] }) },
    ],
  },
  {
    // این‌ها حالا به صفحات محله می‌روند — صفحات SEO، نه جست‌وجوی متنی.
    title: 'محله‌ها',
    links: [
      { label: 'همه‌ی محله‌ها', href: paths.districtHub },
      { label: 'احمدآباد', href: paths.district('ahmadabad') },
      { label: 'بلوار سجاد', href: paths.district('sajad') },
      { label: 'قاسم‌آباد', href: paths.district('ghasemabad') },
      { label: 'کوهسنگی', href: paths.district('kuhsangi') },
    ],
  },
  {
    title: BRAND_COLUMN,
    links: [
      { label: 'دربارهٔ ما', href: paths.home },
      { label: 'مشارکت', href: paths.contribute },
      { label: 'تماس', href: paths.home },
      // `/admin` حالا پنل ادمین است، نه پنل مالک؛ این لینک همان پنل مالک را
      // می‌خواهد و باید مستقیم به `/admin/venue` برود.
      { label: 'پنل مدیریت کافه', href: `${paths.admin}/venue` },
    ],
  },
]

interface Props {
  /** نام و شرح سایت — از تنظیمات، مثل هدر. */
  siteName?: string
  tagline?: string
}

export function SiteFooter({
  siteName = 'کو کافه',
  tagline = 'راهنمای گرم و قابل‌اعتماد کافه و رستوران‌های مشهد. اسم مکان رو جستجو نکن، حالت رو بگو.',
}: Props) {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.grid}>
          <div className={styles.brandCol}>
            <div className={styles.brandName}>{siteName}</div>
            <p className={styles.tagline}>{tagline}</p>
          </div>

          {COLUMNS.map((column) => (
            <nav
              key={column.title}
              aria-label={column.title === BRAND_COLUMN ? siteName : column.title}
            >
              <div className={styles.colTitle}>
                {column.title === BRAND_COLUMN ? siteName : column.title}
              </div>
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
            ساختهٔ جوون‌های مشهد <Heart size={14} className={styles.heart} aria-hidden="true" fill="currentColor" />
          </div>
          <div className={styles.copyright}>© ۱۴۰۴ {siteName} — همهٔ حقوق محفوظ است.</div>
        </div>
      </div>
    </footer>
  )
}
