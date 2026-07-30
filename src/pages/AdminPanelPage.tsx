import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  IconClock,
  IconGear,
  IconHome,
  IconImage,
  IconList,
  IconTag,
} from '@/components/admin/AdminIcons'
import { DashboardTab } from '@/components/admin/DashboardTab'
import { DiscountsTab } from '@/components/admin/DiscountsTab'
import { HoursTab } from '@/components/admin/HoursTab'
import { InfoTab } from '@/components/admin/InfoTab'
import { MenuTab } from '@/components/admin/MenuTab'
import { PhotosTab } from '@/components/admin/PhotosTab'
import { MobileShell, shellStyles } from '@/components/layout/MobileShell'
import { CafePhoto } from '@/components/ui/CafePhoto'
import { Toast } from '@/components/ui/Toast'
import {
  SEED_CATEGORIES,
  SEED_CONTACT,
  SEED_HOURS,
  SEED_PROMOTIONS,
  SEED_TAGS,
  type AdminContact,
} from '@/data/adminSeed'
import { useToast } from '@/hooks/useToast'
import { paths } from '@/routes'
import type { MenuCategory, OpeningHour, Promotion } from '@/types'
import styles from './AdminPanelPage.module.css'

type AdminTab = 'dashboard' | 'menu' | 'photos' | 'hours' | 'info' | 'discounts'

const TAB_TITLES: Record<AdminTab, string> = {
  dashboard: 'داشبورد',
  menu: 'مدیریت منو',
  photos: 'عکس‌ها و کاور',
  hours: 'ساعت کاری',
  info: 'اطلاعات و برچسب‌ها',
  discounts: 'تخفیف‌ها',
}

/** The bottom bar covers five of the six tabs; «اطلاعات» opens from the header. */
const NAV_ITEMS: { tab: AdminTab; label: string; icon: ReactNode }[] = [
  { tab: 'dashboard', label: 'خانه', icon: <IconHome /> },
  { tab: 'menu', label: 'منو', icon: <IconList /> },
  { tab: 'photos', label: 'عکس‌ها', icon: <IconImage /> },
  { tab: 'hours', label: 'ساعت', icon: <IconClock /> },
  { tab: 'discounts', label: 'تخفیف', icon: <IconTag /> },
]

/** The panel edits a single venue; in this demo the owner runs کافه رُف. */
const VENUE_NAME = 'کافه رُف'

export function AdminPanelPage() {
  const [tab, setTab] = useState<AdminTab>('dashboard')
  const [isOpen, setIsOpen] = useState(true)
  const [categories, setCategories] = useState<MenuCategory[]>(SEED_CATEGORIES)
  const [photos, setPhotos] = useState<string[]>([])
  const [hours, setHours] = useState<OpeningHour[]>(SEED_HOURS)
  const [contact, setContact] = useState<AdminContact>(SEED_CONTACT)
  const [tags, setTags] = useState<string[]>(SEED_TAGS)
  const [promotions, setPromotions] = useState<Promotion[]>(SEED_PROMOTIONS)
  const saved = useToast()

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  return (
    <MobileShell className={styles.panel}>
      {/* ===== top bar ===== */}
      <header className={`${shellStyles.stickyTop} ${styles.topBar}`}>
        <div className={styles.topBarStart}>
          <Link to={paths.profile} className={styles.avatar} aria-label="بازگشت به پروفایل">
            <CafePhoto alt="" loading="eager" />
          </Link>
          <h1 className={shellStyles.screenTitle}>{TAB_TITLES[tab]}</h1>
        </div>
        <button
          type="button"
          className={shellStyles.iconButton}
          aria-label="اطلاعات و تنظیمات"
          onClick={() => setTab('info')}
        >
          <IconGear size={21} />
        </button>
      </header>

      <main className={styles.screen}>
        {tab === 'dashboard' && (
          <DashboardTab
            venueName={VENUE_NAME}
            isOpen={isOpen}
            onToggleOpen={() => setIsOpen((open) => !open)}
            onOpenMenu={() => setTab('menu')}
            onOpenPhotos={() => setTab('photos')}
            onOpenDiscounts={() => setTab('discounts')}
            onOpenHours={() => setTab('hours')}
            onOpenInfo={() => setTab('info')}
          />
        )}

        {tab === 'menu' && <MenuTab categories={categories} setCategories={setCategories} />}

        {tab === 'photos' && <PhotosTab photos={photos} setPhotos={setPhotos} />}

        {tab === 'hours' && <HoursTab hours={hours} setHours={setHours} onSave={saved.show} />}

        {tab === 'info' && (
          <InfoTab
            contact={contact}
            setContact={setContact}
            tags={tags}
            onToggleTag={toggleTag}
            onSave={saved.show}
          />
        )}

        {tab === 'discounts' && (
          <DiscountsTab promotions={promotions} setPromotions={setPromotions} />
        )}
      </main>

      <Toast visible={saved.visible} message="✓ ذخیره شد" />

      {/* ===== bottom nav ===== */}
      <nav className={styles.bottomNav} aria-label="بخش‌های پنل مدیریت">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.tab}
            type="button"
            onClick={() => setTab(item.tab)}
            aria-pressed={tab === item.tab}
            className={`${styles.navButton} ${tab === item.tab ? styles.navActive : ''}`}
          >
            {item.icon}
            <span className={styles.navLabel}>{item.label}</span>
          </button>
        ))}
      </nav>
    </MobileShell>
  )
}
