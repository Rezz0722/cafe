import { useId, type Dispatch, type SetStateAction } from 'react'
import { shellStyles } from '@/components/layout/MobileShell'
import { TIME_OPTIONS } from '@/data/taxonomy'
import type { OpeningHour } from '@/types'
import fields from './adminFields.module.css'
import styles from './HoursTab.module.css'

interface HoursTabProps {
  hours: OpeningHour[]
  setHours: Dispatch<SetStateAction<OpeningHour[]>>
  onSave: () => void
}

export function HoursTab({ hours, setHours, onSave }: HoursTabProps) {
  const id = useId()

  function patchDay(index: number, patch: Partial<OpeningHour>) {
    setHours((prev) => prev.map((hour, i) => (i !== index ? hour : { ...hour, ...patch })))
  }

  return (
    <div className={styles.tab}>
      <p className={`${fields.note} ${styles.intro}`}>برای هر روز ساعت باز و بسته رو تنظیم کن.</p>

      {hours.map((hour, index) => (
        <div key={hour.day} className={styles.dayCard}>
          <div className={styles.dayHead}>
            <div className={styles.dayName}>{hour.day}</div>
            <button
              type="button"
              aria-pressed={!hour.closed}
              onClick={() => patchDay(index, { closed: !hour.closed })}
              className={`${styles.statePill} ${
                hour.closed ? styles.stateClosed : styles.stateOpen
              }`}
            >
              {hour.closed ? 'تعطیل' : 'باز'}
            </button>
          </div>

          {!hour.closed && (
            <>
              <div className={styles.range}>
                <label className={styles.rangeLabel} htmlFor={`${id}-from-${index}`}>
                  از
                </label>
                <select
                  id={`${id}-from-${index}`}
                  className={styles.timeSelect}
                  value={hour.from}
                  onChange={(event) => patchDay(index, { from: event.target.value })}
                >
                  {TIME_OPTIONS.map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
                <label className={styles.rangeLabel} htmlFor={`${id}-to-${index}`}>
                  تا
                </label>
                <select
                  id={`${id}-to-${index}`}
                  className={styles.timeSelect}
                  value={hour.to}
                  onChange={(event) => patchDay(index, { to: event.target.value })}
                >
                  {TIME_OPTIONS.map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </div>

              <label className={styles.midnight}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={Boolean(hour.afterMidnight)}
                  onChange={(event) => patchDay(index, { afterMidnight: event.target.checked })}
                />
                باز تا بعد از نیمه‌شب
              </label>
            </>
          )}
        </div>
      ))}

      <button type="button" className={shellStyles.primaryButton} onClick={onSave}>
        ذخیرهٔ ساعت کاری
      </button>
    </div>
  )
}
