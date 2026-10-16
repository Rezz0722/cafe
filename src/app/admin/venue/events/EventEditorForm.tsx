'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import type { venueEvent } from '@/db/schema'
import { EVENT_CATEGORY_LABEL } from '@/core/events/presentation'
import { saveEventAction, type EventActionState } from './actions'
import styles from './events.module.css'

type EventRow = typeof venueEvent.$inferSelect

export function EventEditorForm({ placeId, event, photoChoices, minDate }: {
  placeId: number; event?: EventRow | null; photoChoices: { id: number; label: string }[]; minDate: string
}) {
  const [state, action, pending] = useActionState(saveEventAction, {} as EventActionState)
  if (state.eventId) return <div className={styles.success} role="status"><strong>{state.success}</strong>
    <Link href={`/admin/venue/events/${state.eventId}?place=${placeId}`}>بررسی و انتشار رویداد</Link></div>
  return <form action={action} className={styles.editor}>
    <input type="hidden" name="placeId" value={placeId} />
    {event && <><input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="revision" value={event.revision} /></>}
    <div><h2>{event ? 'ویرایش پیش‌نویس' : 'رویداد تازه'}</h2><p>ابتدا اطلاعات واقعی را به‌صورت پیش‌نویس ذخیره کنید. انتشار فقط با تأیید جداگانه انجام می‌شود.</p></div>
    <label>عنوان رویداد<input name="title" maxLength={160} minLength={5} required defaultValue={event?.title ?? ''} placeholder="نام واقعی برنامه" /></label>
    <label>توضیحات<textarea name="description" rows={5} minLength={30} maxLength={4000} required defaultValue={event?.description ?? ''} placeholder="برنامه، برگزارکننده و جزئیات تأییدشده را توضیح دهید" /></label>
    <div className={styles.grid}>
      <label>تاریخ شروع<input type="date" name="startDate" min={minDate} required defaultValue={event?.startDate ?? ''} /></label>
      <label>ساعت شروع<input type="time" name="startLocalTime" required defaultValue={event?.startLocalTime.slice(0, 5) ?? ''} /></label>
      <label>تاریخ پایان<input type="date" name="endDate" min={minDate} required defaultValue={event?.endDate ?? ''} /></label>
      <label>ساعت پایان<input type="time" name="endLocalTime" required defaultValue={event?.endLocalTime.slice(0, 5) ?? ''} /></label>
      <label>دستهٔ رویداد<select name="category" defaultValue={event?.category ?? 'other'}>{Object.entries(EVENT_CATEGORY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>روش مشارکت<select name="participationMode" defaultValue={event?.participationMode ?? 'request'}><option value="request">درخواست شرکت، نیازمند پاسخ کافه</option><option value="interest">ثبت علاقه‌مندی، بدون تأیید حضور</option></select></label>
      <label>ظرفیت اعلام‌شده (اختیاری)<input type="number" name="capacity" min="1" max="5000" inputMode="numeric" defaultValue={event?.capacity ?? ''} placeholder="اگر دقیق و تأییدشده است" /></label>
      <label>تصویر موجود همین شعبه (اختیاری)<select name="coverMediaId" defaultValue={event?.coverMediaId ?? ''}><option value="">بدون تصویر</option>{photoChoices.map(photo => <option key={photo.id} value={photo.id}>{photo.label}</option>)}</select></label>
    </div>
    <label>شرایط شرکت (اختیاری)<textarea name="terms" rows={3} maxLength={2000} defaultValue={event?.terms ?? ''} placeholder="هزینه یا شرایط را فقط اگر واقعاً مشخص است بنویسید" /></label>
    <p className={styles.notice}>ظرفیت، قیمت و حضور قطعی از دادهٔ فرضی ساخته نمی‌شوند. این فاز پرداخت یا بلیت صادر نمی‌کند.</p>
    {state.error && <p className={styles.error} role="alert">{state.error}</p>}
    <button type="submit" disabled={pending}>{pending ? 'در حال ذخیره…' : event ? 'ذخیرهٔ ویرایش پیش‌نویس' : 'ساخت پیش‌نویس'}</button>
  </form>
}
