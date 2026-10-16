'use client'

import Link from 'next/link'
import { useActionState, useEffect, useState } from 'react'
import type { VenueBookingConfiguration } from '@/core/booking/service'
import type { BookingKind, MenuIntentInput } from '@/core/booking/policy'
import { paths } from '@/routes'
import { submitBookingRequest, type BookingFormState } from './actions'
import styles from './request.module.css'

type MenuChoice = { id: number; name: string; section: string; price: number | null; variants: { id: number; name: string; price: number | null }[] }
type Selectable = { key: string; itemId: number; variantId: number | null; label: string; price: number | null }

const KIND_LABELS: Record<BookingKind, string> = {
  table: 'درخواست میز', birthday: 'هماهنگی تولد', gathering: 'هماهنگی دورهمی', special_occasion: 'مناسبت ویژه',
}
const INITIAL: BookingFormState = {}

function menuOptions(menu: MenuChoice[]): Selectable[] {
  return menu.flatMap((item): Selectable[] => item.variants.length
    ? item.variants.map(variant => ({ key: `${item.id}:${variant.id}`, itemId: item.id, variantId: variant.id,
      label: `${item.section} · ${item.name} — ${variant.name}`, price: variant.price }))
    : [{ key: `${item.id}:0`, itemId: item.id, variantId: null, label: `${item.section} · ${item.name}`, price: item.price }])
}

export function BookingRequestForm({ placeId, placeName, settings, minDate, maxDate, initialKind, experienceSlug, menu }: {
  placeId: number; placeName: string; settings: VenueBookingConfiguration; minDate: string; maxDate: string
  initialKind: BookingKind; experienceSlug: string | null; menu: MenuChoice[]
}) {
  const [state, action, pending] = useActionState(submitBookingRequest, INITIAL)
  const [key, setKey] = useState('')
  const [kind, setKind] = useState<BookingKind>(initialKind)
  const [choice, setChoice] = useState('')
  const [items, setItems] = useState<MenuIntentInput[]>([])
  useEffect(() => setKey(crypto.randomUUID()), [])
  const options = menuOptions(menu)
  const selected = options.filter(option => items.some(item => item.itemId === option.itemId && (item.variantId ?? null) === option.variantId))
  const subtotal = selected.reduce((sum, option) => {
    const quantity = items.find(item => item.itemId === option.itemId && (item.variantId ?? null) === option.variantId)?.quantity ?? 0
    return sum + (option.price ?? 0) * quantity
  }, 0)
  const unknownPrice = selected.some(option => option.price === null)

  if (state.bookingId) return <section className={styles.success} role="status">
    <span className={styles.eyebrow}>درخواست ثبت شد</span>
    <h2>در انتظار پاسخ {placeName}</h2>
    <p>این درخواست هنوز رزرو قطعی نیست. پاسخ کافه را در حساب خود ببینید.</p>
    <Link href={paths.myBookings} className={styles.primaryLink}>پیگیری درخواست من</Link>
  </section>

  function addItem() {
    const option = options.find(row => row.key === choice)
    if (!option || items.length >= 12 || items.some(item => item.itemId === option.itemId && (item.variantId ?? null) === option.variantId)) return
    setItems(previous => [...previous, { itemId: option.itemId, variantId: option.variantId, quantity: 1 }])
    setChoice('')
  }

  return <form action={action} className={styles.form}>
    <input type="hidden" name="placeId" value={placeId} />
    <input type="hidden" name="idempotencyKey" value={key} />
    <input type="hidden" name="experienceSlug" value={experienceSlug ?? ''} />
    <input type="hidden" name="items" value={JSON.stringify(items)} />
    <div className={styles.fields}>
      <label className={styles.field}>نوع درخواست
        <select name="kind" value={kind} onChange={event => setKind(event.target.value as BookingKind)}>
          {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className={styles.field}>تاریخ پیشنهادی
        <input name="requestedDate" type="date" min={minDate} max={maxDate} required />
      </label>
      <label className={styles.field}>ساعت پیشنهادی
        <input name="requestedLocalTime" type="time" min={settings.requestFrom?.slice(0, 5)} max={settings.requestUntil?.slice(0, 5)} required />
      </label>
      <label className={styles.field}>تعداد نفرات
        <input name="partySize" type="number" min="1" max={settings.maxPartySize ?? 60} inputMode="numeric" required />
      </label>
      {kind !== 'table' && <label className={styles.field}>مدت تقریبی حضور، دقیقه (اختیاری)
        <input name="durationMinutes" type="number" min="30" max="720" step="30" inputMode="numeric" />
      </label>}
    </div>
    {kind !== 'table' && <fieldset className={styles.occasion}>
      <legend>نیازهای پیشنهادی</legend>
      <p>این گزینه‌ها فقط درخواست شما هستند؛ تأمین آن‌ها نیازمند تأیید کافه است.</p>
      <label><input type="checkbox" name="needsCake" /> کیک</label>
      <label><input type="checkbox" name="needsDecoration" /> تزئین</label>
      <label><input type="checkbox" name="needsPrivateSpace" /> فضای خصوصی</label>
    </fieldset>}
    <label className={styles.field}>توضیحات برای کافه (اختیاری)
      <textarea name="customerNote" maxLength={1000} rows={4} placeholder="زمان‌بندی یا نیاز خاص خود را کوتاه توضیح دهید" />
    </label>
    {menu.length > 0 && <details className={styles.menuIntent}>
      <summary>انتخاب اقلام موردنظر پیش از مراجعه <span>اختیاری</span></summary>
      <p>این انتخاب سفارش قطعی نیست و قیمت‌های منو ممکن است تغییر کنند.</p>
      <div className={styles.addItem}>
        <label className={styles.field}>قلم منو
          <select value={choice} onChange={event => setChoice(event.target.value)}>
            <option value="">انتخاب کنید</option>
            {options.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={addItem} disabled={!choice || items.length >= 12}>افزودن</button>
      </div>
      {items.length > 0 && <ul className={styles.selectedItems}>{selected.map(option => {
        const item = items.find(row => row.itemId === option.itemId && (row.variantId ?? null) === option.variantId)!
        return <li key={option.key}><span>{option.label}<small>{option.price === null ? 'قیمت نامعلوم' : `${new Intl.NumberFormat('fa-IR').format(option.price)} تومان`}</small></span>
          <label>تعداد <input type="number" min="1" max="10" value={item.quantity} onChange={event => setItems(previous => previous.map(row => row === item ? { ...row, quantity: Number(event.target.value) } : row))} /></label>
          <button type="button" onClick={() => setItems(previous => previous.filter(row => row !== item))} aria-label={`حذف ${option.label}`}>حذف</button></li>
      })}</ul>}
      {items.length > 0 && <p className={styles.subtotal}>جمع تخمینی: {new Intl.NumberFormat('fa-IR').format(subtotal)} تومان{unknownPrice ? ' + اقلام با قیمت نامعلوم' : ''}</p>}
    </details>}
    <div className={styles.notice}>
      <strong>پیش از ارسال</strong>
      <p>راه ارتباطی، شمارهٔ تأییدشدهٔ حساب شماست و فقط در اختیار همین کافه برای پاسخ به درخواست قرار می‌گیرد. ساعت پیشنهادی تضمین ظرفیت نیست.</p>
      {settings.instructions && <p>توضیح کافه: {settings.instructions}</p>}
    </div>
    <label className={styles.consent}><input type="checkbox" name="termsAccepted" required /> می‌دانم درخواست من تا تأیید صریح کافه، رزرو قطعی نیست و با ارسال اطلاعات تماس برای پاسخ موافقم.</label>
    {state.error && <p className={styles.error} role="alert">{state.error}</p>}
    <button type="submit" className={styles.submit} disabled={pending || !key}>{pending ? 'در حال ثبت…' : 'ارسال درخواست به کافه'}</button>
    <p className={styles.footnote}>پس از ارسال، وضعیت را از «درخواست‌های من» پیگیری کنید. لطفاً تا دریافت پاسخ، برای مراجعه برنامه‌ریزی قطعی نکنید.</p>
  </form>
}
