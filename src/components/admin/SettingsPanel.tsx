'use client'

/**
 * تب تنظیمات پنل مدیریت.
 *
 * ═══ چرا فرم‌ها گروه‌به‌گروه هستند ═══
 *
 * یک فرم با ۷۰ فیلد یعنی هر «ذخیره» همه‌چیز را می‌نویسد و لاگ تغییرات
 * بی‌فایده می‌شود. با یک فرم برای هر گروه، هر ذخیره فقط همان چند کلید را
 * می‌فرستد و `audit_log` می‌گوید ادمین دقیقاً چه چیزی را عوض کرد.
 *
 * ═══ تله‌ی چک‌باکس ═══
 *
 * چک‌باکسِ خاموش در `FormData` **وجود ندارد** — نه با مقدار `false`، بلکه
 * اصلاً نیست. اگر سرور فقط کلیدهای موجود را ببیند، خاموش‌کردن هر سوئیچی
 * بی‌اثر می‌ماند. پس هر فیلد بولی نامش را در یک `input hidden name="__bool"`
 * هم اعلام می‌کند، تا سرور بداند «این کلید در فرم بود و خاموش است».
 *
 * ═══ هشدار بازمحاسبه ═══
 *
 * بعضی تنظیم‌ها (مرزهای قیمت، آستانه‌ی هزار‌تومانی، سقف facet پرمصرف) روی
 * ستون‌های **مشتق** اثر دارند که یک‌بار محاسبه و ذخیره شده‌اند. ذخیره‌ی آن‌ها
 * بدون اجرای عملیاتِ بازمحاسبه، ادمین را فریب می‌دهد: عدد در فرم عوض شده
 * ولی سایت همان‌طور است. پس روی همان فیلد هشدار داده می‌شود.
 */

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { resetSettingsAction, saveSettingsAction } from '@/app/admin/actions'
import { EMPTY_ADMIN_STATE, type AdminActionState } from '@/app/admin/state'
import {
  GROUP_HINTS,
  GROUP_LABELS,
  SETTING_DEFS,
  type SettingDef,
  type SettingGroup,
} from '@/core/settings/registry'
import styles from './SettingsPanel.module.css'
import { TriangleAlert } from 'lucide-react'

const GROUP_ORDER: SettingGroup[] = [
  'identity',
  'locale',
  'auth',
  'moderation',
  'discovery',
  'map',
  'data',
  'analytics',
]

const RECOMPUTE_NOTE: Record<NonNullable<SettingDef['needsRecompute']>, string> = {
  derived: 'بعد از ذخیره، «بازمحاسبه‌ی مقادیر مشتق» را از تب عملیات اجرا کنید.',
  facets: 'بعد از ذخیره، `npm run build:facets` را اجرا کنید.',
  restart: 'فقط روی ایمپورت بعدی اثر دارد؛ داده‌ی موجود عوض نمی‌شود.',
}

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={styles.save} disabled={pending}>
      {pending ? 'در حال ذخیره…' : 'ذخیره'}
    </button>
  )
}

function ResetButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={styles.reset} disabled={pending}>
      {pending ? '…' : 'بازگردانی به پیش‌فرض'}
    </button>
  )
}

function Field({
  def,
  value,
  error,
  overridden,
}: {
  def: SettingDef
  value: string | number | boolean
  error?: string
  overridden: boolean
}) {
  const id = `setting-${def.key}`

  if (def.type === 'boolean') {
    return (
      <div className={styles.fieldRow}>
        <label className={styles.switchLabel} htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            name={def.key}
            defaultChecked={value === true}
            className={styles.switch}
          />
          <span className={styles.switchText}>
            {def.label}
            {overridden && <span className={styles.changed}>تغییر داده شده</span>}
          </span>
        </label>
        {/* بدون این خط، خاموش‌کردن سوئیچ به سرور نمی‌رسد. */}
        <input type="hidden" name="__bool" value={def.key} />
        {def.hint && <p className={styles.hint}>{def.hint}</p>}
        {error && <p className={styles.fieldError}>{error}</p>}
      </div>
    )
  }

  return (
    <div className={styles.fieldRow}>
      <label className={styles.label} htmlFor={id}>
        {def.label}
        {def.unit && <span className={styles.unit}>({def.unit})</span>}
        {overridden && <span className={styles.changed}>تغییر داده شده</span>}
      </label>

      {def.type === 'select' ? (
        <select
          id={id}
          name={def.key}
          defaultValue={String(value)}
          className={styles.input}
        >
          {def.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : def.type === 'text' ? (
        <textarea
          id={id}
          name={def.key}
          defaultValue={String(value)}
          rows={2}
          className={styles.textarea}
        />
      ) : (
        <input
          id={id}
          name={def.key}
          type={def.type === 'number' ? 'number' : 'text'}
          defaultValue={String(value)}
          min={def.min}
          max={def.max}
          step={def.step ?? (def.type === 'number' ? 1 : undefined)}
          dir={def.type === 'number' ? 'ltr' : undefined}
          className={styles.input}
        />
      )}

      {def.hint && <p className={styles.hint}>{def.hint}</p>}
      {def.needsRecompute && (
        <p className={styles.recompute}>
                  <TriangleAlert size={14} aria-hidden="true" />{' '}
                  {RECOMPUTE_NOTE[def.needsRecompute]}
                </p>
      )}
      {error && <p className={styles.fieldError}>{error}</p>}
    </div>
  )
}

function GroupFeedback({ state }: { state: AdminActionState }) {
  if (state.error) return <p className={styles.error}>{state.error}</p>
  if (state.ok && state.message) return <p className={styles.success}>{state.message}</p>
  return null
}

function GroupForm({
  group,
  values,
  overridden,
}: {
  group: SettingGroup
  values: Record<string, string | number | boolean>
  overridden: Set<string>
}) {
  const [saveState, saveAction] = useActionState(saveSettingsAction, EMPTY_ADMIN_STATE)
  const [resetState, resetAction] = useActionState(resetSettingsAction, EMPTY_ADMIN_STATE)
  const defs = SETTING_DEFS.filter((def) => def.group === group)
  const hint = GROUP_HINTS[group]

  return (
    <section className={styles.group}>
      <header className={styles.groupHead}>
        <h3>{GROUP_LABELS[group]}</h3>
        {hint && <p className={styles.groupHint}>{hint}</p>}
      </header>

      <GroupFeedback state={saveState} />
      <GroupFeedback state={resetState} />

      <form action={saveAction} className={styles.form}>
        <input type="hidden" name="__group" value={group} />
        <div className={styles.fields}>
          {defs.map((def) => (
            <Field
              key={def.key}
              def={def}
              value={values[def.key] ?? ''}
              error={saveState.fieldErrors?.[def.key]}
              overridden={overridden.has(def.key)}
            />
          ))}
        </div>
        <SaveButton />
      </form>

      <form action={resetAction} className={styles.resetForm}>
        <input type="hidden" name="group" value={group} />
        <ResetButton />
      </form>
    </section>
  )
}

export interface SettingsPanelProps {
  values: Record<string, string | number | boolean>
  /** کلیدهایی که در دیتابیس ردیف دارند — یعنی از پیش‌فرض فاصله گرفته‌اند. */
  overriddenKeys: string[]
  updatedAt: string | null
}

export function SettingsPanel({ values, overriddenKeys, updatedAt }: SettingsPanelProps) {
  const overridden = new Set(overriddenKeys)
  const [open, setOpen] = useState<SettingGroup>('identity')

  return (
    <div className={styles.wrap}>
      <p className={styles.intro}>
        هر تنظیمی که در دیتابیس ردیف نداشته باشد، پیش‌فرضِ کد را می‌گیرد. جدول تنظیمات فقط
        <b> تفاوت‌ها</b> را نگه می‌دارد، پس «بازگردانی به پیش‌فرض» یعنی پاک‌کردن آن
        ردیف‌ها.
        {updatedAt && <> آخرین تغییر: {updatedAt}</>}
      </p>

      <nav className={styles.groupTabs}>
        {GROUP_ORDER.map((group) => {
          const count = SETTING_DEFS.filter(
            (def) => def.group === group && overridden.has(def.key),
          ).length
          return (
            <button
              key={group}
              type="button"
              className={open === group ? styles.groupTabOn : styles.groupTab}
              onClick={() => setOpen(group)}
            >
              {GROUP_LABELS[group]}
              {count > 0 && <span className={styles.groupBadge}>{count}</span>}
            </button>
          )
        })}
      </nav>

      {/*
        فقط گروه باز رندر می‌شود. رندرِ هر هشت گروه یعنی هشت فرم با ۷۰ ورودی
        در DOM، و مهم‌تر: `defaultValue`ها بعد از ذخیره بیات می‌مانند چون فرمِ
        پنهان دوباره mount نمی‌شود.
      */}
      <GroupForm key={open} group={open} values={values} overridden={overridden} />
    </div>
  )
}

export default SettingsPanel
