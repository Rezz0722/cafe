import { CafePhoto } from '@/components/ui/CafePhoto'
import {
  IconChevronForward,
  IconClock,
  IconImage,
  IconList,
  IconPin,
  IconTag,
} from './AdminIcons'
import styles from './DashboardTab.module.css'

interface DashboardTabProps {
  venueName: string
  isOpen: boolean
  onToggleOpen: () => void
  onOpenMenu: () => void
  onOpenPhotos: () => void
  onOpenDiscounts: () => void
  onOpenHours: () => void
  onOpenInfo: () => void
}

export function DashboardTab({
  venueName,
  isOpen,
  onToggleOpen,
  onOpenMenu,
  onOpenPhotos,
  onOpenDiscounts,
  onOpenHours,
  onOpenInfo,
}: DashboardTabProps) {
  const shortcuts = [
    { label: 'ویرایش منو', tone: styles.toneMenu, icon: <IconList />, onClick: onOpenMenu },
    { label: 'افزودن عکس', tone: styles.tonePhoto, icon: <IconImage />, onClick: onOpenPhotos },
    { label: 'ثبت تخفیف', tone: styles.toneTag, icon: <IconTag />, onClick: onOpenDiscounts },
    { label: 'ساعت کاری', tone: styles.toneClock, icon: <IconClock />, onClick: onOpenHours },
  ]

  return (
    <div className={styles.tab}>
      {/* ===== cover ===== */}
      <div className={styles.cover}>
        <CafePhoto alt={`عکس کاور ${venueName}`} placeholder="عکس کاور کافه" loading="eager" />
        <div className={styles.coverShade} />
        <div className={styles.coverBar}>
          <div className={styles.coverName}>{venueName}</div>
          <button
            type="button"
            onClick={onToggleOpen}
            aria-pressed={isOpen}
            className={`${styles.statusPill} ${isOpen ? styles.statusOpen : styles.statusClosed}`}
          >
            {isOpen ? 'باز است' : 'بسته است'}
          </button>
        </div>
      </div>

      {/* ===== summary ===== */}
      <div className={styles.stats}>
        <div className={`${styles.stat} ${styles.statViews}`}>
          <div className={styles.statValue}>۱٬۲۴۰</div>
          <div className={styles.statLabel}>بازدید صفحه</div>
        </div>
        <div className={`${styles.stat} ${styles.statReviews}`}>
          <div className={styles.statValue}>۳</div>
          <div className={styles.statLabel}>نظر جدید</div>
        </div>
        <div className={`${styles.stat} ${styles.statRating}`}>
          <div className={styles.statValue}>۴٫۸</div>
          <div className={styles.statLabel}>امتیاز کافه</div>
        </div>
      </div>

      {/* ===== shortcuts ===== */}
      <h2 className={styles.sectionTitle}>میان‌برهای سریع</h2>
      <div className={styles.shortcuts}>
        {shortcuts.map((shortcut) => (
          <button
            key={shortcut.label}
            type="button"
            onClick={shortcut.onClick}
            className={styles.shortcut}
          >
            <span className={`${styles.shortcutIcon} ${shortcut.tone}`}>{shortcut.icon}</span>
            <span className={styles.shortcutLabel}>{shortcut.label}</span>
          </button>
        ))}
      </div>

      <button type="button" onClick={onOpenInfo} className={styles.infoRow}>
        <span className={styles.infoRowCopy}>
          <span className={styles.infoRowIcon}>
            <IconPin size={22} />
          </span>
          اطلاعات، آدرس و برچسب‌ها
        </span>
        <span className={styles.infoRowChevron}>
          <IconChevronForward size={20} />
        </span>
      </button>
    </div>
  )
}
