'use client'

import { useEffect, useState } from 'react'
import type { ZeroResultSearch } from '@/core/analytics/stats'
import { fa } from '@/lib/format'
import styles from './AdminDashboard.module.css'

interface Report {
  rows: Omit<ZeroResultSearch, 'lastAt'>[]
  generatedAt: string
}

export function ZeroResultInsights() {
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let alive = true, timedOut = false
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort() }, 30_000)
    setLoading(true); setError('')
    void (async () => {
      try {
        const response = await fetch('/api/admin/search-insights', { cache: 'no-store', signal: controller.signal })
        const data = await response.json() as Report & { error?: string }
        if (!response.ok) throw new Error(data.error || 'گزارش آماده نشد.')
        if (!Array.isArray(data.rows) || !Number.isFinite(Date.parse(data.generatedAt))) throw new Error('پاسخ گزارش معتبر نیست.')
        if (alive) setReport(data)
      } catch (cause) {
        if (alive) setError(timedOut ? 'آماده‌سازی گزارش طول کشید؛ کمی بعد دوباره تلاش کنید.' : controller.signal.aborted ? 'درخواست لغو شد.' : cause instanceof Error ? cause.message : 'ارتباط با سرور برقرار نشد.')
      } finally {
        window.clearTimeout(timeout)
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false; window.clearTimeout(timeout); controller.abort() }
  }, [attempt])

  return <div className={styles.insightBox} aria-busy={loading}>
    <h2 className={styles.h2}>جست‌وجوهای بی‌نتیجه</h2>
    <p className={styles.dim}>کاربر چه چیزی خواسته که نداریم؟ گزارش کل سابقهٔ جست‌وجو؛ به‌روزرسانی حداکثر هر دقیقه.</p>
    {loading && <p role="status" className={styles.dim}>گزارش در حال آماده‌شدن است؛ می‌توانید در بخش‌های دیگر پنل کار کنید.</p>}
    {error && <div role="alert"><p className={styles.error}>{error}</p><button type="button" className={styles.headLink} style={{ minHeight: 44 }} onClick={() => setAttempt(value => value + 1)}>تلاش دوباره</button></div>}
    {!loading && report && <>
      <p className={styles.dim}>زمان محاسبه: <time dateTime={report.generatedAt}>{new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(new Date(report.generatedAt))}</time></p>
      <ul className={styles.rows}>{report.rows.map(row => <li key={JSON.stringify([row.query, row.facetIds, row.requestedScope, row.resolvedEntity, row.resolvedIntent])}>
        <span><span className={styles.entityBadge}>{row.resolvedEntity === 'items' ? 'آیتم منو' : 'کافه'}</span>{' '}{row.query || '—'}
          {row.facetIds && <span className={styles.dim}> · {row.facetIds}</span>}
          {row.resolvedIntent && <span className={styles.dim}> · {row.resolvedIntent}</span>}
        </span><span>{fa(row.count)} بار</span>
      </li>)}{report.rows.length === 0 && <li className={styles.empty}>جست‌وجوی بی‌نتیجه‌ای با عبارت واردشده ثبت نشده است.</li>}</ul>
    </>}
  </div>
}
