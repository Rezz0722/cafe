'use client'

import { useState, type FormEvent } from 'react'
import { Switch } from '@/components/ui/Switch'
import { discountedPrice, faPercent, parseNumber, toman } from '@/lib/format'
import type { AdminMenuItem } from '@/data/adminSeed'
import { IconPencil, IconTrash } from './AdminIcons'
import fields from './adminFields.module.css'
import styles from './MenuItemCard.module.css'

interface MenuItemCardProps {
  item: AdminMenuItem
  onToggleActive: () => void
  onEdit: () => void
  onDelete: () => void
  /** Called only with a percentage the venue can actually charge (1–99). */
  onSetDiscount: (percent: number) => void
  onRemoveDiscount: () => void
}

export function MenuItemCard({
  item,
  onToggleActive,
  onEdit,
  onDelete,
  onSetDiscount,
  onRemoveDiscount,
}: MenuItemCardProps) {
  const [editingDiscount, setEditingDiscount] = useState(false)
  const [discountValue, setDiscountValue] = useState('')
  const [confirming, setConfirming] = useState(false)

  const hasDiscount = (item.discount ?? 0) > 0

  function submitDiscount(event: FormEvent) {
    event.preventDefault()
    const percent = parseNumber(discountValue)
    if (!Number.isNaN(percent) && percent > 0 && percent < 100) onSetDiscount(percent)
    setEditingDiscount(false)
    setDiscountValue('')
  }

  return (
    <li className={`${styles.card} ${item.active ? '' : styles.inactive}`}>
      <div className={styles.top}>
        <div className={styles.names}>
          <div className={styles.name}>{item.name}</div>
          {item.en && item.en.trim() !== '' && (
            <div className={styles.en} dir="ltr">
              {item.en}
            </div>
          )}
          <div className={styles.desc}>{item.desc || '—'}</div>
        </div>
        <Switch
          checked={Boolean(item.active)}
          onChange={onToggleActive}
          label={`نمایش ${item.name} در منو`}
        />
      </div>

      <div className={styles.priceRow}>
        {hasDiscount ? (
          <>
            <span className={styles.priceOld}>{toman(item.price)}</span>
            <span className={styles.priceNew}>
              {toman(discountedPrice(item.price, item.discount))}
            </span>
            <span className={styles.pctBadge}>{faPercent(item.discount ?? 0)}</span>
          </>
        ) : (
          <span className={styles.price}>{toman(item.price)}</span>
        )}
      </div>

      {editingDiscount && (
        <form className={styles.discBox} onSubmit={submitDiscount}>
          <label className={styles.discLabel} htmlFor={`disc-${item.id}`}>
            درصد تخفیف:
          </label>
          <input
            id={`disc-${item.id}`}
            className={styles.discInput}
            value={discountValue}
            onChange={(event) => setDiscountValue(event.target.value)}
            inputMode="numeric"
            placeholder="۲۰"
            autoFocus
          />
          <button type="submit" className={styles.discApply}>
            اعمال
          </button>
        </form>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.editButton} onClick={onEdit}>
          <IconPencil size={16} />
          ویرایش
        </button>
        <button
          type="button"
          className={`${styles.discButton} ${hasDiscount ? styles.discCancel : styles.discCreate}`}
          onClick={() => {
            if (hasDiscount) onRemoveDiscount()
            else setEditingDiscount(true)
          }}
        >
          {hasDiscount ? 'لغو تخفیف' : 'ایجاد تخفیف'}
        </button>
        <button
          type="button"
          className={styles.deleteButton}
          aria-label="حذف آیتم"
          onClick={() => setConfirming(true)}
        >
          <IconTrash size={17} />
        </button>
      </div>

      {confirming && (
        <div className={styles.confirmRow}>
          <span className={fields.confirmText}>این آیتم حذف شود؟</span>
          <div className={fields.confirmActions}>
            <button type="button" className={fields.confirmYes} onClick={onDelete}>
              حذف
            </button>
            <button
              type="button"
              className={fields.confirmNo}
              onClick={() => setConfirming(false)}
            >
              انصراف
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
