import { Link } from 'react-router-dom'
import { paths, searchUrl } from '@/routes'
import styles from './SiteFooter.module.css'

const COLUMNS: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: 'کشف',
    links: [
      { label: 'کافه‌های منتخب', to: paths.search },
      { label: 'باز الان', to: paths.search },
      { label: 'مناسب کار', to: searchUrl('مناسب کار با لپ‌تاپ') },
      { label: 'روی نقشه', to: paths.search },
    ],
  },
  {
    title: 'محله‌ها',
    links: [
      { label: 'احمدآباد', to: searchUrl('احمدآباد') },
      { label: 'بلوار سجاد', to: searchUrl('سجاد') },
      { label: 'قاسم‌آباد', to: searchUrl('قاسم‌آباد') },
      { label: 'کوهسنگی', to: searchUrl('کوهسنگی') },
    ],
  },
  {
    title: 'کافه‌گرد',
    links: [
      { label: 'دربارهٔ ما', to: paths.home },
      { label: 'مشارکت', to: paths.home },
      { label: 'تماس', to: paths.home },
      { label: 'پنل مدیریت کافه', to: paths.admin },
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
                  <Link key={link.label} to={link.to}>
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
