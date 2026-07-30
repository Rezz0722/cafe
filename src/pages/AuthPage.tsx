import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import logo from '@/assets/logo.png'
import { BackChevron, MobileShell, shellStyles } from '@/components/layout/MobileShell'
import { useAuth } from '@/hooks/useAuth'
import { useInterval } from '@/hooks/useInterval'
import { fa, toEnDigits } from '@/lib/format'
import { paths } from '@/routes'
import styles from './AuthPage.module.css'

type Step = 'phone' | 'otp' | 'complete'

const OTP_LENGTH = 5
const RESEND_SECONDS = 60
const MIN_PHONE_DIGITS = 10

/**
 * Digits only, accepting Persian or ASCII input. `parseNumber` would drop the
 * leading zero of an Iranian mobile number, so the string form is what counts.
 */
function digitsOf(value: string): string {
  return toEnDigits(value).replace(/\D/g, '')
}

export function AuthPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { isLoggedIn, user, signIn } = useAuth()

  /**
   * `?edit=1` reuses the final step of this flow as the "change your name"
   * screen, which is the only place that field exists. Without it a signed-in
   * visitor is bounced to their profile, so the profile's edit link would
   * otherwise just round-trip.
   */
  const editing = params.get('edit') === '1' && isLoggedIn

  const [step, setStep] = useState<Step>(editing ? 'complete' : 'phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState<string[]>(() => Array<string>(OTP_LENGTH).fill(''))
  const [name, setName] = useState(() => (editing ? user?.name ?? '' : ''))
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS)
  const boxes = useRef<(HTMLInputElement | null)[]>([])

  const digits = digitsOf(phone)
  const phoneReady = digits.length >= MIN_PHONE_DIGITS
  const otpReady = otp.every((digit) => digit !== '')

  useInterval(
    () => setSecondsLeft((seconds) => seconds - 1),
    step === 'otp' && secondsLeft > 0 ? 1000 : null,
  )

  // Signing up is pointless once a session exists — unless it is a name edit.
  if (isLoggedIn && !editing) return <Navigate to={paths.profile} replace />

  const redirect = params.get('redirect')
  // In-app paths only, so a crafted ?redirect= cannot bounce the user off-site.
  const target = redirect && redirect.startsWith('/') ? redirect : paths.profile

  const maskedPhone = phoneReady
    ? `${fa(digits.slice(0, 4))} ••• ${fa(digits.slice(-4))}`
    : '۰۹۱۵ ••• ۴۴۲۱'

  function handlePhoneSubmit(event: FormEvent) {
    event.preventDefault()
    if (!phoneReady) return
    setOtp(Array<string>(OTP_LENGTH).fill(''))
    setSecondsLeft(RESEND_SECONDS)
    setStep('otp')
  }

  function handleOtpChange(index: number, value: string) {
    const digit = digitsOf(value).slice(-1)
    setOtp((prev) => prev.map((old, i) => (i === index ? digit : old)))
    if (digit && index < OTP_LENGTH - 1) boxes.current[index + 1]?.focus()
  }

  function handleOtpKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && otp[index] === '' && index > 0) {
      event.preventDefault()
      boxes.current[index - 1]?.focus()
    }
  }

  // There is no backend: any five digits count as the right code.
  function handleVerify(event: FormEvent) {
    event.preventDefault()
    if (!otpReady) return
    setStep('complete')
  }

  function handleFinish(event: FormEvent) {
    event.preventDefault()
    signIn(name)
    navigate(target, { replace: true })
  }

  /* ===== phone ============================================================ */

  if (step === 'phone') {
    return (
      <MobileShell>
        <div className={styles.screen}>
          <form className={styles.center} onSubmit={handlePhoneSubmit}>
            <div className={styles.brand}>
              <img className={styles.logo} src={logo} alt="" width={78} height={78} />
              <div className={styles.brandName}>کافه‌گرد</div>
            </div>

            <h1 className={styles.title}>خوش اومدی! 👋</h1>
            <p className={styles.lede}>برای ادامه شماره موبایلت رو وارد کن.</p>

            <label className={styles.label} htmlFor="auth-phone">
              شماره موبایل
            </label>
            <input
              id="auth-phone"
              className={styles.phoneInput}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="numeric"
              autoComplete="tel"
              placeholder="۰۹۱۲ ۳۴۵ ۶۷۸۹"
              dir="ltr"
            />

            <button
              type="submit"
              className={`${shellStyles.primaryButton} ${styles.submit}`}
              disabled={!phoneReady}
            >
              ادامه
            </button>
          </form>

          <p className={styles.terms}>
            با ادامه، <span className={styles.termsLink}>قوانین</span> و{' '}
            <span className={styles.termsLink}>حریم خصوصی</span> کافه‌گرد را می‌پذیری.
          </p>
        </div>
      </MobileShell>
    )
  }

  /* ===== otp ============================================================== */

  if (step === 'otp') {
    return (
      <MobileShell>
        <div className={styles.screen}>
          <button type="button" className={styles.backButton} onClick={() => setStep('phone')}>
            <BackChevron />
            اصلاح شماره
          </button>

          <form className={styles.center} onSubmit={handleVerify}>
            <div className={styles.mailIcon} aria-hidden="true">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="4" width="20" height="16" rx="3" />
                <path d="M22 7l-10 6L2 7" />
              </svg>
            </div>

            <h1 className={styles.title} id="auth-otp-title">
              کد تأیید رو وارد کن
            </h1>
            <p className={styles.lede}>
              کد ۵ رقمی به شماره{' '}
              <b className={styles.masked} dir="ltr">
                {maskedPhone}
              </b>{' '}
              پیامک شد.
            </p>

            {/* Labelled as a group: each box is one digit of the same code. */}
            <div className={styles.otpRow} dir="ltr" role="group" aria-labelledby="auth-otp-title">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(element) => {
                    boxes.current[index] = element
                  }}
                  className={styles.otpBox}
                  value={digit}
                  onChange={(event) => handleOtpChange(index, event.target.value)}
                  onKeyDown={(event) => handleOtpKeyDown(index, event)}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={1}
                />
              ))}
            </div>

            <button type="submit" className={shellStyles.primaryButton} disabled={!otpReady}>
              تأیید
            </button>

            <div className={styles.resend}>
              <button
                type="button"
                className={styles.resendButton}
                onClick={() => setSecondsLeft(RESEND_SECONDS)}
                disabled={secondsLeft > 0}
              >
                {secondsLeft > 0
                  ? `ارسال مجدد کد تا ${fa(secondsLeft)} ثانیه دیگر`
                  : 'ارسال مجدد کد'}
              </button>
            </div>
          </form>
        </div>
      </MobileShell>
    )
  }

  /* ===== complete ========================================================= */

  return (
    <MobileShell>
      <div className={styles.screen}>
        <form className={styles.center} onSubmit={handleFinish}>
          <h1 className={styles.title}>یه قدم مونده! ✨</h1>
          <p className={styles.lede}>اسمت رو بنویس تا بشناسیمت.</p>

          <div className={styles.avatarRow}>
            <div className={styles.avatarFrame}>
              <div className={styles.avatarSlot}>عکس</div>
              <span className={styles.avatarAdd} aria-hidden="true">
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </span>
            </div>
          </div>

          <label className={styles.label} htmlFor="auth-name">
            نام و نام خانوادگی
          </label>
          <input
            id="auth-name"
            className={styles.nameInput}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            placeholder="مثلاً: نگار احمدی"
          />
          <p className={styles.hint}>عکس پروفایل اختیاریه؛ بعداً هم می‌تونی اضافه کنی.</p>

          <button type="submit" className={`${shellStyles.primaryButton} ${styles.submit}`}>
            بزن بریم
          </button>
        </form>
      </div>
    </MobileShell>
  )
}
