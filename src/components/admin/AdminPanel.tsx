'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconClock, IconGear, IconHome, IconImage, IconList, IconTag } from './AdminIcons'
import { DashboardTab } from './DashboardTab'
import { DiscountsTab } from './DiscountsTab'
import { HoursTab } from './HoursTab'
import { InfoTab } from './InfoTab'
import { MenuTab } from './MenuTab'
import { PhotosTab } from './PhotosTab'
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
  type AdminMenuCategory,
  type AdminOpeningHour,
  type AdminPromotion,
} from '@/data/adminSeed'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { devLoginUrl, paths } from '@/routes'
import styles from './AdminPanel.module.css'

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

/** Fallback for a session with no venue on it; the demo owner runs کافه رُف. */
const VENUE_NAME = 'کافه رُف'

/**
 * پنل مالک کافه.
 *
 * فقط نشست مالک اجازه‌ی ورود دارد؛ بقیه — چه واردنشده و چه مشتری — به صفحه‌ی
 * نام‌کاربری/رمز می‌روند که در هر دو حالت باز است، تا مشتری بتواند حساب عوض
 * کند و به بن‌بست نخورد. شرط به `ready` گره خورده، وگرنه در اولین رندر —
 * پیش از خوانده‌شدن localStorage — خودِ مالک هم بیرون انداخته می‌شود.
 *
 * ⚠️  بک‌اند وجود ندارد: همه‌ی تب‌ها یک کپی از `data/adminSeed` را در state
 * ویرایش می‌کنند و با رفرش صفحه تغییرات از بین می‌رود.
 */
export function AdminPanel() {
  const router = useRouter()
  const { user, isOwner, ready } = useAuth()
  const [tab, setTab] = useState<AdminTab>('dashboard')
  const [isOpen, setIsOpen] = useState(true)
  const [categories, setCategories] = useState<AdminMenuCategory[]>(SEED_CATEGORIES)
  const [photos, setPhotos] = useState<string[]>([])
  const [hours, setHours] = useState<AdminOpeningHour[]>(SEED_HOURS)
  const [contact, setContact] = useState<AdminContact>(SEED_CONTACT)
  const [tags, setTags] = useState<string[]>(SEED_TAGS)
  const [promotions, setPromotions] = useState<AdminPromotion[]>(SEED_PROMOTIONS)
  const saved = useToast()

  const bouncing = ready && !isOwner

  useEffect(() => {
    if (bouncing) router.replace(devLoginUrl(paths.admin))
  }, [bouncing, router])

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  if (!ready || !isOwner) return null

  return (
    <MobileShell className={styles.panel}>
      {/* ===== top bar ===== */}
      <header className={`${shellStyles.stickyTop} ${styles.topBar}`}>
        <div className={styles.topBarStart}>
          <Link href={paths.profile} className={styles.avatar} aria-label="بازگشت به پروفایل">
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
            venueName={user?.venue ?? VENUE_NAME}
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
