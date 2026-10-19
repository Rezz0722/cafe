import { pagePath } from '@/core/discovery/pagination'
import styles from './DiscoveryPagination.module.css'

interface Props {
  basePath: string
  page: number
  totalPages: number
  query?: Record<string, string>
  anchor?: string
}

export function DiscoveryPagination({ basePath, page, totalPages, query, anchor }: Props) {
  if (totalPages <= 1) return null
  // Each URL page uses a full SSR navigation, including its metadata and history entry.
  const pages = [...new Set([1, page - 1, page, page + 1, totalPages])]
    .filter(value => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b)
  return <nav className={styles.nav} aria-label="صفحه‌های نتایج">
    {page > 1 && <a className={styles.direction} href={pagePath(basePath, page - 1, query, anchor)} rel="prev">صفحه قبل</a>}
    <ol className={styles.pages}>
      {pages.map((value, index) => <li key={value}>
        {index > 0 && value - pages[index - 1]! > 1 && <span className={styles.gap} aria-hidden="true">…</span>}
        <a href={pagePath(basePath, value, query, anchor)} className={styles.number} aria-label={`صفحه ${value.toLocaleString('fa-IR')}`} aria-current={value === page ? 'page' : undefined}>
          {value.toLocaleString('fa-IR')}
        </a>
      </li>)}
    </ol>
    {page < totalPages && <a className={styles.direction} href={pagePath(basePath, page + 1, query, anchor)} rel="next">صفحه بعد</a>}
  </nav>
}
