'use client'

/**
 * «چیزی در این صفحه غلط است؟» — فرمِ اصلاح، روی صفحه‌ی هر کافه.
 *
 * ═══ چرا اینجا و نه در یک صفحه‌ی جدا ═══
 *
 * کاربر دقیقاً وقتی می‌فهمد ساعت کاری غلط است که آن را روی صفحه می‌بیند. اگر
 * برای گفتنش باید به صفحه‌ی «مشارکت» برود و از میان ۳۳۱ کافه دوباره همین را
 * پیدا کند، نمی‌گوید. صفحه‌ی «مشارکت» توضیح می‌دهد و راه را نشان می‌دهد؛ ثبتِ
 * واقعی همین‌جاست.
 *
 * ═══ چرا بسته می‌ماند ═══
 *
 * ۹۹٪ بازدیدها اصلاحی ندارند. فرمِ بازِ همیشگی برای آن ۱٪، به بقیه فقط اسکرول
 * تحمیل می‌کند. `details` بومی است: بدون JS باز می‌شود.
 *
 * ═══ چرا «مقدار فعلی» پنهان فرستاده می‌شود ═══
 *
 * ادمین باید ببیند کاربر به *چه چیزی* اعتراض داشته. اگر فقط مقدار پیشنهادی را
 * داشته باشد، برای هر پیشنهاد باید خودش صفحه را باز کند و مقایسه کند.
 */

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { suggestEditAction } from '@/app/profile/actions'
import { EMPTY_ACTION_STATE } from '@/app/profile/state'
import {
  SUGGESTABLE_FIELDS,
  SUGGESTION_MAX_LENGTH,
  type SuggestableField,
} from '@/core/places/suggestFields'
import styles from './SuggestEdit.module.css'
import { ChevronDown, PencilLine } from 'lucide-react'

interface Props {
  placeId: number
  placeName: string
  signedIn: boolean
  authHref: string
  /** مقدارِ فعلیِ هر فیلد، همان‌طور که روی صفحه دیده می‌شود. */
  currentValues: Partial<Record<string, string | null>>
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={styles.submit} disabled={pending}>
      {pending ? 'در حال ارسال…' : 'ارسال اصلاح'}
    </button>
  )
}

export function SuggestEdit({
  placeId,
  placeName,
  signedIn,
  authHref,
  currentValues,
}: Props) {
  const [state, action] = useActionState(suggestEditAction, EMPTY_ACTION_STATE)
  const [fieldId, setFieldId] = useState<string>(SUGGESTABLE_FIELDS[0]!.id)

  const field: SuggestableField =
    SUGGESTABLE_FIELDS.find((item) => item.id === fieldId) ?? SUGGESTABLE_FIELDS[0]!
  const current = currentValues[field.id] ?? null

  return (
    <details className={styles.wrap}>
      <summary className={styles.summary}>
        <span className={styles.icon} aria-hidden="true">
          <PencilLine size={16} />
        </span>
        <span className={styles.summaryText}>
          چیزی در این صفحه غلط است؟ اصلاحش کنید
        </span>
        <ChevronDown size={15} aria-hidden="true" className={styles.caret} />
      </summary>

      <div className={styles.body}>
        {signedIn ? (
          <form action={action} className={styles.form}>
            <input type="hidden" name="placeId" value={placeId} />
            <input type="hidden" name="currentValue" value={current ?? ''} />

            <label className={styles.field}>
              <span className={styles.label}>چه چیزی غلط است؟</span>
              <select
                name="field"
                className={styles.select}
                value={fieldId}
                onChange={(event) => setFieldId(event.target.value)}
              >
                {SUGGESTABLE_FIELDS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.labelFa}
                  </option>
                ))}
              </select>
            </label>

            {current && (
              <p className={styles.current}>
                <span className={styles.currentLabel}>الان روی صفحه:</span>
                <span className={field.ltr ? styles.currentValueLtr : styles.currentValue}>
                  {current}
                </span>
              </p>
            )}

            <label className={styles.field}>
              <span className={styles.label}>درستش چیست؟</span>
              {field.long ? (
                <textarea
                  /* `key` لازم است: بدون آن، React همان textarea را برای
                     فیلد بعدی بازیافت می‌کند و متنِ فیلد قبلی باقی می‌ماند. */
                  key={field.id}
                  name="suggestedValue"
                  className={styles.textarea}
                  rows={3}
                  maxLength={SUGGESTION_MAX_LENGTH}
                  placeholder={field.placeholder}
                  dir={field.ltr ? 'ltr' : undefined}
                  required
                />
              ) : (
                <input
                  key={field.id}
                  name="suggestedValue"
                  className={styles.input}
                  maxLength={SUGGESTION_MAX_LENGTH}
                  placeholder={field.placeholder}
                  dir={field.ltr ? 'ltr' : undefined}
                  required
                />
              )}
              <span className={styles.hint}>{field.hint}</span>
            </label>

            {state.error && <p className={styles.error}>{state.error}</p>}
            {state.ok && state.message && <p className={styles.success}>{state.message}</p>}

            <SubmitButton />

            <p className={styles.note}>
              اصلاح شما بعد از بررسی روی صفحه‌ی {placeName} اعمال می‌شود. چیزی که
              مطمئن نیستید را نفرستید — داده‌ی غلط بدتر از داده‌ی قدیمی است.
            </p>
          </form>
        ) : (
          <div className={styles.signIn}>
            <p>
              برای فرستادن اصلاح باید وارد شوید. بدون حساب، صفِ بررسی در چند روز
              پر از هرزنامه می‌شود و هیچ اصلاح واقعی‌ای بررسی نمی‌شود.
            </p>
            <a href={authHref} className={styles.signInLink}>
              ورود | ثبت‌نام
            </a>
          </div>
        )}
      </div>
    </details>
  )
}

export default SuggestEdit
