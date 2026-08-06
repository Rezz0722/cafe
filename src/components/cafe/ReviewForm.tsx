'use client'

/**
 * فرم ثبت نظر در صفحه‌ی کافه.
 *
 * ═══ چرا امتیاز تفکیکی اختیاری است ═══
 *
 * یک ستاره‌ی کلی اجباری، پنج ستاره‌ی تفکیکی اختیاری. کاربری که فقط می‌خواهد
 * بگوید «خوب بود» نباید پنج بار امتیاز بدهد؛ ولی کاربری که می‌خواهد بگوید
 * «قهوه‌اش عالی، سرویسش ضعیف» باید بتواند. اجباری‌کردن همه، نظرِ کوتاه را
 * از بین می‌برد و اجباری‌نکردنِ هیچ‌کدام، داده‌ی تفکیکی نمی‌دهد.
 */

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { submitReviewAction } from '@/app/profile/actions'
import { EMPTY_ACTION_STATE } from '@/app/profile/state'
import styles from './ReviewForm.module.css'

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={styles.submit} disabled={pending}>
      {pending ? 'در حال ثبت…' : isEdit ? 'ویرایش نظر' : 'ثبت نظر'}
    </button>
  )
}

const ASPECTS = [
  { name: 'ratingCoffee', label: 'قهوه' },
  { name: 'ratingFood', label: 'غذا' },
  { name: 'ratingVibe', label: 'حال‌وهوا' },
  { name: 'ratingService', label: 'سرویس' },
  { name: 'ratingValue', label: 'ارزش خرید' },
] as const

/** ستاره‌های قابل کلیک — `radio` واقعی، پس با کیبورد هم کار می‌کند. */
function StarInput({
  name,
  value,
  onChange,
  required,
}: {
  name: string
  value: number
  onChange?: (next: number) => void
  required?: boolean
}) {
  return (
    <span className={styles.starGroup}>
      {[1, 2, 3, 4, 5].map((star) => (
        <label key={star} className={styles.starLabel}>
          <input
            type="radio"
            name={name}
            value={star}
            checked={value === star}
            onChange={() => onChange?.(star)}
            required={required && star === 1 ? value === 0 : false}
            className={styles.starInput}
          />
          <span
            className={star <= value ? styles.starOn : styles.starOff}
            aria-label={`${star} ستاره`}
          >
            ★
          </span>
        </label>
      ))}
    </span>
  )
}

interface Props {
  placeId: number
  slug: string
  placeName: string
  signedIn: boolean
  existing: { stars: number; text: string | null; status: string } | null
  authHref: string
  /**
   * حد پایین و بالای متن — از تنظیمات پنل ادمین.
   *
   * سرور هم همین‌ها را بررسی می‌کند؛ اینجا فقط برای این است که کاربر خطا را
   * **قبل** از ارسال ببیند. اعتبارسنجی سمت کلاینت هرگز جایگزین سرور نیست.
   */
  minTextLength?: number
  maxTextLength?: number
}

export function ReviewForm({
  placeId,
  slug,
  placeName,
  signedIn,
  existing,
  authHref,
  minTextLength = 0,
  maxTextLength = 4000,
}: Props) {
  const [state, action] = useActionState(submitReviewAction, EMPTY_ACTION_STATE)
  const [stars, setStars] = useState(existing?.stars ?? 0)
  const [aspects, setAspects] = useState<Record<string, number>>({})

  if (!signedIn) {
    return (
      <div className={styles.signInPrompt}>
        <p>برای ثبت نظر وارد شوید.</p>
        <a href={authHref} className={styles.signInLink}>
          ورود یا ثبت‌نام
        </a>
      </div>
    )
  }

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="placeId" value={placeId} />
      <input type="hidden" name="slug" value={slug} />

      {existing && (
        <p className={styles.existingNote}>
          نظر قبلی‌ات{' '}
          {existing.status === 'approved'
            ? 'منتشر شده'
            : existing.status === 'pending'
              ? 'در انتظار تأیید'
              : 'تأیید نشده'}
          . با ثبت دوباره، همان نظر ویرایش می‌شود.
        </p>
      )}

      {state.ok && state.message && <p className={styles.success}>{state.message}</p>}
      {state.error && <p className={styles.error}>{state.error}</p>}

      <div className={styles.overall}>
        <span className={styles.label}>
          امتیاز کلی به {placeName} <span className={styles.required}>*</span>
        </span>
        <StarInput name="stars" value={stars} onChange={setStars} required />
      </div>

      <details className={styles.aspects}>
        <summary>امتیاز تفکیکی (اختیاری)</summary>
        <div className={styles.aspectGrid}>
          {ASPECTS.map((aspect) => (
            <div key={aspect.name} className={styles.aspectRow}>
              <span className={styles.aspectLabel}>{aspect.label}</span>
              <StarInput
                name={aspect.name}
                value={aspects[aspect.name] ?? 0}
                onChange={(next) => setAspects((prev) => ({ ...prev, [aspect.name]: next }))}
              />
            </div>
          ))}
        </div>
      </details>

      <label className={styles.field}>
        <span className={styles.label}>نظرت</span>
        <textarea
          name="text"
          className={styles.textarea}
          rows={4}
          minLength={minTextLength || undefined}
          maxLength={maxTextLength}
          required={minTextLength > 0}
          defaultValue={existing?.text ?? ''}
          placeholder="چه چیزی خوب بود؟ چه چیزی می‌توانست بهتر باشد؟"
        />
        {minTextLength > 0 && (
          <span className={styles.note}>حداقل {minTextLength} کاراکتر</span>
        )}
      </label>

      <label className={styles.field}>
        <span className={styles.label}>تاریخ مراجعه (اختیاری)</span>
        <input name="visitDate" className={styles.input} type="date" dir="ltr" />
      </label>

      <p className={styles.hint}>
        نظرها بعد از بررسی منتشر می‌شوند. نامِ نمایشی‌ات کنار نظر دیده می‌شود.
      </p>

      <SubmitButton isEdit={!!existing} />
    </form>
  )
}

export default ReviewForm
