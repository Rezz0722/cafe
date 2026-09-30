'use client'

/**
 * نمایشگر زنده‌ی پیشرفت TopMenuMarket.
 *
 * ═══ چرا اینجا polling است و نه SSE ═══
 *
 * اجرا یک پروسه‌ی پس‌زمینه روی فایل است، نه یک connection زنده. SSE فقط یک کانال
 * بازِ دائمی روی یک سرور تک‌پروسه‌ای می‌سازد که برای ۱۲ ثانیه هر بار یک درخواست
 * کوتاه ساده‌تر و بی‌دردسرتر است. اگر روزی همگام‌سازی بلادرنگ لازم شد، محل
 * تعویض همین یک effect است — بقیه‌ی کامپوننت تغییری نمی‌خواهد.
 *
 * ═══ چرا «صفر» را «نمی‌دانم» نشان می‌دهیم نه صفرِ ساختگی ═══
 *
 * قبل از اولین خطِ لاگ، `done` معلوم نیست. نشان‌دادنِ «۰ از ۰» یعنی ادعای
 * پیشرفتِ صفر در حالی که هنوز اصلاً شروع نشده — کاربر آن را می‌بیند و فکر
 * می‌کند گیر کرده. اینجا به‌جای عدد، وضعیتِ مرحله نشان داده می‌شود.
 */

import {useCallback, useEffect, useRef, useState} from 'react'
import {TOP_MENU_STAGE_LABELS, type TopMenuProgress, type TopMenuStage} from '@/core/sync/topMenuLog'
import {fa} from '@/lib/format'
import styles from './OperationsPanel.module.css'

type LogName = 'scrape' | 'reindex' | 'media'

interface Tail {
  runId: string
  status: string
  log: LogName
  lines: string[]
  truncated: boolean
  bytes: number
  updatedAt: string | null
  progress: TopMenuProgress
  remainingMs: number | null
  available: LogName[]
}

const LOG_LABELS: Record<LogName, string> = {
  scrape: 'اسکرپ',
  reindex: 'ساخت facet',
  media: 'دانلود تصویر',
}

/** فاصله‌ی تازه‌سازی. ریتمِ همگام‌سازی ۱۲ ثانیهٔ fixed است، نه تند. */
const POLL_MS = 12_000

function formatRemaining(ms: number | null): string | null {
  if (ms === null) return null
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return 'کمتر از یک دقیقه'
  if (minutes < 60) return `حدود ${fa(minutes)} دقیقه`
  const hours = Math.floor(minutes / 60)
  return `حدود ${fa(hours)} ساعت و ${fa(minutes % 60)} دقیقه`
}

function ProgressBar({ progress }: { progress: TopMenuProgress }) {
  const ratio = progress.total && progress.done !== null
    ? Math.min(1, Math.max(0, progress.done / progress.total))
    : null
  if (ratio === null) {
    return <div className={styles.logBarUnknown} role="status">درصد پیشرفت هنوز از لاگ معلوم نیست</div>
  }
  const percent = Math.round(ratio * 100)
  return <div className={styles.logBarTrack} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="پیشرفت اسکرپ">
    <div className={styles.logBarFill} style={{inlineSize:`${percent}%`}} />
    <span className={styles.logBarText}>{fa(progress.done ?? 0)} از {fa(progress.total ?? 0)} · {fa(percent)}٪</span>
  </div>
}

export function TopMenuLiveProgress({ runId, status }: { runId: string | null; status: string }) {
  const [tail, setTail] = useState<Tail | null>(null)
  const [missing, setMissing] = useState('')
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [log, setLog] = useState<LogName | null>(null)
  const seenBytes = useRef(0)
  const inFlight = useRef(false)

  const load = useCallback(async (signal?: AbortSignal) => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const query = log ? `?log=${encodeURIComponent(log)}` : ''
      const response = await fetch(`/api/admin/topmenu-log${query}`, {
        cache: 'no-store',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
      })
      if (!response.ok) throw new Error()
      const data = await response.json() as Tail | { log: null; reason: string }
      if ('log' in data && data.log === null) { setMissing(data.reason); setTail(null) }
      else {
        const fresh = data as Tail
        // تغییرِ اجرا یعنی شمارنده‌ی «لاگ جدید» باید صفر شود.
        if (seenBytes.current && tail && fresh.bytes < seenBytes.current) seenBytes.current = 0
        seenBytes.current = fresh.bytes
        setTail(fresh); setMissing(''); setError('')
      }
    } catch {
      if (!signal?.aborted) setError('لاگ زنده دریافت نشد؛ آخرین وضعیت نمایش داده می‌شود.')
    } finally {
      inFlight.current = false
    }
  }, [log, tail])

  useEffect(() => { seenBytes.current = 0; setTail(null) }, [runId])

  useEffect(() => {
    if (!runId) return
    const controller = new AbortController()
    const tick = () => { if (document.visibilityState !== 'hidden') void load(controller.signal) }
    void tick()
    const interval = setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', tick); controller.abort() }
  }, [runId, load])

  if (!runId) return null

  const progress = tail?.progress
  const remaining = formatRemaining(tail?.remainingMs ?? null)
  const stale = !!tail?.updatedAt && Date.now() - Date.parse(tail.updatedAt) > POLL_MS * 2

  return <section className={styles.logPanel}>
    <div className={styles.logPanelHead}>
      <h3>پیشرفت زنده <span dir="ltr" className={styles.logRunId}>{runId}</span></h3>
      <button type="button" onClick={() => void load()} className={styles.logRefresh}>تازه‌سازی</button>
    </div>

    {error && <p role="alert" className={styles.error}>{error}</p>}

    {!tail && <p className={styles.selectionNote}>{missing || 'در حال خواندن لاگ…'}</p>}

    {tail && progress && <>
      <p className={styles.logStage}>
        <span>{TOP_MENU_STAGE_LABELS[progress.stage as TopMenuStage] ?? progress.stage}</span>
        {progress.currentName && <b>{progress.currentName}</b>}
        {progress.currentUsername && <small dir="ltr">{progress.currentUsername}</small>}
        {stale && <em className={styles.logStale}>لاگ ۲۴ ثانیه به‌روز نشده — ممکن است اجرا متوقف شده باشد.</em>}
      </p>

      <ProgressBar progress={progress} />

      <dl className={styles.logStats}>
        <div><dt>آیتم منو</dt><dd>{fa(progress.itemsFound)}</dd></div>
        <div><dt>مجموعه‌های خطادار</dt><dd className={progress.failedCafes ? styles.logBad : undefined}>{fa(progress.failedCafes)}</dd></div>
        <div><dt>زمان باقی‌مانده</dt><dd>{remaining ?? '—'}</dd></div>
        <div><dt>حجم لاگ</dt><dd>{(tail.bytes / 1024).toFixed(0)} کیلوبایت{tail.truncated && ' (دنباله)'}</dd></div>
      </dl>

      {progress.lastFailure && <p className={styles.logLastError}>آخرین خطا: {progress.lastFailure}</p>}

      <div className={styles.logTools}>
        <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}>
          {open ? 'بستن لاگ' : `نمایش لاگ (${fa(tail.lines.length)} خط)`}
        </button>
        {tail.available.length > 1 && tail.available.map(name => <button type="button" key={name} data-active={log === name || undefined} onClick={() => setLog(log === name ? null : name)}>{LOG_LABELS[name]}</button>)}
      </div>

      {open && <pre className={styles.logPre} tabIndex={0} aria-label="لاگ اجرای همگام‌سازی">{tail.lines.join('\n')}</pre>}
    </>}
  </section>
}
