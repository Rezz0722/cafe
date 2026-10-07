'use client'
import { useState } from 'react'
import { ManagedForm, useManagedActionState, useManagedFormStatus } from '@/components/admin/ManagedForm'
import { venueQrAction } from '@/app/admin/venue/actions'
import { EMPTY_VENUE_STATE } from '@/app/admin/venue/state'
import type { QrChannel } from '@/core/qr/channels'
import { absoluteUrl } from '@/routes'
import { fa } from '@/lib/format'
import styles from './QrChannelsPanel.module.css'

function Submit({ children, disabled }: { children: string; disabled?: boolean }) {
  const { pending } = useManagedFormStatus()
  return <button type="submit" disabled={pending || disabled}>{pending ? 'در حال ثبت…' : children}</button>
}
function ChannelRow({ channel, placeId, revision }: { channel: QrChannel; placeId: number; revision: string }) {
  const [state, action] = useManagedActionState(venueQrAction, EMPTY_VENUE_STATE)
  const [confirmed, setConfirmed] = useState(false)
  const refreshing = state.qrAppliedRevision !== undefined && Number(revision) < state.qrAppliedRevision
  return <li className={styles.card}>
    <div><h3>{channel.label}</h3><p>{channel.kind === 'table' ? 'میز' : 'کانال'} · {channel.active ? 'فعال' : 'متوقف'}</p></div>
    <dl><div><dt>۳۰ روز اخیر</dt><dd>{fa(channel.recentOpens)}</dd></div><div><dt>از زمان ساخت</dt><dd>{fa(channel.opens)}</dd></div></dl>
    {channel.active && <>
      <img src={`/api/qr/link/${channel.token}`} width={176} height={176} alt={`QR ${channel.label}`} loading="lazy" />
      <label>لینک {channel.label}<input dir="ltr" readOnly value={absoluteUrl(`/q/${channel.token}`)} onFocus={event => event.currentTarget.select()} /></label>
      <a href={`/api/qr/link/${channel.token}?download=1`} download>دانلود SVG برای چاپ {channel.label}</a>
    </>}
    <ManagedForm action={async form => { const result = await action(form); if (result.ok) setConfirmed(false); return result }}>
      <input type="hidden" name="placeId" value={placeId} /><input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="qrId" value={channel.id} /><input type="hidden" name="operation" value={channel.active ? 'pause' : 'resume'} />
      {channel.active && <label className={styles.confirm}><input type="checkbox" name="confirmed" value="yes" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />تأیید می‌کنم لینک چاپ‌شده تا فعال‌سازی دوباره باز نمی‌شود.</label>}
      <Submit disabled={refreshing || (channel.active && !confirmed)}>{channel.active ? 'توقف این QR' : 'فعال‌سازی همان QR'}</Submit>
      {state.error && <p role="alert">{state.error}</p>}{state.message && <p role="status">{state.message}</p>}
      {refreshing && <p role="status">در حال تازه‌شدن وضعیت…</p>}
    </ManagedForm>
  </li>
}
export function QrChannelsPanel({ placeId, revision, channels, published }: { placeId: number; revision: string; channels: QrChannel[]; published: boolean }) {
  const [state, action] = useManagedActionState(venueQrAction, EMPTY_VENUE_STATE)
  const refreshing = state.qrAppliedRevision !== undefined && Number(revision) < state.qrAppliedRevision
  return <section className={styles.panel} aria-labelledby="qr-channels-title">
    <h2 id="qr-channels-title">QR مخصوص میز و کانال</h2>
    <p>برای «میز ۱»، «استند ورودی» یا «اینستاگرام» لینک جدا بسازید. مقصد همیشه منوی همین شعبه است؛ با تغییر قیمت یا آدرس شعبه چاپ دوباره لازم نیست.</p>
    <p className={styles.note}>اعداد، بازشدن لینک QR هستند؛ نه مشتری یکتا یا اسکن قطعی. ربات‌های شناخته‌شده و پیش‌بارگذاری شمرده نمی‌شوند. تکرار همان لینک با کوکی معتبر تا ۳۰ دقیقه شمرده نمی‌شود؛ حذف کوکی، جابه‌جایی بین QRها یا اشتراک لینک می‌تواند بر آمار اثر بگذارد. آمار روزانه بر مبنای UTC است.</p>
    {!published ? <p>برای ساخت QR ابتدا شعبه باید منتشرشده باشد.</p> : <ManagedForm action={action} className={styles.create}>
      <input type="hidden" name="placeId" value={placeId} /><input type="hidden" name="revision" value={revision} /><input type="hidden" name="operation" value="create" />
      <label>نام QR<input name="label" required maxLength={80} placeholder="مثلاً میز ۱" /></label>
      <label>نوع QR<select name="kind"><option value="table">میز</option><option value="channel">کانال / محل نمایش</option></select></label>
      <Submit disabled={refreshing || channels.length >= 50}>ساخت QR اختصاصی</Submit>
      {channels.length >= 50 && <p>سقف ۵۰ QR این شعبه پر شده است.</p>}
      {refreshing && <p role="status">در حال تازه‌شدن فهرست…</p>}
      {state.error && <p role="alert">{state.error}</p>}{state.message && <p role="status">{state.message}</p>}
    </ManagedForm>}
    {channels.length ? <ul className={styles.list}>{channels.map(channel => <ChannelRow key={channel.id} channel={channel} placeId={placeId} revision={revision} />)}</ul> : <p>هنوز QR اختصاصی نساخته‌اید. QR عمومی پایین صفحه همچنان قابل استفاده است.</p>}
    <p className={styles.note}>SVG را با حاشیهٔ سفید و حداقل اندازهٔ ۳×۳ سانتی‌متر چاپ کنید و قبل از توزیع با گوشی واقعی تست کنید. خاموش‌بودن آمار سایت یا DNT/GPC مانع شمارش می‌شود، نه بازشدن منو.</p>
  </section>
}
