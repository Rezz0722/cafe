'use client'

/**
 * تب عملیات — کارهای نگه‌داری که تا امروز فقط با اجرای دستیِ اسکریپت
 * انجام می‌شدند.
 *
 * ═══ قاعده‌ی ورود به این تب ═══
 *
 * هر عملیاتی که اینجا دکمه دارد باید **idempotent** باشد: دو بار زدنش نباید
 * چیزی را خراب کند. عملیاتی که این شرط را ندارد (مثل ایمپورت کامل، که همه‌ی
 * مکان‌ها را پاک و از نو می‌سازد) عمداً اینجا نیست و فرمانِ ترمینالش نوشته
 * شده — یک دکمه که با یک کلیک اضافی داده را می‌برد، بدترین نوع «امکانات
 * پنل» است.
 */

import {useEffect,useState,useRef,useCallback} from 'react'
import {ManagedForm,useManagedActionState,useManagedFormStatus} from './ManagedForm'
import { runOperationAction } from '@/app/admin/actions'
import { EMPTY_ADMIN_STATE } from '@/app/admin/state'
import styles from './OperationsPanel.module.css'
import type { TopMenuSyncState } from '@/core/sync/topMenuSync'
import { fa, toman } from '@/lib/format'
import { SyncCafePicker } from './SyncCafePicker'
import { TopMenuLiveProgress } from './TopMenuLiveProgress'

interface Operation {
  id: string
  title: string
  description: string
  /** برچسب دکمه — فعلی، نه اسمی. */
  action: string
  heavy?: boolean
}

const OPERATIONS: Operation[] = [
  {
    id: 'rollup',
    title: 'بازمحاسبه‌ی آمار روزانه',
    description:
      'اعداد امروز و دیروز را از جدول خامِ بازدید در `daily_stat` می‌نویسد. نمودار بازدید از همین جدول می‌آید، پس اگر عددها عقب افتاده‌اند این را بزنید.',
    action: 'بازمحاسبه',
  },
  {
    id: 'purge_views',
    title: 'پاک‌سازی بازدیدهای قدیمی',
    description:
      'ردیف‌های خامِ قدیمی‌تر از «نگه‌داشتن بازدید خام» (در تب تنظیمات، گروه آمار) را حذف می‌کند. آمارِ فشرده‌ی روزانه دست‌نخورده می‌ماند.',
    action: 'پاک‌سازی',
    heavy: true,
  },
  {
    id: 'recompute_derived',
    title: 'بازمحاسبه‌ی مقادیر مشتق',
    description:
      'رده‌ی قیمت، کمینه/میانه/بیشینه‌ی قیمت و امتیاز کیفیتِ همه‌ی مجموعه‌ها را از نو می‌سازد. بعد از عوض‌کردن مرزهای رده‌ی قیمت **لازم** است، وگرنه فیلتر «اقتصادی» با مرز تازه نمی‌خواند.',
    action: 'بازمحاسبه',
    heavy: true,
  },
  {
    id: 'recalc_ratings',
    title: 'بازمحاسبه‌ی امتیازها',
    description:
      'امتیاز و تعداد نظرِ هر مجموعه را از نظرهای **تأییدشده** از نو می‌شمارد. اگر نظرها را دستی در دیتابیس عوض کرده‌اید، این عددها را با واقعیت هم‌گام می‌کند.',
    action: 'بازمحاسبه',
    heavy: true,
  },
  {
    id: 'clear_caches',
    title: 'خالی‌کردن کش‌ها',
    description:
      'کش‌های درون‌حافظه‌ای (تنظیمات، داده‌ی مرجع، میانگین امتیاز سایت) و کش صفحه‌های Next را خالی می‌کند. اگر تغییری را نمی‌بینید، اول این را بزنید.',
    action: 'خالی کن',
  },
]

/** فرمان‌هایی که عمداً دکمه ندارند — چون idempotent نیستند یا چند دقیقه طول می‌کشند. */
const MANUAL: { command: string; what: string }[] = [
  {
    command: 'npm run import:cafes',
    what: 'ایمپورت کامل از فایل منبع — همه‌ی مکان‌ها را پاک و از نو می‌سازد.',
  },
  {
    command: 'npm run build:facets',
    what: 'بازسازی facetها و دیش‌ها؛ بعد از تغییر «حداقل کافه برای پرمصرف» لازم است.',
  },
  { command: 'npm run media:download', what: 'دانلود تصاویری که هنوز نیامده‌اند.' },
  {
    command: 'npm run map:extract',
    what: 'استخراج دوباره‌ی نقشه از فایل PBF — چند دقیقه و چند گیگ حافظه.',
  },
  {
    command: 'npm run db:verify',
    what: 'بررسی اینکه ایندکس‌های FULLTEXT سر جایشان هستند.',
  },
]

function RunButton({ label, heavy }: { label: string; heavy?: boolean }) {
  const { pending } = useManagedFormStatus()
  return (
    <button
      type="submit"
      className={heavy ? styles.runHeavy : styles.run}
      disabled={pending}
    >
      {pending ? 'در حال اجرا…' : label}
    </button>
  )
}

const SYNC_STATUS: Record<string, string> = {
  idle: 'هنوز اجرا نشده', scraping: 'در حال دریافت داده…', ready: 'گزارش آمادهٔ بررسی',
  applying: 'در حال بکاپ و همگام‌سازی کامل…', completed: 'همگام‌سازی شده', failed: 'ناموفق',
}

export function OperationsPanel({ topMenuSync: initialSync }: { topMenuSync: TopMenuSyncState }) {
  const [topMenuSync,setSync]=useState(initialSync)
  const [jobs,setJobs]=useState<{runId:string;status:string;changes:number|null;hasReport?:boolean}[]>([])
  useEffect(()=>{const controller=new AbortController();void fetch('/api/admin/topmenu-report',{signal:controller.signal,cache:'no-store'}).then(response=>response.ok?response.json():null).then(data=>{if(data)setJobs(data.jobs)}).catch(()=>{});return()=>controller.abort()},[topMenuSync.runId,topMenuSync.status])
  const [state, action] = useManagedActionState(runOperationAction, EMPTY_ADMIN_STATE)
  const [syncPending, setSyncPending] = useState(false)
  const refreshLock=useRef(false)
  const [refreshError,setRefreshError]=useState('')
  const refreshSync=useCallback(async(signal?:AbortSignal)=>{
    if(refreshLock.current||syncPending)return
    refreshLock.current=true
    try{const response=await fetch('/api/admin/topmenu-sync',{cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});if(!response.ok)throw new Error();const fresh=await response.json();if(!signal?.aborted){setSync(fresh);setRefreshError('')}}
    catch{if(!signal?.aborted)setRefreshError('وضعیت تازه دریافت نشد؛ وضعیت قبلی نمایش داده می‌شود.')}
    finally{refreshLock.current=false}
  },[syncPending])
  useEffect(()=>{const controller=new AbortController();const refresh=()=>{if(document.visibilityState!=='hidden')void refreshSync(controller.signal)};const interval=setInterval(refresh,12000);document.addEventListener('visibilitychange',refresh);return()=>{clearInterval(interval);document.removeEventListener('visibilitychange',refresh);controller.abort()}},[refreshSync])
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const report = topMenuSync.report
  const busy = topMenuSync.status === 'scraping' || topMenuSync.status === 'applying'
  const [scrapeScope, setScrapeScope] = useState<'all' | 'selected'>(() => busy ? topMenuSync.selection?.scope ?? 'selected' : 'selected')
  const [scrapeIds, setScrapeIds] = useState<number[]>(() => topMenuSync.selection?.scope === 'selected'
    ? topMenuSync.selection.sourceIds.filter(id => topMenuSync.catalog?.some(target => target.sourceId === id)) : [])
  const [applyScope, setApplyScope] = useState<'all' | 'selected'>('selected')
  const [applyIds, setApplyIds] = useState<number[]>(() => topMenuSync.selection?.scope === 'selected'
    ? topMenuSync.selection.sourceIds.filter(id => topMenuSync.reportTargets?.some(target => target.sourceId === id)) : [])
  const selectedRun=useRef(topMenuSync.runId)
  const [selectionReport,setSelectionReport]=useState<{summary:Record<string,number>;limitations:string[]}|null>(null)
  const [selectionError,setSelectionError]=useState('')
  useEffect(()=>{
    if(selectedRun.current!==topMenuSync.runId){selectedRun.current=topMenuSync.runId;setApplyIds([]);setApplyScope('selected');setSelectionReport(null)}
  },[topMenuSync.runId])
  useEffect(()=>{
    setSelectionReport(null);setSelectionError('')
    if(!topMenuSync.runId||applyScope!=='selected'||!applyIds.length)return
    const controller=new AbortController(),timer=setTimeout(async()=>{
      try{const response=await fetch(`/api/admin/topmenu-report?summary=1&runId=${encodeURIComponent(topMenuSync.runId!)}&sourceIds=${applyIds.join(',')}`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});if(!response.ok)throw new Error();const data=await response.json();if(!controller.signal.aborted)setSelectionReport(data)}catch{if(!controller.signal.aborted)setSelectionError('خلاصه انتخاب فعلی دریافت نشد؛ آمار بالا مربوط به کل گزارش است.')}
    },350)
    return()=>{clearTimeout(timer);controller.abort()}
  },[topMenuSync.runId,applyScope,applyIds])

  async function startSync(mode: 'scrape' | 'apply', confirm?: string) {
    const scope = mode === 'scrape' ? scrapeScope : applyScope
    const sourceIds = scope === 'all' ? [] : mode === 'scrape' ? scrapeIds : applyIds
    if (scope === 'selected' && !sourceIds.length) { setSyncError('حداقل یک کافه را تیک بزن.'); return }
    setSyncPending(true)
    setSyncError(null)
    setSyncMessage(null)
    try {
      const response = await fetch('/api/admin/topmenu-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, confirm, scope, sourceIds, runId: topMenuSync.runId }),
      })
      const result = await response.json() as { ok?: boolean; message?: string; error?: string }
      if (!response.ok || !result.ok) {
        setSyncError(result.error || 'شروع عملیات انجام نشد.')
        return
      }
      setSyncMessage(result.message || 'عملیات شروع شد.')
      const fresh=await fetch('/api/admin/topmenu-sync',{cache:'no-store'});if(fresh.ok)setSync(await fresh.json())
    } catch {
      setSyncError('پاسخ سرور نرسید؛ قبل از تلاش دوباره، وضعیت را تازه کن. ممکن است عملیات شروع شده باشد.')
    } finally {
      setSyncPending(false)
    }
  }

  return (
    <div className={styles.wrap}>
      {state.error && <p className={styles.error}>{state.error}</p>}
      {state.ok && state.message && <p className={styles.success}>{state.message}</p>}

      <section className={styles.syncCard}>
        <div className={styles.syncHead}>
          <div>
            <h2>همگام‌سازی TopMenuMarket</h2>
            <p>اسکرپ ابتدا فقط گزارش می‌سازد. پس از تأیید، کافه‌های جدید، تمام منوی تودرتو، قیمت، موجودی، دسته‌بندی و تصاویر همگام می‌شوند.</p>
          </div>
          <span className={styles.status} data-status={topMenuSync.status}>{SYNC_STATUS[topMenuSync.status]}</span>
        </div>

        {(syncError || topMenuSync.error) && <p className={styles.error}>{syncError || topMenuSync.error}</p>}
        {syncMessage && <p className={styles.success}>{syncMessage}</p>}

        {/*
          نمایشگر زنده بالای انتخاب کافه‌ها می‌نشیند، نه پایین گزارش: وقتی اسکرپ
          در حال اجراست، «چقدر مانده» اولین چیزی است که ادمین می‌خواهد بداند. بعد از
          شکست هم می‌ماند — جایی که اجرا ایستاده از همین‌جا معلوم می‌شود.
        */}
        <TopMenuLiveProgress runId={topMenuSync.runId} status={topMenuSync.status} />

        <SyncCafePicker title="۱. کدام کافه‌ها اسکرپ شوند؟" targets={topMenuSync.catalog ?? []}
          scope={scrapeScope} selected={scrapeIds} onScope={setScrapeScope} onSelected={setScrapeIds}
          disabled={syncPending || busy} allLabel="همهٔ کافه‌های منبع، شامل کافه‌های جدید" />

        <div className={styles.syncActions}>
          <form onSubmit={(event) => {
            event.preventDefault()
            if (window.confirm(scrapeScope === 'all' ? 'اسکرپ همهٔ کافه‌های TopMenuMarket شروع شود؟' : `فقط ${fa(scrapeIds.length)} کافهٔ انتخاب‌شده اسکرپ شوند؟ هنوز هیچ تغییری در دیتابیس اعمال نمی‌شود.`)) void startSync('scrape')
          }}>
            <button type="submit" className={styles.runHeavy} disabled={syncPending || busy || (scrapeScope === 'selected' && !scrapeIds.length)}>
              {syncPending ? 'در حال ارسال…' : scrapeScope === 'all' ? 'اسکرپ همه و ساخت گزارش' : `اسکرپ ${fa(scrapeIds.length)} کافهٔ انتخاب‌شده`}
            </button>
          </form>
          <button type="button" className={styles.run} onClick={() => void refreshSync()} disabled={syncPending}>تازه‌کردن وضعیت</button>
        </div>

        {refreshError&&<p role="alert" className={styles.error}>{refreshError}</p>}

        {busy && <p className={styles.progressNote}>عملیات روی سرور ادامه دارد؛ می‌توانید بعداً برگردید. محدوده: {(topMenuSync.status === 'applying' ? topMenuSync.applySelection : topMenuSync.selection)?.scope === 'selected' ? `${fa((topMenuSync.status === 'applying' ? topMenuSync.applySelection : topMenuSync.selection)?.sourceIds.length ?? 0)} کافهٔ انتخاب‌شده` : 'همهٔ کافه‌های این مرحله'}.</p>}

        {report && (
          <div className={styles.report}>
            <div className={styles.reportStats}>
              <span><strong>{fa(report.sourceCafes)}</strong> کافه در منبع</span>
              <span><strong>{fa(report.matchedCafes)}</strong> کافه تطبیق‌یافته</span>
              <span><strong>{fa(report.priceIncreases)}</strong> افزایش قیمت</span>
              <span><strong>{fa(report.priceDecreases)}</strong> کاهش قیمت</span>
              <span><strong>{fa(report.availabilityChanges)}</strong> تغییر موجودی</span>
              <span><strong>{fa(report.totalNewItems)}</strong> آیتم جدید</span>
              <span><strong>{fa(report.totalNewSections ?? 0)}</strong> دستهٔ جدید</span>
              <span><strong>{fa(report.totalMovedItems ?? 0)}</strong> جابه‌جایی آیتم</span>
              <span><strong>{fa(report.totalArchivedItems ?? 0)}</strong> آیتم حذف‌شده از منبع</span>
              <span><strong>{fa(report.totalNewCafes)}</strong> کافه جدید</span>
              <span><strong>{fa(report.totalConflicts ?? 0)}</strong> تداخل شناسه</span>
              <span><strong>{fa(report.failedCafes)}</strong> خطای اسکرپ</span>
            </div>

            {report.cafes.length > 0 && <details open className={styles.reportSection}><summary>کافه‌های دارای تغییر ({fa(report.cafes.length)})</summary><div className={styles.changeList}>{report.cafes.map((cafe) => <div key={cafe.placeId}><strong>{cafe.name}</strong><span>{fa(cafe.newItems ?? 0)} آیتم جدید · {fa(cafe.movedItems ?? 0)} جابه‌جایی · {fa(cafe.archivedItems ?? 0)} آرشیو · {fa(cafe.priceIncreases)} افزایش · {fa(cafe.priceDecreases)} کاهش · {fa(cafe.availabilityChanges)} موجودی</span></div>)}</div></details>}
            {report.changes.length > 0 && <details className={styles.reportSection}><summary>قیمت‌ها و موجودی‌های جدید (نمایش {fa(report.changes.length)} از {fa(report.totalChanges)} مورد)</summary><div className={styles.priceTable}>{report.changes.map((change) => <div key={change.itemId}><span><strong>{change.itemName}</strong><small>{change.placeName}</small></span><span dir="ltr">{change.oldPrice === null ? '—' : toman(change.oldPrice)} → {change.newPrice === null ? '—' : toman(change.newPrice)}</span>{change.oldAvailable !== change.newAvailable && <em>{change.newAvailable ? 'موجود شده' : 'ناموجود شده'}</em>}</div>)}</div></details>}
            {report.newCafes.length > 0 && <details className={styles.reportSection}><summary>کافه‌های جدید ({fa(report.totalNewCafes)})</summary><ul>{report.newCafes.map((cafe) => <li key={cafe.sourceId}><strong>{cafe.name}</strong> · {fa(cafe.sections ?? 0)} دسته · {fa(cafe.items ?? 0)} آیتم <span dir="ltr">{cafe.username}</span></li>)}</ul></details>}
            {report.newItems.length > 0 && <details className={styles.reportSection}><summary>آیتم‌های جدید ({fa(report.totalNewItems)})</summary><ul>{report.newItems.map((item) => <li key={`${item.sourceId}-${item.placeName}`}><strong>{item.name}</strong> · {item.placeName} / {item.sectionName || 'سایر'} · {item.price === null ? 'قیمت روز' : toman(item.price)}</li>)}</ul></details>}
            {(report.conflicts?.length ?? 0) > 0 && <details open className={styles.reportSection}><summary>تداخل‌های بازدارنده ({fa(report.totalConflicts)})</summary><ul>{report.conflicts.map((item) => <li key={`${item.sourceId}-${item.placeName}`}><strong>{item.name}</strong> · {item.placeName} — {item.reason}</li>)}</ul></details>}

            {topMenuSync.status === 'ready' && (
              <>
              <SyncCafePicker title="۲. تغییرات کدام کافه‌ها اعمال شوند؟" targets={topMenuSync.reportTargets ?? []}
                scope={applyScope} selected={applyIds} onScope={setApplyScope} onSelected={setApplyIds}
                disabled={syncPending || busy} allLabel="همهٔ کافه‌های همین گزارش" />
              {selectionError&&<p role="alert" className={styles.error}>{selectionError}</p>}
              {selectionReport&&<section className={styles.reportSection}><h3>فقط کافه‌های تیک‌خورده</h3><p>{fa(selectionReport.summary.sourceCafes)} کافه · {fa(selectionReport.summary.priceIncreases)} افزایش قیمت · {fa(selectionReport.summary.priceDecreases)} کاهش قیمت · {fa(selectionReport.summary.newItems)} آیتم جدید · {fa(selectionReport.summary.archivedItems)} آیتم آرشیوی</p>{selectionReport.limitations.map(text=><p key={text}>{text}</p>)}<a href={`/api/admin/topmenu-report?runId=${encodeURIComponent(topMenuSync.runId!)}&sourceIds=${applyIds.join(',')}`} download>دانلود جزئیات همین انتخاب</a></section>}
              <form className={styles.applyBox} onSubmit={(event) => {
                event.preventDefault()
                const confirm = new FormData(event.currentTarget).get('confirm')
                if (window.confirm(`${applyScope === 'all' ? 'همهٔ کافه‌های همین گزارش' : `${fa(applyIds.length)} کافهٔ تیک‌خورده`} همگام شوند؟ سایر کافه‌ها تغییر نمی‌کنند و قبلش بکاپ گرفته می‌شود.`)) {
                  void startSync('apply', typeof confirm === 'string' ? confirm.trim() : '')
                }
              }}>
                <p>فقط مجموعه‌های انتخاب‌شده همگام می‌شوند. کافهٔ جدید با منوی کامل ساخته می‌شود؛ موارد حذف‌شده از منبع در همان کافه آرشیو می‌شوند. آیتم‌های دستی دست‌نخورده می‌مانند. آمار بالا برای کل گزارش است، نه فقط انتخاب فعلی.</p>
                <input aria-label="عبارت تأیید همگام‌سازی" name="confirm" placeholder="همگام‌سازی کامل" required />
                <button type="submit" className={styles.runHeavy} disabled={syncPending || busy || (applyScope === 'selected' && !applyIds.length) || !topMenuSync.reportTargets?.length}>
                  {syncPending ? 'در حال ارسال…' : 'بکاپ و اعمال تغییرات انتخاب‌شده'}
                </button>
              </form>
              </>
            )}
            {topMenuSync.applied && <p className={styles.success}>{fa(topMenuSync.applied.createdCafes)} کافه و {fa(topMenuSync.applied.insertedItems)} آیتم ساخته شد؛ {fa(topMenuSync.applied.updatedItems)} آیتم به‌روز، {fa(topMenuSync.applied.movedItems)} آیتم منتقل و {fa(topMenuSync.applied.archivedItems)} آیتم آرشیو شد. مجموعاً {fa(topMenuSync.applied.affectedCafes)} مجموعه همگام شد.</p>}
          </div>
        )}
      </section>

      <section className={styles.manual}><h3>گزارش کامل و تاریخچه اسکرپ</h3>{topMenuSync.runId&&report&&<a className={styles.refresh} href={`/api/admin/topmenu-report?runId=${encodeURIComponent(topMenuSync.runId)}`} download>دانلود گزارش کامل (بدون محدودیت نمونه)</a>}<ul>{jobs.map(job=><li key={job.runId}><span dir="ltr">{job.runId}</span> · {SYNC_STATUS[job.status]??'اجرای قدیمی — وضعیت نهایی ثبت نشده'} {job.changes!==null&&` · ${fa(job.changes)} تغییر`} {job.hasReport&&<a href={`/api/admin/topmenu-report?runId=${encodeURIComponent(job.runId)}`} download>دانلود گزارش این اجرا</a>}</li>)}</ul></section>
      <ul className={styles.list}>
        {OPERATIONS.map((operation) => (
          <li key={operation.id} className={styles.card}>
            <div className={styles.cardBody}>
              <h3 className={styles.cardTitle}>{operation.title}</h3>
              <p className={styles.cardDesc}>{operation.description}</p>
            </div>
            <ManagedForm action={action} className={styles.cardForm}>
              <input type="hidden" name="operation" value={operation.id} />
              <RunButton label={operation.action} heavy={operation.heavy} />
            </ManagedForm>
          </li>
        ))}
      </ul>

      <section className={styles.manual}>
        <h3 className={styles.manualTitle}>کارهایی که از ترمینال اجرا می‌شوند</h3>
        <p className={styles.manualNote}>
          این‌ها دکمه ندارند چون یا داده را بازنویسی می‌کنند یا چند دقیقه طول می‌کشند — و
          یک درخواست وب برای هیچ‌کدام جای درستی نیست.
        </p>
        <dl className={styles.manualList}>
          {MANUAL.map((item) => (
            <div key={item.command}>
              <dt dir="ltr">
                <code>{item.command}</code>
              </dt>
              <dd>{item.what}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}

export default OperationsPanel
