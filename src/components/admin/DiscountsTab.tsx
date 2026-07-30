import type { Dispatch, SetStateAction } from 'react'
import { Switch } from '@/components/ui/Switch'
import { nextId, NEW_PROMOTION } from '@/data/adminSeed'
import type { Promotion } from '@/types'
import { IconClock, IconPlus } from './AdminIcons'
import fields from './adminFields.module.css'
import styles from './DiscountsTab.module.css'

interface DiscountsTabProps {
  promotions: Promotion[]
  setPromotions: Dispatch<SetStateAction<Promotion[]>>
}

export function DiscountsTab({ promotions, setPromotions }: DiscountsTabProps) {
  function toggle(id: string) {
    setPromotions((prev) =>
      prev.map((promo) => (promo.id !== id ? promo : { ...promo, active: !promo.active })),
    )
  }

  function add() {
    setPromotions((prev) => [...prev, { id: nextId('nd'), ...NEW_PROMOTION, active: true }])
  }

  return (
    <div className={styles.tab}>
      {promotions.length > 0 ? (
        <ul>
          {promotions.map((promo) => (
            <li
              key={promo.id}
              className={`${styles.card} ${promo.active ? styles.cardActive : styles.cardIdle}`}
            >
              <div className={styles.cardTop}>
                <div className={styles.cardCopy}>
                  <div className={styles.title}>{promo.title}</div>
                  <div className={styles.desc}>{promo.desc}</div>
                </div>
                <Switch
                  checked={promo.active}
                  onChange={() => toggle(promo.id)}
                  label={`فعال بودن ${promo.title}`}
                />
              </div>

              <div className={styles.meta}>
                <IconClock size={15} />
                {`${promo.range} · `}
                <span className={promo.active ? styles.stateOn : styles.stateOff}>
                  {promo.active ? 'فعال' : 'غیرفعال'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className={`${fields.emptyBox} ${styles.empty}`}>
          <div className={fields.emptyTitle}>هنوز تخفیفی نداری</div>
          <div className={fields.emptyText}>یک تخفیف جذاب مشتری‌های تازه میاره.</div>
        </div>
      )}

      <button type="button" className={styles.addButton} onClick={add}>
        <IconPlus size={20} />
        ثبت تخفیف جدید
      </button>
    </div>
  )
}
