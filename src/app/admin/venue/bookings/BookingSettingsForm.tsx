'use client'

import { useActionState } from 'react'
import type { VenueBookingConfiguration } from '@/core/booking/service'
import { saveBookingSettingsAction, type VenueBookingActionState } from './actions'
import styles from './bookings.module.css'

export function BookingSettingsForm({ placeId, settings }: { placeId: number; settings: VenueBookingConfiguration | null }) {
  const [state, action, pending] = useActionState(saveBookingSettingsAction, {} as VenueBookingActionState)
  return <form action={action} className={styles.settings}>
    <input type="hidden" name="placeId" value={placeId} />
    <input type="hidden" name="revision" value={settings?.revision ?? 0} />
    <div><h2>دریافت درخواست</h2><p>تا زمانی که این سرویس را فعال نکنید، گزینهٔ درخواست در صفحهٔ عمومی شعبه نشان داده نمی‌شود.</p></div>
    <label className={styles.toggle}><input type="checkbox" name="enabled" defaultChecked={settings?.enabled ?? false} /> دریافت درخواست رزرو و هماهنگی فعال باشد</label>
    <div className={styles.grid}>
      <label>شروع بازهٔ پیشنهادی<input name="requestFrom" type="time" defaultValue={settings?.requestFrom?.slice(0, 5) ?? '10:00'} required /></label>
      <label>پایان بازهٔ پیشنهادی<input name="requestUntil" type="time" defaultValue={settings?.requestUntil?.slice(0, 5) ?? '23:00'} required /></label>
      <label>حداکثر نفرات قابل درخواست<input name="maxPartySize" type="number" min="1" max="60" defaultValue={settings?.maxPartySize ?? 8} required /></label>
      <label>حداقل فاصله تا زمان مراجعه، دقیقه<input name="minNoticeMinutes" type="number" min="0" max="10080" defaultValue={settings?.minNoticeMinutes ?? 60} required /></label>
      <label>حداکثر روزهای آینده<input name="maxAdvanceDays" type="number" min="1" max="180" defaultValue={settings?.maxAdvanceDays ?? 30} required /></label>
    </div>
    <label>توضیح برای درخواست‌دهنده<textarea name="instructions" rows={3} maxLength={500} defaultValue={settings?.instructions ?? ''} placeholder="مثلاً برای مراسم بزرگ، جزئیات را در توضیحات بنویسید" /></label>
    <p className={styles.notice}>بازه و تعداد نفرات فقط برای دریافت درخواست هستند، نه اعلام ظرفیت آزاد یا تأیید خودکار میز.</p>
    {state.error && <p role="alert" className={styles.error}>{state.error}</p>}
    {state.success && <p role="status" className={styles.success}>{state.success} برای دیدن وضعیت تازه صفحه را به‌روزرسانی کنید.</p>}
    <button type="submit" disabled={pending}>{pending ? 'در حال ذخیره…' : 'ذخیره تنظیمات درخواست'}</button>
  </form>
}
