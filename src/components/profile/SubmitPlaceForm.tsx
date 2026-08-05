'use client'

/**
 * فرم ثبت کافه‌ی جدید توسط کاربر.
 *
 * ═══ چرا فقط نام اجباری است ═══
 *
 * کاربری که کافه‌ای را می‌شناسد و اینجا نیست، معمولاً فقط نام و یک نشانه‌ی
 * تقریبی از محل را می‌داند. اجباری‌کردن آدرس دقیق و مختصات یعنی فرم رها
 * می‌شود و آن کافه هرگز ثبت نمی‌شود. بقیه‌ی داده را تیم یا خودِ کافه‌دار
 * کامل می‌کند.
 */

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { submitPlaceAction } from '@/app/profile/actions'
import { EMPTY_ACTION_STATE } from '@/app/profile/state'
import styles from './SubmitPlaceForm.module.css'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={styles.submit} disabled={pending}>
      {pending ? 'در حال ارسال…' : 'ارسال برای بررسی'}
    </button>
  )
}

const KINDS = [
  { id: 'cafe', label: 'کافه' },
  { id: 'cafe_restaurant', label: 'کافه‌رستوران' },
  { id: 'restaurant', label: 'رستوران' },
  { id: 'bakery', label: 'بیکری / قنادی' },
  { id: 'lounge', label: 'لانژ / روف' },
]

export function SubmitPlaceForm({
  districts,
}: {
  districts: { id: string; name: string }[]
}) {
  const [state, action] = useActionState(submitPlaceAction, EMPTY_ACTION_STATE)

  // بعد از ثبت موفق، فرم خالی می‌شود تا کاربر بتواند کافه‌ی بعدی را ثبت کند.
  return (
    <form action={action} className={styles.form} key={state.ok ? 'sent' : 'draft'}>
      {state.ok && state.message && <p className={styles.success}>{state.message}</p>}
      {state.error && <p className={styles.error}>{state.error}</p>}

      <label className={styles.field}>
        <span className={styles.label}>
          نام مجموعه <span className={styles.required}>*</span>
        </span>
        <input name="name" className={styles.input} maxLength={200} required />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>نوع</span>
        <select name="kind" className={styles.input} defaultValue="cafe">
          {KINDS.map((kind) => (
            <option key={kind.id} value={kind.id}>
              {kind.label}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>محله</span>
        <select name="districtId" className={styles.input} defaultValue="">
          <option value="">نمی‌دانم</option>
          {districts.map((district) => (
            <option key={district.id} value={district.id}>
              {district.name}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>آدرس</span>
        <input
          name="address"
          className={styles.input}
          maxLength={500}
          placeholder="مثلاً بلوار سجاد، نبش چهارراه بهار"
        />
      </label>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>شماره تماس</span>
          <input
            name="phone"
            className={styles.input}
            inputMode="tel"
            dir="ltr"
            placeholder="05138472000"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>اینستاگرام</span>
          <input
            name="instagram"
            className={styles.input}
            dir="ltr"
            placeholder="cafe_name"
          />
        </label>
      </div>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>عرض جغرافیایی</span>
          <input
            name="lat"
            className={styles.input}
            inputMode="decimal"
            dir="ltr"
            placeholder="36.3157"
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>طول جغرافیایی</span>
          <input
            name="lng"
            className={styles.input}
            inputMode="decimal"
            dir="ltr"
            placeholder="59.5391"
          />
        </label>
      </div>
      <p className={styles.hint}>
        مختصات را از نشان یا گوگل مپس کپی کن — اگر نداری خالی بگذار، خودمان پیدا
        می‌کنیم.
      </p>

      <label className={styles.field}>
        <span className={styles.label}>توضیح</span>
        <textarea
          name="note"
          className={styles.textarea}
          rows={3}
          maxLength={500}
          placeholder="چه چیزی این کافه را خاص می‌کند؟"
        />
      </label>

      <SubmitButton />
    </form>
  )
}

export default SubmitPlaceForm
