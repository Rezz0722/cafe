import { useId, useState, type FormEvent } from 'react'
import { BackChevron, shellStyles } from '@/components/layout/MobileShell'
import { CafePhoto } from '@/components/ui/CafePhoto'
import { parseNumber } from '@/lib/format'
import type { MenuCategory, MenuItem } from '@/types'
import fields from './adminFields.module.css'
import styles from './MenuItemForm.module.css'

/** What the form hands back once it is valid. `price` is already parsed. */
export interface MenuItemDraft {
  name: string
  en: string
  desc: string
  price: number
  catId: string
}

interface MenuItemFormProps {
  /** The item being edited, or null when adding. */
  item: MenuItem | null
  /** Category the form opens on — the item can be moved out of it on save. */
  catId: string
  categories: MenuCategory[]
  onCancel: () => void
  onSave: (draft: MenuItemDraft) => void
}

export function MenuItemForm({ item, catId, categories, onCancel, onSave }: MenuItemFormProps) {
  const id = useId()
  const [name, setName] = useState(item?.name ?? '')
  const [en, setEn] = useState(item?.en ?? '')
  const [desc, setDesc] = useState(item?.desc ?? '')
  const [price, setPrice] = useState(item ? String(item.price) : '')
  const [category, setCategory] = useState(catId)

  const parsedPrice = parseNumber(price)
  const canSave = name.trim() !== '' && !Number.isNaN(parsedPrice) && category !== ''

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSave) return
    onSave({
      name: name.trim(),
      en: en.trim(),
      desc: desc.trim(),
      price: parsedPrice,
      catId: category,
    })
  }

  return (
    <div className={styles.tab}>
      <div className={styles.head}>
        <button
          type="button"
          onClick={onCancel}
          aria-label="بازگشت"
          className={shellStyles.iconButton}
        >
          <BackChevron />
        </button>
        <h2 className={shellStyles.screenTitle}>{item ? 'ویرایش آیتم' : 'افزودن آیتم'}</h2>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div>
          <span className={fields.label}>عکس آیتم (اختیاری)</span>
          <div className={styles.photo}>
            <CafePhoto alt="" placeholder="آپلود عکس آیتم" />
          </div>
        </div>

        <div>
          <label className={fields.label} htmlFor={`${id}-name`}>
            نام آیتم (فارسی) *
          </label>
          <input
            id={`${id}-name`}
            className={fields.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثلاً: کاپوچینو"
            required
          />
        </div>

        <div>
          <label className={fields.label} htmlFor={`${id}-en`}>
            نام انگلیسی (اختیاری)
          </label>
          <input
            id={`${id}-en`}
            className={`${fields.input} ${fields.inputLtr}`}
            value={en}
            onChange={(e) => setEn(e.target.value)}
            placeholder="Cappuccino"
            dir="ltr"
          />
        </div>

        <div>
          <label className={fields.label} htmlFor={`${id}-desc`}>
            توضیح / مواد
          </label>
          <input
            id={`${id}-desc`}
            className={`${fields.input} ${styles.descInput}`}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="مثلاً: تک‌شات، دان مخصوص"
          />
        </div>

        <div>
          <label className={fields.label} htmlFor={`${id}-price`}>
            قیمت (تومان) *
          </label>
          <input
            id={`${id}-price`}
            className={`${fields.input} ${styles.priceInput}`}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="numeric"
            placeholder="۶۸۰۰۰"
            required
          />
        </div>

        <div>
          <label className={fields.label} htmlFor={`${id}-cat`}>
            دسته‌بندی
          </label>
          <select
            id={`${id}-cat`}
            className={fields.select}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className={shellStyles.primaryButton} disabled={!canSave}>
          ذخیرهٔ آیتم
        </button>
      </form>
    </div>
  )
}
