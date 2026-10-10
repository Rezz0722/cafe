'use client'

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { MESSAGE_LIMIT, ROADMAP_LIMIT } from '@/core/autonomy/consolePolicy'
import styles from './AutonomyConsole.module.css'

type Task = { id: string; phase?: string; status: string; verifiedAt?: string | null; pr?: string | null }
type Snapshot = { updatedAt?: string; paused?: boolean; lastReason?: string | null; engineering?: Task[]; research?: Task[]; ownerMessage?: { status: string; reason?: string | null; retryAt?: number | null }; ownerWork?: { status: string; reason?: string | null; retryAt?: number | null; taskId?: string | null }; ownerRoadmap?: { status: string; reason?: string | null; retryAt?: number | null }; runnerHealth?: { status: string; busy?: boolean; observedAt?: string } }
type Event = { id: string; at: string; type: string; task?: string | null; status?: string | null; role?: string | null }
type Message = { id: string; text: string; kind: 'question' | 'work' | 'roadmap'; createdAt: string; answer: string | null; answeredAt: string | null; workStatus: string | null; taskId: string | null; roadmapStatus: string | null; roadmapPhases: Array<{ title: string; goal: string; decision: string; status: string; reason: string; taskId: string | null }>; sourceRoadmapId: string | null }
type ConsoleData = { snapshot: Snapshot; activity: { events?: Event[] }; messages: Message[]; fetchedAt: string }

const fa = new Intl.NumberFormat('fa-IR')
const dateFormatter = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' })
const taskLabels: Record<string, string> = { 'search-sort': 'اصلاح ترتیب جست‌وجو', 'source-exclusions': 'جلوگیری از بازگشت مجموعه‌های خدماتی', 'review-a': 'پژوهش ۱', 'review-b': 'پژوهش ۲', 'review-c': 'پژوهش ۳', 'review-d': 'پژوهش ۴' }
const taskName = (id: string) => taskLabels[id] || (id.startsWith('owner-') ? 'درخواست توسعهٔ مدیر' : id)
const statusLabels: Record<string, string> = { completed: 'منتشر و تأیید شده', planning: 'در حال برنامه‌ریزی', writing: 'در حال کدنویسی', reviewing: 'در حال بازبینی', 'awaiting-ci': 'منتظر CI', 'awaiting-deploy': 'منتظر انتشار', researching: 'در حال تحقیق', 'needs-evidence': 'نیازمند شاهد معتبر', 'needs-decision': 'نیازمند تصمیم جداگانه', pending: 'در صف', submitted: 'درخواست کوچک ثبت شد', 'in-progress': 'در حال پیگیری', blocked: 'مسدود', retry: 'تلاش دوباره', queued: 'به صف اضافه شد', 'needs-data': 'نیازمند داده', 'research-needed': 'نیازمند تحقیق', unsafe: 'خارج از محدودهٔ خودکار', 'needs-operator': 'نیازمند بررسی اپراتور', 'needs-review': 'نیازمند بازبینی' }

function at(value?: string | null) {
  const parsed = value ? new Date(value) : null
  return parsed && Number.isFinite(parsed.getTime()) ? `${dateFormatter.format(parsed)} تهران` : 'ثبت نشده'
}
function eventText(event: Event) {
  if (event.type === 'cycle-start') return 'نوبت زمان‌بندی‌شدهٔ ناظر شروع شد'
  if (event.type === 'cycle-end') return 'نوبت ناظر پایان یافت؛ لزوماً تغییری در سایت ایجاد نشده'
  if (event.type === 'engineering-empty') return 'کار کدنویسیِ باز در صف مصوب باقی نمانده'
  if (event.type === 'research-empty') return 'پژوهشِ قابل اقدام باقی نمانده؛ شواهد تازه لازم است'
  if (event.type === 'engineering-stage' || event.type === 'research-stage') return `${taskName(event.task || 'کار')}: ${statusLabels[event.status || ''] || event.status || 'وضعیت نامشخص'}`
  if (event.type === 'model-start') return `عامل ${event.role || 'نامشخص'} شروع کرد`
  if (event.type === 'model-end') return `اجرای عامل ${event.role || 'نامشخص'} پایان یافت؛ نتیجه را در وضعیت کار ببینید`
  if (event.type === 'model-progress') {
    const progress: Record<string, string> = { 'turn-started': 'نوبت مدل آغاز شد', 'analyzing-started': 'در حال تحلیل', 'analyzing-completed': 'تحلیل مرحله‌ای تمام شد', 'searching-started': 'در حال جست‌وجوی منبع', 'searching-completed': 'جست‌وجوی مرحله‌ای تمام شد', 'preparing-output-started': 'در حال آماده‌کردن خروجی', 'preparing-output-completed': 'خروجی مرحله‌ای آماده شد', 'turn-completed': 'پاسخ مدل آماده شد', 'turn-failed': 'نوبت مدل ناموفق بود' }
    return `${event.role || 'عامل'}: ${progress[event.status || ''] || 'پیشرفت داخلی ثبت شد'}`
  }
  if (event.type === 'message-received') return 'ناظر پیام مدیر را دریافت کرد'
  if (event.type === 'message-answer') return 'پاسخ پیام مدیر ثبت شد'
  if (event.type === 'message-deferred') return 'پاسخ پیام مدیر به تعویق افتاد'
  if (event.type === 'work-deferred') return 'برنامه‌ریزی درخواست توسعه به تعویق افتاد'
  if (event.type === 'work-stage') return `درخواست توسعه: ${statusLabels[event.status || ''] || event.status || 'وضعیت نامشخص'}`
  if (event.type === 'roadmap-stage') return `نقشهٔ راه: ${statusLabels[event.status || ''] || event.status || 'وضعیت نامشخص'}`
  if (event.type === 'roadmap-deferred') return 'برنامه‌ریزی نقشهٔ راه به تعویق افتاد'
  return 'رویداد ثبت‌شده با نوع نامشخص'
}

export function AutonomyConsole() {
  const [data, setData] = useState<ConsoleData | null>(null)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [messageKind, setMessageKind] = useState<'question' | 'work' | 'roadmap'>('question')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')
  const [sendError, setSendError] = useState(false)
  const busy = useRef(false)
  const refresh = useCallback(async () => {
    if (busy.current || document.hidden) return
    busy.current = true
    try {
      const response = await fetch('/api/admin/autonomy', { cache: 'no-store', signal: AbortSignal.timeout(10000) })
      const result = await response.json() as ConsoleData & { error?: string }
      if (!response.ok) throw new Error(result.error || 'وضعیت در دسترس نیست.')
      setData(result)
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'دریافت وضعیت ناموفق بود.') }
    finally { busy.current = false }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 15000)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [refresh])

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending) return
    setSending(true); setNotice(''); setSendError(false)
    try {
      const response = await fetch('/api/admin/autonomy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, kind: messageKind }) })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'پیام ثبت نشد.')
      setText('')
      setNotice(messageKind === 'roadmap' ? 'نقشهٔ راه ثبت شد. برنامه‌ریزی و بازبینی آن در نوبت بعدی انجام می‌شود؛ ثبت درخواست به معنی شروع اجرای فازها نیست.' : messageKind === 'work' ? 'درخواست ثبت شد. برنامه‌ریز در نوبت بعدی محدوده و ریسک آن را بررسی می‌کند؛ ثبت درخواست به معنی شروع کدنویسی نیست.' : 'پیام ثبت شد. پاسخ پس از نوبت بعدی ناظر و در صورت دسترسی مدل همین‌جا نمایش داده می‌شود.')
      await refresh()
    } catch (reason) { setSendError(true); setNotice(reason instanceof Error ? reason.message : 'ثبت پیام ناموفق بود.') }
    finally { setSending(false) }
  }

  async function readRoadmapFile(file: File | undefined) {
    if (!file) return
    if (!/\.(?:md|txt)$/i.test(file.name) || file.size > 48000) {
      setSendError(true); setNotice('فقط فایل Markdown یا TXT تا ۴۸ کیلوبایت پذیرفته می‌شود.'); return
    }
    try {
      const content = await file.text()
      if (content.length > ROADMAP_LIMIT) throw new Error('متن فایل از سقف ۱۲هزار نویسه بیشتر است.')
      setText(content); setSendError(false); setNotice('متن فایل در کادر قرار گرفت؛ پیش از ثبت آن را مرور کنید.')
    } catch (reason) { setSendError(true); setNotice(reason instanceof Error ? reason.message : 'خواندن فایل ممکن نشد.') }
  }

  const snapshot = data?.snapshot
  const engineering = Array.isArray(snapshot?.engineering) ? snapshot.engineering : []
  const completed = engineering.filter(task => task.status === 'completed').length
  const allDone = engineering.length > 0 && completed === engineering.length
  const active = engineering.find(task => !['completed', 'pending', 'blocked', 'conflict', 'deployment-failed'].includes(task.status))
  const events = Array.isArray(data?.activity?.events) ? data.activity.events.slice(-25).reverse() : []
  const latestEventAt = events.length ? Date.parse(events[0].at) : NaN
  const activityDelayed = !Number.isFinite(latestEventAt) || Date.now() - latestEventAt > 15 * 60 * 1000
  const messageWait = snapshot?.ownerMessage
  const workWait = snapshot?.ownerWork
  const roadmapWait = snapshot?.ownerRoadmap
  const textLimit = messageKind === 'roadmap' ? ROADMAP_LIMIT : MESSAGE_LIMIT

  return <main className={styles.wrap} dir="rtl">
    <header className={styles.head}>
      <div><p className={styles.eyebrow}>کو کافه / فقط مدیر</p><h1>کنسول زندهٔ ناظر توسعه</h1><p className={styles.lede}>وضعیت واقعی اجرا، رویدادهای ثبت‌شده و گفت‌وگو با ناظر؛ بدون ادعای پیشرفتِ ساختگی.</p></div>
      <div className={styles.actions}><Link href="/admin">بازگشت به پنل</Link><button type="button" onClick={() => void refresh()}>تازه‌سازی</button></div>
    </header>
    {error && <p className={styles.error} role="alert">{error} {data && 'آخرین دادهٔ موفق در پایین حفظ شده است.'}</p>}
    <section className={styles.statusCard} aria-labelledby="now-heading">
      <div className={styles.sectionHead}><h2 id="now-heading">الان چه خبر است؟</h2><span>آخرین ثبت: {at(snapshot?.updatedAt)}</span></div>
      {!data ? <p role="status">در حال دریافت دادهٔ واقعی ناظر…</p> : <>
        <p className={activityDelayed ? styles.delayed : styles.fresh} role="status">{activityDelayed ? 'رویداد تازه‌ای در ۱۵ دقیقهٔ اخیر ثبت نشده؛ اجرای فعلی قابل تأیید نیست.' : `آخرین رویداد سرویس: ${at(events[0]?.at)}. این فقط تازگی گزارش را نشان می‌دهد، نه سلامت قطعی تایمر.`}</p>
        <p className={styles.primaryStatus}>{snapshot?.paused ? 'ناظر متوقف شده است' : active ? `${taskName(active.id)} — ${statusLabels[active.status] || active.status}` : allDone ? 'اکنون کار کدنویسی در جریان نیست؛ صف مصوب فعلی تمام شده است' : 'در این ثبت کار کدنویسی فعالی دیده نمی‌شود'}</p>
        <p className={styles.explain}>{allDone ? `${fa.format(completed)} کار از ${fa.format(engineering.length)} کار کدنویسیِ مصوب منتشر و تأیید شده‌اند. این پایان کل پروژه نیست.` : `کدنویسی تکمیل‌شده: ${fa.format(completed)} از ${fa.format(engineering.length)}.`}</p>
        <p className={styles.explain}>پژوهش و پایلوت هنوز تکمیل نشده‌اند. پژوهشِ بی‌شاهد به‌عنوان نتیجهٔ معتبر یا تغییر سایت حساب نمی‌شود.</p>
        {snapshot?.lastReason && <p className={styles.reason}>دلیل ثبت‌شدهٔ آخرین توقف/انتظار: <code dir="ltr">{snapshot.lastReason}</code></p>}
        {snapshot?.runnerHealth && <p className={snapshot.runnerHealth.status === 'online' ? styles.fresh : styles.delayed}>Runner انتشار GitHub: {snapshot.runnerHealth.status === 'online' ? snapshot.runnerHealth.busy ? 'آنلاین و مشغول' : 'آنلاین و آماده' : snapshot.runnerHealth.status === 'offline' ? 'آفلاین؛ CI/انتشار منتظر می‌ماند' : 'وضعیت قابل‌تأیید نیست'} · بررسی: {at(snapshot.runnerHealth.observedAt)}</p>}
        {workWait?.status === 'deferred' && <p className={styles.delayed}>برنامه‌ریزی درخواست توسعه فعلاً به تعویق افتاده است{workWait.retryAt ? `؛ زودتر از ${at(new Date(workWait.retryAt).toISOString())} مجاز نیست` : ''}. درخواست محفوظ می‌ماند و اجرای کد هنوز شروع نشده است.</p>}
        {roadmapWait?.status === 'deferred' && <p className={styles.delayed}>برنامه‌ریزی نقشهٔ راه به تعویق افتاده است{roadmapWait.retryAt ? `؛ زودتر از ${at(new Date(roadmapWait.retryAt).toISOString())} مجاز نیست` : ''}. متن محفوظ است و اجرای کد هنوز شروع نشده است.</p>}
        {roadmapWait?.status && !['idle', 'deferred'].includes(roadmapWait.status) && <p className={styles.explain}>آخرین وضعیت نقشهٔ راه: {statusLabels[roadmapWait.status] || roadmapWait.status}؛ جزئیات هر فاز در پیام ثبت‌شدهٔ پایین دیده می‌شود.</p>}
      </>}
    </section>
    <div className={styles.columns}>
      <section className={styles.card} aria-labelledby="log-heading">
        <div className={styles.sectionHead}><h2 id="log-heading">لاگ واقعی اجرا</h2><span>آخرین {fa.format(events.length)} رویداد · بررسی هر ۱۵ ثانیه</span></div>
        <p className={styles.hint}>هر سطر را خود سرویس هنگام وقوع ثبت کرده است؛ پایان یک نوبت به معنی تغییر کد یا انتشار نیست.</p>
        <ol className={styles.timeline}>{events.length ? events.map(item => <li key={item.id}><span>{eventText(item)}</span><time dateTime={item.at}>{at(item.at)}</time></li>) : <li>هنوز رویدادی ثبت نشده است؛ نتیجهٔ قدیمی را به‌جای لاگ زنده نشان نمی‌دهیم.</li>}</ol>
      </section>
      <section className={styles.card} aria-labelledby="chat-heading">
        <div className={styles.sectionHead}><h2 id="chat-heading">پیام به ناظر</h2><span>فقط برای مدیر واردشده</span></div>
        <p className={styles.hint} id="chat-help">«سؤال» فقط پاسخ می‌گیرد. «درخواست توسعه» برای یک تغییر کوچک محصول است. «نقشهٔ راه» متن بلند را به فازهای قابل‌پیگیری تقسیم می‌کند و تنها فاز کم‌ریسک را پس از بازبینی، یکی‌یکی به مسیر توسعه می‌فرستد. حذف کافه و تغییر دادهٔ واقعی از این مسیر اجرا نمی‌شود.</p>
        {messageWait?.status === 'deferred' && <p className={styles.delayed} role="status">{messageWait.reason === 'quota-reserve' && messageWait.retryAt ? `پاسخ در انتظار ذخیرهٔ سهمیهٔ مدل است؛ زودتر از ${at(new Date(messageWait.retryAt).toISOString())} ممکن نیست. این زمان، قول پاسخ قطعی نیست.` : 'پاسخ‌گویی فعلاً به تعویق افتاده است؛ زمان قطعی ثبت نشده.'}</p>}
        <form onSubmit={send} className={styles.form} aria-busy={sending}>
          <label htmlFor="owner-message-kind">نوع پیام</label>
          <select id="owner-message-kind" value={messageKind} onChange={event => { setMessageKind(event.target.value as 'question' | 'work' | 'roadmap'); setText(''); setNotice(''); setSendError(false) }}>
            <option value="question">سؤال از ناظر</option>
            <option value="work">درخواست توسعهٔ محصول</option>
            <option value="roadmap">ثبت نقشهٔ راه چندفازی</option>
          </select>
          {messageKind === 'roadmap' && <>
            <label htmlFor="owner-roadmap-file">یا فایل Markdown / TXT را وارد کنید</label>
            <input id="owner-roadmap-file" className={styles.fileInput} type="file" accept=".md,.txt,text/markdown,text/plain" aria-describedby="chat-help" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void readRoadmapFile(file) }} />
          </>}
          <label htmlFor="owner-message">پیام شما</label>
          <textarea id="owner-message" value={text} onChange={event => setText(event.target.value)} maxLength={textLimit} minLength={2} required rows={messageKind === 'roadmap' ? 10 : 4} aria-describedby="chat-help chat-count chat-feedback" aria-invalid={sendError} placeholder={messageKind === 'roadmap' ? 'فازها، هدف، معیار پذیرش و محدودیت‌های اجرایی را اینجا وارد کنید…' : 'الان دقیقاً چه کاری مانده و چرا شروع نشده؟'} />
          <span id="chat-count" className={styles.counter}>{fa.format(text.length)} / {fa.format(textLimit)} نویسه</span>
          <button type="submit" disabled={sending || text.trim().length < 2}>{sending ? 'در حال ثبت…' : 'ارسال پیام'}</button>
          <p id="chat-feedback" role={sendError ? 'alert' : 'status'}>{notice || 'ثبت نقشهٔ راه با آغاز اجرا تفاوت دارد؛ وضعیت هر مرحله جدا نمایش داده می‌شود.'}</p>
        </form>
        <ol className={styles.messages}>{data?.messages.length ? data.messages.map(message => {
          const linkedTask = engineering.find(task => task.id === message.taskId)
          return <li key={message.id}>
            {message.kind === 'roadmap'
              ? <details className={styles.roadmapText}><summary>نقشهٔ راه ثبت‌شده · نمایش متن کامل</summary><p>{message.text}</p></details>
              : <p className={styles.question}>{message.sourceRoadmapId ? 'کارِ استخراج‌شده از نقشهٔ راه · ' : message.kind === 'work' ? 'درخواست توسعه · ' : 'سؤال · '}{message.text}</p>}
            <time dateTime={message.createdAt}>{at(message.createdAt)}</time>
            <p className={message.answer ? styles.answer : styles.pending}>{message.answer || (message.kind === 'roadmap' ? 'در صف برنامه‌ریزی نقشهٔ راه؛ هنوز فاز اجرایی تأیید نشده است.' : message.kind === 'work' ? 'در صف برنامه‌ریزی؛ هنوز تسک اجرایی ثبت نشده است.' : 'در صف پاسخ؛ هنوز جوابی ثبت نشده است.')}</p>
            {message.roadmapStatus && <p className={styles.workState}>وضعیت نقشهٔ راه: {statusLabels[message.roadmapStatus] || message.roadmapStatus}</p>}
            {message.roadmapPhases.length > 0 && <ol className={styles.phaseList}>{message.roadmapPhases.map((phase, index) => {
              const phaseTask = engineering.find(task => task.id === phase.taskId)
              return <li key={index}><strong>{phase.title}</strong><span>{statusLabels[phase.status] || phase.status}</span><p>{phase.goal}</p>{phase.reason && <small>{phase.reason}</small>}{phase.taskId && <small>شناسهٔ کار: <code dir="ltr">{phase.taskId}</code></small>}{phaseTask?.pr && /^https:\/\/github\.com\/Rezz0722\/cafe\/pull\/\d+$/.test(phaseTask.pr) && <a href={phaseTask.pr} target="_blank" rel="noopener noreferrer">مشاهدهٔ PR این فاز</a>}</li>
            })}</ol>}
            {message.workStatus && <p className={styles.workState}>وضعیت درخواست: {message.workStatus === 'queued' ? 'طرح محدود به صف اضافه شد' : message.workStatus === 'needs-data' ? 'نیازمند دادهٔ بیشتر' : message.workStatus === 'research-needed' ? 'نیازمند تحقیق با شاهد' : message.workStatus === 'unsafe' ? 'خارج از محدودهٔ اجرای خودکار' : 'نیازمند بررسی اپراتور'}</p>}
            {linkedTask && <p className={styles.workState}>وضعیت اجرای تسک: {statusLabels[linkedTask.status] || linkedTask.status}{linkedTask.pr && /^https:\/\/github\.com\/Rezz0722\/cafe\/pull\/\d+$/.test(linkedTask.pr) && <> · <a href={linkedTask.pr} target="_blank" rel="noopener noreferrer">مشاهدهٔ PR</a></>}</p>}
            {message.answeredAt && <time dateTime={message.answeredAt}>پاسخ: {at(message.answeredAt)}</time>}
          </li>
        }) : <li className={styles.hint}>هنوز پیامی ثبت نشده است.</li>}</ol>
      </section>
    </div>
    <p className={styles.footnote}>این کنسول سلامت تایمر را صرفاً از روی رسیدن رویدادهای تازه نشان می‌دهد؛ دسترسی به دادهٔ خصوصی، مجوز اجرای خودکار عملیات پرریسک نیست.</p>
  </main>
}
