'use client'

import { startTransition, useActionState, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Search, Star, X } from 'lucide-react'
import { submitReviewAction } from '@/app/profile/actions'
import { EMPTY_ACTION_STATE, type ActionState } from '@/app/profile/state'
import { formatVisitDate, parseVisitDate } from '@/core/date/persian'
import { normalizeFa } from '@/core/text/normalize'
import { CafePopover } from './CafePopover'
import styles from './ReviewForm.module.css'

const ASPECTS = [
  { name: 'ratingCoffee', label: 'قهوه' }, { name: 'ratingFood', label: 'غذا' },
  { name: 'ratingVibe', label: 'حال‌وهوا' }, { name: 'ratingService', label: 'برخورد و سرویس' },
  { name: 'ratingValue', label: 'ارزش خرید' },
] as const
const RATINGS = ['انتخاب کن', 'ضعیف', 'می‌توانست بهتر باشد', 'معمولی', 'خوب', 'عالی']
const STEP_LABELS = ['تجربه‌ات', 'سفارش‌ها', 'تاریخ و جزئیات']

async function saveReview(previous: ActionState, data: FormData): Promise<ActionState> {
  try { return await submitReviewAction(previous, data) }
  catch {
    // A lost response does not prove that the database write failed. Never
    // auto-retry a new visit and risk publishing the same experience twice.
    return { ok: false, error: 'نتیجهٔ ثبت نظر دریافت نشد. پیش از تلاش دوباره، فهرست نظرهای خودت را بررسی کن.' }
  }
}

interface Props {
  placeId: number; slug: string; placeName: string; signedIn: boolean; authHref: string
  existing: { id?: number; stars: number; text: string | null; status: string; visitDate: Date | null; itemIds?: number[]; videoUrl?: string | null; ratingCoffee?: number | null; ratingFood?: number | null; ratingVibe?: number | null; ratingService?: number | null; ratingValue?: number | null } | null
  menuItems?: { id: number; name: string; nameEn: string | null; sectionId: number; sectionName: string; dishName: string | null; available: boolean }[]
  minTextLength?: number; maxTextLength?: number; isBlogger?: boolean
}

function StarInput({ name, label, value, onChange, disabled }: {
  name: string; label: string; value: number; onChange: (value: number) => void; disabled?: boolean
}) {
  const id = useId()
  return <span className={styles.starGroup} role="radiogroup" aria-label={label}>
    {[1, 2, 3, 4, 5].map(star => <label key={star} className={styles.starLabel}>
      <input type="radio" name={name} id={`${id}-${star}`} value={star} checked={value === star}
        onChange={() => onChange(star)} disabled={disabled} className={styles.starInput}
        aria-label={`${star} ستاره؛ ${RATINGS[star]}`} />
      <span className={star <= value ? styles.starOn : styles.starOff}><Star size={29} fill={star <= value ? 'currentColor' : 'none'} /></span>
    </label>)}
  </span>
}

function ReviewWizard({ props, onSuccess, onConfirm }: { props: Props; onSuccess: (message: string) => void; onConfirm: () => void }) {
  const { placeId, slug, placeName, existing, menuItems = [], minTextLength = 0, maxTextLength = 4000, isBlogger = false } = props
  const [state, action, pending] = useActionState(saveReview, EMPTY_ACTION_STATE)
  const [stars, setStars] = useState(existing?.stars ?? 0)
  const [aspects, setAspects] = useState<Record<string, number>>(() => Object.fromEntries(ASPECTS.map(aspect => [aspect.name, existing?.[aspect.name] ?? 0])))
  const [selectedItems, setSelectedItems] = useState<number[]>(existing?.itemIds ?? [])
  const [menuQuery, setMenuQuery] = useState('')
  const [limit, setLimit] = useState(30)
  const [step, setStep] = useState(0)
  const [visitDate, setVisitDate] = useState(formatVisitDate(existing?.visitDate))
  const [text, setText] = useState(existing?.text ?? '')
  const [error, setError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const submitting = useRef(false)
  useEffect(() => { if (!pending) submitting.current = false }, [pending, state])
  const [moved, setMoved] = useState(false)
  const confirmation = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!state.ok) return
    onSuccess(state.message ?? 'نظرت ثبت شد.')
    confirmation.current?.focus({ preventScroll: true })
  }, [state.ok, state.message, onSuccess])
  const visibleMenuItems = useMemo(() => {
    const words = normalizeFa(menuQuery).trim().split(/\s+/).filter(Boolean)
    return menuItems.filter(item => {
      const haystack = normalizeFa([item.name, item.nameEn, item.dishName, item.sectionName].filter(Boolean).join(' '))
      return words.every(word => haystack.includes(word))
    })
  }, [menuItems, menuQuery])
  const selected = useMemo(() => menuItems.filter(item => selectedItems.includes(item.id)), [menuItems, selectedItems])
  useEffect(() => { if (moved) heading.current?.focus({ preventScroll: true }) }, [step, moved])
  const go = (next: number) => {
    if (pending) return
    if (next > 0 && !stars) { setError('اول امتیاز تجربه‌ات را انتخاب کن.'); return }
    setError(''); setMoved(true); setStep(next)
    const dialog = form.current?.closest('dialog')
    if (dialog) dialog.scrollTop = 0
  }
  const toggle = (id: number) => setSelectedItems(current => {
    if (current.includes(id)) return current.filter(value => value !== id)
    if (current.length >= 20) { setError('برای هر مراجعه، حداکثر ۲۰ سفارش انتخاب کن.'); return current }
    return [...current, id]
  })
  const valid = () => {
    if (!stars) { setStep(0); setError('امتیاز کلی را انتخاب کن.'); return false }
    if (visitDate.trim() && !parseVisitDate(visitDate)) { setError('تاریخ شمسی معتبر وارد کن؛ مثلاً ۱۴۰۵/۰۶/۲۱.'); return false }
    if (text.trim().length < minTextLength) { setError(`برای ثبت نظر، دست‌کم ${minTextLength} کاراکتر بنویس.`); return false }
    return true
  }

  if (state.ok) return <div className={styles.done} role="status" aria-live="polite">
    <CheckCircle2 size={52} /><h3>تجربه‌ات ثبت شد</h3><p>{state.message}</p>
    <button ref={confirmation} className={styles.submit} type="button" onClick={onConfirm}>تأیید و بستن</button>
  </div>

  // Dispatch explicitly: React's form-action reset treats a returned validation
  // error as fulfilled and can clear native radio/checkbox selections on retry.
  return <form ref={form} className={styles.form} noValidate
    onSubmit={event => {
      event.preventDefault()
      if (pending || submitting.current) return
      if (step < 2) { go(step + 1); return }
      if (!valid() || !event.currentTarget.reportValidity()) return
      const data = new FormData(event.currentTarget)
      submitting.current = true
      startTransition(() => action(data))
    }}
    onKeyDown={event => { if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type !== 'radio' && event.target.type !== 'checkbox') event.preventDefault() }}>
    <input type="hidden" name="placeId" value={placeId} /><input type="hidden" name="slug" value={slug} />
    {existing?.id && <input type="hidden" name="reviewId" value={existing.id} />}
    {selectedItems.map(id => <input key={id} type="hidden" name="menuItemId" value={id} />)}
    <nav className={styles.steps} aria-label="مراحل ثبت نظر">
      {STEP_LABELS.map((label, index) => <button key={label} type="button" aria-current={step === index ? 'step' : undefined} disabled={pending || (index > 0 && !stars)} onClick={() => go(index)}>
        <span>{index < step ? <Check size={14} /> : (index + 1).toLocaleString('fa-IR')}</span>{label}
      </button>)}
    </nav>
    <div className={styles.progress} aria-hidden="true"><span style={{ width: `${(step + 1) / 3 * 100}%` }} /></div>
    {existing && <p className={styles.existingNote}>در حال ویرایش همین نظر هستی؛ برای تجربهٔ تازه، از «ثبت تجربهٔ من» بیرون این پنجره استفاده کن.</p>}
    <h3 ref={heading} tabIndex={-1} className={styles.question}>{['اینجا چطور بود؟', 'چی میل کردی؟', 'کی رفتی؟'][step]}</h3>
    {(error || state.error) && <p className={styles.error} role="alert">{error || state.error}</p>}

    {/* Keep all fields mounted: selection and optional ratings survive step/search changes. */}
    <section hidden={step !== 0} className={styles.stepContent}>
      <p className={styles.caption}>تجربهٔ واقعی‌ات از {placeName}</p>
      <div className={styles.ratingHero}><StarInput name="stars" label="امتیاز کلی" value={stars} onChange={value => { setStars(value); setError('') }} disabled={pending} />
        <strong aria-live="polite">{RATINGS[stars]}</strong></div>
      <p className={styles.note}>{minTextLength > 0 ? 'امتیاز و یک جمله لازم است؛ انتخاب غذا و جزئیات اختیاری‌اند.' : 'فقط همین امتیاز لازم است؛ انتخاب غذا و جزئیات اختیاری‌اند.'}</p>
    </section>

    <section hidden={step !== 1} className={styles.stepContent}>
      <p className={styles.caption}>می‌توانی چند سفارش انتخاب کنی؛ نظرت کنار همان آیتم‌ها هم دیده می‌شود.</p>
      {selected.length > 0 && <div className={styles.selectedOrders} aria-label="سفارش‌های انتخاب‌شده">{selected.map(item => <button key={item.id} type="button" disabled={pending} onClick={() => toggle(item.id)} aria-label={`حذف ${item.name} از سفارش‌ها`}>{item.name}<X size={14} /></button>)}</div>}
      {menuItems.length > 0 ? <div className={styles.menuPicker}>
        <label className={styles.search}><Search size={18} aria-hidden="true" /><input className={styles.input} value={menuQuery} disabled={pending}
          onChange={event => { setMenuQuery(event.target.value); setLimit(30) }} placeholder="نام خوراکی را جست‌وجو کن" aria-label="جست‌وجوی آیتم سفارش‌داده‌شده" enterKeyHint="search" autoComplete="off" /></label>
        <span className={styles.note} role="status">{visibleMenuItems.length.toLocaleString('fa-IR')} آیتم · {selectedItems.length.toLocaleString('fa-IR')} انتخاب از حداکثر ۲۰ سفارش</span>
        <div className={styles.menuPickerList}>{visibleMenuItems.slice(0, limit).map(item => <label key={item.id} className={styles.menuPickerItem} data-selected={selectedItems.includes(item.id) || undefined}>
          <input type="checkbox" value={item.id} checked={selectedItems.includes(item.id)} disabled={pending || (selectedItems.length >= 20 && !selectedItems.includes(item.id))} onChange={() => toggle(item.id)} />
          <span><b>{item.name}</b><small>{item.sectionName}{!item.available ? ' · فعلاً ناموجود' : ''}</small></span>
        </label>)}
          {!visibleMenuItems.length && <p className={styles.empty}>با این نام چیزی پیدا نشد؛ عبارت کوتاه‌تر یا نام دیگری را امتحان کن.</p>}
          {visibleMenuItems.length > limit && <button type="button" className={styles.more} disabled={pending} onClick={() => setLimit(value => value + 30)}>نمایش سفارش‌های بیشتر</button>}
        </div>
      </div> : <p className={styles.empty}>منوی قابل انتخابی ثبت نشده؛ می‌توانی بدون انتخاب غذا ادامه بدهی.</p>}
    </section>

    <section hidden={step !== 2} className={styles.stepContent}>
      <p className={styles.caption}>تاریخ کمک می‌کند تجربه‌ات دقیق‌تر باشد؛ اگر یادت نیست، لازم نیست واردش کنی.</p>
      <div className={styles.quickDates} aria-label="انتخاب سریع تاریخ مراجعه">{[['امروز', 0], ['دیروز', 1], ['یک هفته پیش', 7]].map(([label, days]) => {
        const choose = () => formatVisitDate(new Date(Date.now() - Number(days) * 86400000), 'Asia/Tehran')
        return <button type="button" key={label} disabled={pending} aria-pressed={!!visitDate && visitDate === choose()} onClick={() => { setVisitDate(choose()); setError('') }}>{label}</button>
      })}<button type="button" disabled={pending} aria-pressed={!visitDate} onClick={() => setVisitDate('')}>یادم نیست</button></div>
      <details className={styles.aspects} open={!!existing?.visitDate || undefined}><summary>انتخاب یک تاریخ دیگر</summary><label className={styles.field}>
        <span className={styles.label}>تاریخ مراجعه (شمسی)</span><input name="visitDate" className={styles.input} type="text" inputMode="numeric" autoComplete="off" placeholder="مثلاً ۱۴۰۵/۰۶/۲۱"
          value={visitDate} disabled={pending} onChange={event => setVisitDate(event.target.value)} aria-label="تاریخ مراجعه (شمسی)" />
      </label></details>
      <label className={styles.field}><span className={styles.label}>یک جمله از تجربه‌ات {minTextLength ? '(لازم)' : '(اختیاری)'}</span>
        <textarea name="text" className={styles.textarea} rows={3} minLength={minTextLength || undefined} maxLength={maxTextLength} required={minTextLength > 0} value={text} disabled={pending}
          onChange={event => setText(event.target.value)} placeholder="چه چیزی را دوست داشتی؟" />
        {minTextLength > 0 && <span className={styles.note}>دست‌کم {minTextLength.toLocaleString('fa-IR')} کاراکتر</span>}
      </label>
      <details className={styles.aspects}><summary>جزئیات بیشتر؛ امتیاز جداگانه</summary><div className={styles.aspectGrid}>{ASPECTS.map(aspect => <div key={aspect.name} className={styles.aspectRow}>
        <span className={styles.label}>{aspect.label}</span><StarInput name={aspect.name} label={aspect.label} value={aspects[aspect.name] ?? 0} disabled={pending} onChange={value => setAspects(previous => ({ ...previous, [aspect.name]: value }))} />
      </div>)}</div></details>
      {isBlogger && <label className={styles.field}><span className={styles.label}>لینک بررسی اینستاگرام (اختیاری)</span><input name="videoUrl" className={styles.input} type="url" dir="ltr" inputMode="url" placeholder="https://www.instagram.com/reel/..." defaultValue={existing?.videoUrl ?? ''} disabled={pending} /></label>}
      <div className={styles.summary}><span>★ {stars.toLocaleString('fa-IR')} از ۵</span><span>{selectedItems.length.toLocaleString('fa-IR')} سفارش انتخاب‌شده</span>{visitDate && <span>{visitDate}</span>}</div>
      <p className={styles.hint}>نام نمایشی‌ات کنار نظر دیده می‌شود. وضعیت انتشار پس از ثبت مشخص می‌شود.</p>
    </section>
    <div className={styles.stepActions}>{step > 0 && <button type="button" className={styles.back} disabled={pending} onClick={() => go(step - 1)}><ChevronRight size={17} />قبلی</button>}
      {step < 2 ? <button key="continue" type="button" className={styles.submit} disabled={pending || !stars} onClick={() => go(step + 1)}>{step === 1 ? 'ادامه' : 'انتخاب سفارش‌ها'}<ChevronLeft size={17} /></button>
        : <button key="submit" type="submit" className={styles.submit} disabled={pending}>{pending ? 'در حال ثبت…' : existing ? 'ذخیرهٔ ویرایش' : 'ثبت تجربه'}{!pending && <Check size={17} />}</button>}
    </div>
  </form>
}

export function ReviewForm(props: Props) {
  const router = useRouter()
  const [version, setVersion] = useState(0)
  const [message, setMessage] = useState('')
  const completed = useRef(false)
  const onSuccess = useCallback((notice: string) => { completed.current = true; setMessage(notice) }, [])
  const onClose = () => {
    if (!completed.current) return // Preserve an unfinished draft when dismissing.
    completed.current = false
    setVersion(value => value + 1)
    router.refresh()
    document.getElementById('reviews')?.scrollIntoView({
      block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
  }
  if (!props.signedIn) return <div className={styles.signInPrompt}><div><strong>تو تجربه کردی؛ بقیه بهتر انتخاب می‌کنند</strong><p>برای ثبت تجربه و سفارش‌ها وارد حساب شو.</p></div><a href={props.authHref} className={styles.signInLink}>ورود و ثبت تجربه</a></div>
  return <div className={styles.launcher}><p>در سه قدم کوتاه؛ امتیاز، سفارش و تاریخ.</p>
    <CafePopover label={props.existing ? 'ویرایش تجربه' : 'ثبت تجربهٔ من'} title={props.existing ? 'ویرایش تجربهٔ شما' : 'تجربه‌ات را با دیگران شریک شو'} onClose={onClose}>
      {({ close }) => <ReviewWizard key={`${props.existing?.id ?? 'new'}-${version}`} props={props} onSuccess={onSuccess} onConfirm={close} />}
    </CafePopover>
    {message && <p className={styles.successNotice} role="status"><CheckCircle2 size={18} aria-hidden="true" />{message}</p>}
  </div>
}

export default ReviewForm
