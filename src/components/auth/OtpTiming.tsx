'use client'
import { fa } from '@/lib/format'
import styles from './AuthScreen.module.css'

export function OtpTiming({ remaining, resendRemaining }: { remaining: number; resendRemaining: number }) {
  const time = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`
  return <div className={styles.compactNote}>
    <p aria-live="off">اعتبار کد: <output dir="ltr" aria-live="off">{fa(time)}</output></p>
    {remaining === 0 && <p role="status">اعتبار این کد تمام شده است؛ کد تازه درخواست کنید.</p>}
    <p aria-live="off">{resendRemaining > 0 ? `ارسال مجدد تا ${fa(resendRemaining)} ثانیهٔ دیگر` : 'ارسال مجدد کد در دسترس است.'}</p>
  </div>
}
