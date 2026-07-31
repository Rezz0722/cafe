'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  passwordLoginAction,
  requestCodeAction,
  setNameAction,
  verifyCodeAction,
} from '@/app/auth/actions'
import {
  EMPTY_NAME_STATE,
  EMPTY_PASSWORD_STATE,
  EMPTY_REQUEST_STATE,
  EMPTY_VERIFY_STATE,
} from '@/app/auth/state'
import { maskPhone } from '@/core/auth/phone'
import { OTP_LENGTH, OTP_RESEND_COOLDOWN_SEC } from '@/core/auth/otpConfig'
import { fa } from '@/lib/format'
import { paths } from '@/routes'
import styles from './AuthScreen.module.css'

type Step = 'phone' | 'code' | 'name' | 'password'

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={styles.primary} disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  )
}

/**
 * ورود با کد پیامکی.
 *
 * سه گام: شماره → کد → نام (فقط بار اول).
 *
 * اینکه گام «نام» بیاید یا نه را **سرور** تصمیم می‌گیرد (`needsName`)، نه
 * کلاینت. کلاینت نمی‌داند این شماره قبلاً ثبت شده یا نه — و نباید بداند،
 * وگرنه صفحه‌ی ورود تبدیل می‌شود به ابزار فهرست‌برداری از کاربران ثبت‌شده.
 */
export function AuthScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const redirectTo = params?.get('redirect') || paths.profile

  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  const [reqState, requestAction] = useActionState(requestCodeAction, EMPTY_REQUEST_STATE)
  const [verState, verifyAction] = useActionState(verifyCodeAction, EMPTY_VERIFY_STATE)
  const [nameState, nameAction] = useActionState(setNameAction, EMPTY_NAME_STATE)
  const [pwState, pwAction] = useActionState(passwordLoginAction, EMPTY_PASSWORD_STATE)

  // ── گام ۱ → ۲ ──
  useEffect(() => {
    if (reqState.ok && reqState.phone) {
      setPhone(reqState.phone)
      setStep('code')
      setCooldown(OTP_RESEND_COOLDOWN_SEC)
    }
  }, [reqState])

  // ── گام ۲ → ۳ یا پایان ──
  useEffect(() => {
    if (!verState.ok) return
    if (verState.needsName) {
      setStep('name')
    } else {
      router.replace(redirectTo)
      // بدون refresh، هدر و صفحات سرور نشست تازه را نمی‌بینند.
      router.refresh()
    }
  }, [verState, router, redirectTo])

  // ── گام ۳ → پایان ──
  useEffect(() => {
    if (nameState.ok) {
      router.replace(redirectTo)
      router.refresh()
    }
  }, [nameState, router, redirectTo])

  // ── ورود با رمز → پایان ──
  useEffect(() => {
    if (pwState.ok) {
      router.replace(redirectTo)
      router.refresh()
    }
  }, [pwState, router, redirectTo])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus()
  }, [step])

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <Link href={paths.home} className={styles.brand}>
          <img src="/logo-sm.webp" alt="" width={40} height={40} />
          <span>کافه‌گرد</span>
        </Link>

        {/* ═══ گام ۱ — شماره ═══ */}
        {step === 'phone' && (
          <form action={requestAction} className={styles.form}>
            <h1 className={styles.title}>ورود یا ثبت‌نام</h1>
            <p className={styles.lede}>
              شماره موبایلت را وارد کن تا کد ورود برایت بفرستیم.
            </p>

            <label className={styles.field}>
              <span className={styles.label}>شماره موبایل</span>
              <input
                name="phone"
                className={styles.input}
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="09151234567"
                dir="ltr"
                required
                autoFocus
              />
            </label>

            {reqState.error && <div className={styles.error}>{reqState.error}</div>}

            <SubmitButton label="ارسال کد" pendingLabel="در حال ارسال…" />

            {/*
              مسیر دوم. ورود فقط با پیامک یک نقطه‌ی شکست تک‌نقطه‌ای است: اعتبار
              که تمام شود یا سرویس که قطع شود، مدیر از پنل خودش بیرون می‌ماند.
              فقط حساب‌هایی که رمز دارند از این راه وارد می‌شوند.
            */}
            <button
              type="button"
              className={styles.altButton}
              onClick={() => setStep('password')}
            >
              ورود با رمز عبور
            </button>
          </form>
        )}

        {/* ═══ ورود با رمز — برای حساب‌های کاری ═══ */}
        {step === 'password' && (
          <form action={pwAction} className={styles.form}>
            <h1 className={styles.title}>ورود با رمز عبور</h1>
            <p className={styles.lede}>
              برای حساب‌های مدیر و مالک کافه. کاربر عادی با کد پیامکی وارد می‌شود.
            </p>

            <label className={styles.field}>
              <span className={styles.label}>شماره موبایل</span>
              <input
                name="phone"
                className={styles.input}
                type="tel"
                inputMode="numeric"
                autoComplete="username"
                placeholder="09151234567"
                dir="ltr"
                required
                autoFocus
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>رمز عبور</span>
              <input
                name="password"
                className={styles.input}
                type="password"
                autoComplete="current-password"
                dir="ltr"
                required
              />
            </label>

            {pwState.error && <div className={styles.error}>{pwState.error}</div>}

            <SubmitButton label="ورود" pendingLabel="در حال بررسی…" />

            <button
              type="button"
              className={styles.altButton}
              onClick={() => setStep('phone')}
            >
              ورود با کد پیامکی
            </button>
          </form>
        )}

        {/* ═══ گام ۲ — کد ═══ */}
        {step === 'code' && (
          <form action={verifyAction} className={styles.form}>
            <input type="hidden" name="phone" value={phone} />

            <h1 className={styles.title}>کد را وارد کن</h1>
            <p className={styles.lede}>
              کد {fa(OTP_LENGTH)} رقمی به <b dir="ltr">{maskPhone(phone)}</b> فرستاده شد.
            </p>

            {/*
              در حالت توسعه پیامکی ارسال نمی‌شود. صریح می‌گوییم، وگرنه کاربر
              منتظر پیامکی می‌ماند که هرگز نمی‌آید.
            */}
            {reqState.devMode && (
              <div className={styles.devNote}>
                حالت توسعه فعال است — پیامکی ارسال نشد. کد در ترمینال سرور چاپ شده.
              </div>
            )}

            <label className={styles.field}>
              <span className={styles.label}>کد ورود</span>
              <input
                ref={codeRef}
                name="code"
                className={`${styles.input} ${styles.codeInput}`}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={OTP_LENGTH}
                dir="ltr"
                required
              />
            </label>

            {verState.error && <div className={styles.error}>{verState.error}</div>}

            <SubmitButton label="ورود" pendingLabel="در حال بررسی…" />

            <div className={styles.actionsRow}>
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => setStep('phone')}
              >
                تغییر شماره
              </button>

              {cooldown > 0 ? (
                <span className={styles.muted}>ارسال دوباره تا {fa(cooldown)} ثانیه</span>
              ) : (
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => {
                    const fd = new FormData()
                    fd.set('phone', phone)
                    requestAction(fd)
                  }}
                >
                  ارسال دوباره کد
                </button>
              )}
            </div>
          </form>
        )}

        {/* ═══ گام ۳ — نام (فقط کاربر تازه) ═══ */}
        {step === 'name' && (
          <form action={nameAction} className={styles.form}>
            <h1 className={styles.title}>خوش آمدی 👋</h1>
            <p className={styles.lede}>اسمت را بنویس تا پروفایلت کامل شود.</p>

            <label className={styles.field}>
              <span className={styles.label}>نام</span>
              <input
                name="name"
                className={styles.input}
                maxLength={60}
                placeholder="مثلاً نگار احمدی"
                required
                autoFocus
              />
            </label>

            {nameState.error && <div className={styles.error}>{nameState.error}</div>}

            <SubmitButton label="شروع کنیم" pendingLabel="…" />
          </form>
        )}
      </div>
    </div>
  )
}
