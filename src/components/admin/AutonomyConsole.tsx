'use client'

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import styles from './AutonomyConsole.module.css'

type Task = { id: string; phase?: string; status: string; verifiedAt?: string | null; pr?: string | null }
type Snapshot = { updatedAt?: string; paused?: boolean; lastReason?: string | null; engineering?: Task[]; research?: Task[]; ownerMessage?: { status: string; reason?: string | null; retryAt?: number | null } }
type Event = { id: string; at: string; type: string; task?: string | null; status?: string | null; role?: string | null }
type Message = { id: string; text: string; createdAt: string; answer: string | null; answeredAt: string | null }
type ConsoleData = { snapshot: Snapshot; activity: { events?: Event[] }; messages: Message[]; fetchedAt: string }

const fa = new Intl.NumberFormat('fa-IR')
const dateFormatter = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' })
const taskLabels: Record<string, string> = { 'search-sort': 'اصلاح ترتیب جست‌وجو', 'source-exclusions': 'جلوگیری از بازگشت مجموعه‌های خدماتی', 'review-a': 'پژوهش ۱', 'review-b': 'پژوهش ۲', 'review-c': 'پژوهش ۳', 'review-d': 'پژوهش ۴' }
const statusLabels: Record<string, string> = { completed: 'منتشر و تأیید شده', planning: 'در حال برنامه‌ریزی', writing: 'در حال کدنویسی', reviewing: 'در حال بازبینی', 'awaiting-ci': 'منتظر CI', 'awaiting-deploy': 'منتظر انتشار', researching: 'در حال تحقیق', 'needs-evidence': 'نیازمند شاهد معتبر', pending: 'در صف', blocked: 'مسدود', retry: 'تلاش دوباره' }

function at(value?: string | null) {
  const parsed = value ? new Date(value) : null
  return parsed && Number.isFinite(parsed.getTime()) ? `${dateFormatter.format(parsed)} تهران` : 'ثبت نشده'
}
function eventText(event: Event) {
  if (event.type === 'cycle-start') return 'نوبت زمان‌بندی‌شدهٔ ناظر شروع شد'
  if (event.type === 'cycle-end') return 'نوبت ناظر پایان یافت؛ لزوماً تغییری در سایت ایجاد نشده'
  if (event.type === 'engineering-empty') return 'کار کدنویسیِ باز در صف مصوب باقی نمانده'
  if (event.type === 'research-empty') return 'پژوهشِ قابل اقدام باقی نمانده؛ شواهد تازه لازم است'
  if (event.type === 'engineering-stage' || event.type === 'research-stage') return `${taskLabels[event.task || ''] || event.task || 'کار'}: ${statusLabels[event.status || ''] || event.status || 'وضعیت نامشخص'}`
  if (event.type === 'model-start') return `عامل ${event.role || 'نامشخص'} شروع کرد`
  if (event.type === 'model-end') return `اجرای عامل ${event.role || 'نامشخص'} پایان یافت؛ نتیجه را در وضعیت کار ببینید`
  if (event.type === 'model-progress') {
    const progress: Record<string, string> = { 'turn-started': 'نوبت مدل آغاز شد', 'analyzing-started': 'در حال تحلیل', 'analyzing-completed': 'تحلیل مرحله‌ای تمام شد', 'searching-started': 'در حال جست‌وجوی منبع', 'searching-completed': 'جست‌وجوی مرحله‌ای تمام شد', 'preparing-output-started': 'در حال آماده‌کردن خروجی', 'preparing-output-completed': 'خروجی مرحله‌ای آماده شد', 'turn-completed': 'پاسخ مدل آماده شد', 'turn-failed': 'نوبت مدل ناموفق بود' }
    return `${event.role || 'عامل'}: ${progress[event.status || ''] || 'پیشرفت داخلی ثبت شد'}`
  }
  if (event.type === 'message-received') return 'ناظر پیام مدیر را دریافت کرد'
  if (event.type === 'message-answer') return 'پاسخ پیام مدیر ثبت شد'
  if (event.type === 'message-deferred') return 'پاسخ پیام مدیر به تعویق افتاد'
  return 'رویداد ثبت‌شده با نوع نامشخص'
}

export function AutonomyConsole() {
  const [data, setData] = useState<ConsoleData | null>(null)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')
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
    setSending(true); setNotice('')
    try {
      const response = await fetch('/api/admin/autonomy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'پیام ثبت نشد.')
      setText('')
      setNotice('پیام ثبت شد. پاسخ پس از نوبت بعدی ناظر و در صورت دسترسی مدل همین‌جا نمایش داده می‌شود.')
      await refresh()
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'ثبت پیام ناموفق بود.') }
    finally { setSending(false) }
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
        <p className={styles.primaryStatus}>{snapshot?.paused ? 'ناظر متوقف شده است' : active ? `${taskLabels[active.id] || active.id} — ${statusLabels[active.status] || active.status}` : allDone ? 'اکنون کار کدنویسی در جریان نیست؛ صف مصوب فعلی تمام شده است' : 'در این ثبت کار کدنویسی فعالی دیده نمی‌شود'}</p>
        <p className={styles.explain}>{allDone ? `${fa.format(completed)} کار از ${fa.format(engineering.length)} کار کدنویسیِ مصوب منتشر و تأیید شده‌اند. این پایان کل پروژه نیست.` : `کدنویسی تکمیل‌شده: ${fa.format(completed)} از ${fa.format(engineering.length)}.`}</p>
        <p className={styles.explain}>پژوهش و پایلوت هنوز تکمیل نشده‌اند. پژوهشِ بی‌شاهد به‌عنوان نتیجهٔ معتبر یا تغییر سایت حساب نمی‌شود.</p>
        {snapshot?.lastReason && <p className={styles.reason}>دلیل ثبت‌شدهٔ آخرین توقف/انتظار: <code dir="ltr">{snapshot.lastReason}</code></p>}
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
        <p className={styles.hint} id="chat-help">سؤال یا درخواستت را بنویس. پیام ثبت می‌شود و ناظر در نوبت بعدی، اگر دسترسی مدل برقرار باشد، پاسخ می‌دهد. درخواست جدید به‌تنهایی مجوز اجرای تغییر حساس یا گسترش صف کدنویسی نیست.</p>
        {messageWait?.status === 'deferred' && <p className={styles.delayed} role="status">{messageWait.reason === 'quota-reserve' && messageWait.retryAt ? `پاسخ در انتظار ذخیرهٔ سهمیهٔ مدل است؛ زودتر از ${at(new Date(messageWait.retryAt).toISOString())} ممکن نیست. این زمان، قول پاسخ قطعی نیست.` : 'پاسخ‌گویی فعلاً به تعویق افتاده است؛ زمان قطعی ثبت نشده.'}</p>}
        <form onSubmit={send} className={styles.form}>
          <label htmlFor="owner-message">پیام شما</label>
          <textarea id="owner-message" value={text} onChange={event => setText(event.target.value)} maxLength={2000} minLength={2} required rows={4} aria-describedby="chat-help chat-feedback" placeholder="الان دقیقاً چه کاری مانده و چرا شروع نشده؟" />
          <button type="submit" disabled={sending || text.trim().length < 2}>{sending ? 'در حال ثبت…' : 'ارسال پیام'}</button>
          <p id="chat-feedback" role="status">{notice || 'پاسخِ تأییدنشده یا ساختگی نمایش داده نمی‌شود.'}</p>
        </form>
        <ol className={styles.messages}>{data?.messages.length ? data.messages.map(message => <li key={message.id}><p className={styles.question}>{message.text}</p><time dateTime={message.createdAt}>{at(message.createdAt)}</time><p className={message.answer ? styles.answer : styles.pending}>{message.answer || 'در صف پاسخ؛ هنوز جوابی ثبت نشده است.'}</p>{message.answeredAt && <time dateTime={message.answeredAt}>پاسخ: {at(message.answeredAt)}</time>}</li>) : <li className={styles.hint}>هنوز پیامی ثبت نشده است.</li>}</ol>
      </section>
    </div>
    <p className={styles.footnote}>این کنسول سلامت تایمر را صرفاً از روی رسیدن رویدادهای تازه نشان می‌دهد؛ دسترسی به دادهٔ خصوصی، مجوز اجرای خودکار عملیات پرریسک نیست.</p>
  </main>
}
