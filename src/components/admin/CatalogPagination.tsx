'use client'
import { fa } from '@/lib/format'
import styles from './AdminDashboard.module.css'
export function CatalogPagination({ total, page, setPage, loading, error, retry }: { total: number; page: number; setPage: (page: number) => void; loading: boolean; error: string; retry: () => void }) {
  const pages = Math.max(1, Math.ceil(total / 25))
  return <div className={styles.catalogPagination}>
    <p role="status" aria-live="polite">{loading ? 'در حال دریافت فهرست…' : `${fa(total)} نتیجه · صفحه ${fa(page)} از ${fa(pages)}`}</p>
    {error && <p role="alert">{error} <button type="button" onClick={retry}>تلاش دوباره</button></p>}
    <nav aria-label="صفحه‌بندی فهرست"><button type="button" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>صفحه قبل</button><button type="button" disabled={loading || page >= pages} onClick={() => setPage(page + 1)}>صفحه بعد</button></nav>
  </div>
}
