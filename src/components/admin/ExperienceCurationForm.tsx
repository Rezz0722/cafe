'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronLeft, ChevronRight, CircleHelp, Save } from 'lucide-react'
import { saveExperienceCurationAction } from '@/app/admin/experiences/actions'
import { EMPTY_EXPERIENCE_CURATION_STATE } from '@/app/admin/experiences/state'
import styles from './ExperienceCuration.module.css'

interface AttributeField {
  id: string
  label: string
  hint?: string
  value: number | null
}

interface ExperienceField {
  slug: string
  title: string
  question: string
  attribute: AttributeField
}

const OPTIONS = [
  { value: '', label: 'نامشخص' },
  { value: '0', label: 'خیر' },
  { value: '1', label: 'نسبی' },
  { value: '2', label: 'بله' },
] as const

function AttributeRadios({ field }: { field: AttributeField }) {
  const current = field.value === null ? '' : String(field.value)
  return (
    <fieldset className={styles.attributeField}>
      <legend>
        <strong>{field.label}</strong>
        {field.hint && <small>{field.hint}</small>}
      </legend>
      <div className={styles.optionRow}>
        {OPTIONS.map((option) => (
          <label key={option.value || 'unknown'} data-value={option.value || 'unknown'}>
            <input
              type="radio"
              name={`attr_${field.id}`}
              value={option.value}
              defaultChecked={current === option.value}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function ExperienceCurationForm({
  placeId,
  revision,
  nextPlaceId,
  previousHref,
  experiences,
  supporting,
  filters,
}: {
  placeId: number
  revision: number
  nextPlaceId: number | null
  previousHref: string | null
  experiences: ExperienceField[]
  supporting: AttributeField[]
  filters: { status: string; district: string; query: string }
}) {
  const router = useRouter()
  const [state, action, pending] = useActionState(
    saveExperienceCurationAction,
    EMPTY_EXPERIENCE_CURATION_STATE,
  )

  useEffect(() => {
    if (!state.ok || !state.navigateTo || !state.savedAt) return
    router.push(state.navigateTo)
    router.refresh()
  }, [router, state.navigateTo, state.ok, state.savedAt])

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="placeId" value={placeId} />
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="nextPlaceId" value={nextPlaceId ?? ''} />
      <input type="hidden" name="filterStatus" value={filters.status} />
      <input type="hidden" name="filterDistrict" value={filters.district} />
      <input type="hidden" name="filterQuery" value={filters.query} />

      <div className={styles.primaryGrid}>
        {experiences.map((experience) => (
          <section className={styles.experienceField} key={experience.slug}>
            <span className={styles.number}><Check size={14} /></span>
            <div>
              <h3>{experience.title}</h3>
              <p>{experience.question}</p>
              <AttributeRadios field={experience.attribute} />
            </div>
          </section>
        ))}
      </div>

      <details className={styles.supporting}>
        <summary><CircleHelp size={17} /> شواهد کمکی برای دلیل پیشنهاد</summary>
        <p>این موارد اجباری نیستند؛ هرچه دقیق‌تر ثبت شوند، دلیل پیشنهاد روی کارت مفیدتر می‌شود.</p>
        <div className={styles.supportingGrid}>
          {supporting.map((field) => <AttributeRadios key={field.id} field={field} />)}
        </div>
      </details>

      {state.error && <p className={styles.error} role="alert">{state.error}</p>}
      {state.ok && state.message && <p className={styles.success}>{state.message}</p>}

      <label className={styles.evidenceNote}>
        <span>یادداشت شاهد <small>در تاریخچه مدیریت ذخیره می‌شود</small></span>
        <textarea name="evidenceNote" maxLength={500} rows={2} placeholder="مثلاً: بررسی تصاویر ثبت‌شده و توضیحات رسمی کافه؛ یا تاریخ و نتیجه بازدید میدانی" />
      </label>

      <footer className={styles.actions}>
        {previousHref ? (
          <button type="button" className={styles.secondary} onClick={() => router.push(previousHref)}>
            <ChevronRight size={16} /> قبلی
          </button>
        ) : <span />}
        <div className={styles.saveGroup}>
          <label className={styles.sourceSelect}>
            <span>منبع بررسی</span>
            <select name="source" defaultValue="editorial">
              <option value="editorial">بررسی تحریریه</option>
              <option value="field_visit">بازدید میدانی</option>
            </select>
          </label>
          <button type="submit" className={styles.save} disabled={pending}>
            {pending ? 'در حال ذخیره…' : nextPlaceId ? 'ذخیره و کافه بعدی' : 'ذخیره'}
            {nextPlaceId ? <ChevronLeft size={17} /> : <Save size={17} />}
          </button>
        </div>
      </footer>
    </form>
  )
}
