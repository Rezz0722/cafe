import { useId, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { shellStyles } from '@/components/layout/MobileShell'
import { Chip } from '@/components/ui/Chip'
import type { AdminContact } from '@/data/adminSeed'
import { OWNER_TAGS } from '@/data/taxonomy'
import fields from './adminFields.module.css'
import styles from './InfoTab.module.css'

interface InfoTabProps {
  contact: AdminContact
  setContact: Dispatch<SetStateAction<AdminContact>>
  /** Owner tags currently switched on. */
  tags: string[]
  onToggleTag: (tag: string) => void
  onSave: () => void
}

export function InfoTab({ contact, setContact, tags, onToggleTag, onSave }: InfoTabProps) {
  const id = useId()

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSave()
  }

  return (
    <form className={styles.tab} onSubmit={handleSubmit}>
      <h2 className={`${fields.sectionTitle} ${styles.contactTitle}`}>اطلاعات تماس</h2>

      <div className={styles.contactFields}>
        <div>
          <label className={fields.label} htmlFor={`${id}-phone`}>
            شمارهٔ تماس
          </label>
          <input
            id={`${id}-phone`}
            className={`${fields.input} ${fields.inputSoft}`}
            value={contact.phone}
            onChange={(event) => setContact((prev) => ({ ...prev, phone: event.target.value }))}
          />
        </div>
        <div>
          <label className={fields.label} htmlFor={`${id}-address`}>
            آدرس
          </label>
          <input
            id={`${id}-address`}
            className={`${fields.input} ${fields.inputSoft}`}
            value={contact.address}
            onChange={(event) => setContact((prev) => ({ ...prev, address: event.target.value }))}
          />
        </div>
        <div>
          <label className={fields.label} htmlFor={`${id}-instagram`}>
            اینستاگرام
          </label>
          <input
            id={`${id}-instagram`}
            className={`${fields.input} ${fields.inputSoft} ${styles.handle}`}
            value={contact.instagram}
            onChange={(event) => setContact((prev) => ({ ...prev, instagram: event.target.value }))}
            dir="ltr"
          />
        </div>
      </div>

      <h2 className={`${fields.sectionTitle} ${styles.tagsTitle}`}>برچسب‌های کافه</h2>
      <p className={`${fields.note} ${styles.tagsNote}`}>
        مشخص کن کافه‌ات برای چه موقعیت‌هایی مناسبه.
      </p>

      <div className={styles.tags}>
        {OWNER_TAGS.map((tag) => {
          const selected = tags.includes(tag)
          return (
            <Chip
              key={tag}
              label={selected ? `✓ ${tag}` : tag}
              selected={selected}
              onClick={() => onToggleTag(tag)}
            />
          )
        })}
      </div>

      <button type="submit" className={`${shellStyles.primaryButton} ${styles.save}`}>
        ذخیرهٔ تغییرات
      </button>
    </form>
  )
}
