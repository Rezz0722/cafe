import Link from 'next/link'
import { searchPath } from '@/core/search/filters'
import { paths } from '@/routes'
import styles from './SiteFooter.module.css'
import { BadgeCheck } from 'lucide-react'

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
      { label: 'کافه‌های بررسی‌شده', href: paths.reviewedCafes },
      { label: 'قهوه دمی', href: paths.menuCategory('brewed_coffee') },
      { label: 'صبحانه', href: paths.menuCategory('breakfast') },
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
    title: 'راهنما',
    links: [
      { label: 'نصب کوکافه روی گوشی', href: '/install' },
      { label: 'دربارهٔ کو کافه', href: paths.about },
      { label: 'چطور استفاده کنم؟', href: '/#how-it-works' },
      { label: 'روش جمع‌آوری داده', href: paths.methodology },
      { label: 'سیاست محتوا و نظرها', href: paths.editorialPolicy },
      { label: 'حریم خصوصی', href: paths.privacy },
      { label: 'سؤال‌های رایج', href: '/#faq' },
      { label: 'مشارکت', href: paths.contribute },
    ],
  },
  {
    title: 'برای کافه‌ها',
    links: [
      { label: 'پنل مدیریت کافه', href: `${paths.admin}/venue` },
      { label: 'ثبت کافهٔ جدید', href: paths.submitPlace },
      { label: 'اصلاح اطلاعات یک کافه', href: paths.contribute },
    ],
  },
]

interface Props {
  /** نام و شرح سایت — از تنظیمات، مثل هدر. */
  siteName?: string
  tagline?: string
}

function FooterLinks({ column }: { column: (typeof COLUMNS)[number] }) {
  return (
    <nav className={styles.links} aria-label={column.title}>
      {column.links.map((link) => (
        <Link key={link.label} href={link.href}>{link.label}</Link>
      ))}
    </nav>
  )
}

export function SiteFooter({
  siteName = 'کو کافه',
  tagline = 'راهنمای منو، قیمت، ساعت کاری و مسیر کافه‌ها و رستوران‌های مشهد.',
}: Props) {
  const persianYear = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric' }).format(
    new Date(),
  )

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.grid}>
          <div className={styles.brandCol}>
            <div className={styles.footerBrand}>
              <img src="/brand/app-icon-192.png" alt="" width={192} height={192} />
              <div>
                <div className={styles.brandName}>{siteName}</div>
                <small>KuCafe · kucafe.ir · جای خوب پیدا می‌شود</small>
              </div>
            </div>
            <p className={styles.tagline}>{tagline}</p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title} className={styles.columnSet}>
              <section className={`${styles.column} ${styles.desktopColumn}`}>
                <h2 className={styles.colTitle}>{column.title}</h2>
                <FooterLinks column={column} />
              </section>
              <details className={`${styles.column} ${styles.mobileColumn}`}>
                <summary className={styles.colTitle}>{column.title}</summary>
                <FooterLinks column={column} />
              </details>
            </div>
          ))}
        </div>

        <div className={styles.bottom}>
          <div className={styles.madeBy}>
            <BadgeCheck size={15} aria-hidden="true" /> اطلاعات برای انتخاب آگاهانه‌تر
          </div>
          <div className={styles.copyright}>© {persianYear} {siteName} — همهٔ حقوق محفوظ است.</div>
        </div>
      </div>
    </footer>
  )
}
