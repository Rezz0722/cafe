'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
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
  SEED_PROMOTIONS,
  SEED_TAGS,
  type AdminContact,
  type AdminMenuCategory,
  type AdminOpeningHour,
  type AdminPromotion,
} from '@/data/adminSeed'
import { useToast } from '@/hooks/useToast'
import { paths } from '@/routes'
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

/**
 * کافه‌ی مالک، در همان شکلی که پنل لازم دارد.
 *
 * کل `PlaceView` رد نمی‌شود: نظرها، منشأ داده و منوی کامل با خودش می‌آید و
 * چون این کامپوننت کلاینت است، همه‌ی آن در payload صفحه سریالایز می‌شد.
 */
export interface OwnerVenue {
  slug: string
  name: string
  districtName: string
  photo?: string
  /** میانگین خام، فقط برای نمایش. */
  rating: number
  reviewCount: number
  /** ۰..۱۰۰ کامل‌بودن پروفایل — همان عددی که ادمین در صف می‌بیند. */
  qualityScore: number
  isOpenNow: boolean
  contact: AdminContact
  hours: AdminOpeningHour[]
}

/**
 * پنل مالک کافه.
 *
 * نگهبانی اینجا نیست: صفحه‌ی سرور با `requireOwner` جلوی ورود را می‌گیرد.
 * نگهبانِ کلاینتی قبلی (redirect داخل `useEffect`) هم دیر می‌رسید — محتوا
 * یک لحظه رندر می‌شد — و هم با یک خط در کنسول دور زدنی بود.
 *
 * ⚠️  فقط داشبورد و اطلاعات تماس از کافه‌ی واقعی می‌آیند. تب‌های منو، عکس و
 * تخفیف هنوز روی `data/adminSeed` کار می‌کنند و هیچ‌کدام ذخیره نمی‌شوند؛
 * همین را بالای پنل به مالک هم می‌گوییم، چون پنلی که وانمود کند ذخیره کرده
 * از نبودِ پنل بدتر است.
 */
export function AdminPanel({ venue }: { venue: OwnerVenue | null }) {
  const [tab, setTab] = useState<AdminTab>('dashboard')
  const [isOpen, setIsOpen] = useState(venue?.isOpenNow ?? false)
  const [categories, setCategories] = useState<AdminMenuCategory[]>(SEED_CATEGORIES)
  const [photos, setPhotos] = useState<string[]>(venue?.photo ? [venue.photo] : [])
  const [hours, setHours] = useState<AdminOpeningHour[]>(venue?.hours ?? [])
  const [contact, setContact] = useState<AdminContact>(
    venue?.contact ?? { phone: '', address: '', instagram: '' },
  )
  const [tags, setTags] = useState<string[]>(SEED_TAGS)
  const [promotions, setPromotions] = useState<AdminPromotion[]>(SEED_PROMOTIONS)
  const saved = useToast()

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  if (!venue) return <NoVenue />

  return (
    <MobileShell className={styles.panel}>
      {/* ===== top bar ===== */}
      <header className={`${shellStyles.stickyTop} ${styles.topBar}`}>
        <div className={styles.topBarStart}>
          <Link href={paths.profile} className={styles.avatar} aria-label="بازگشت به پروفایل">
            <CafePhoto alt="" src={venue.photo} loading="eager" />
          </Link>
          <h1 className={shellStyles.screenTitle}>{TAB_TITLES[tab]}</h1>
        </div>
        <div className={styles.topBarEnd}>
          {/* دیدن صفحه‌ی عمومی، پرتکرارترین کاری است که مالک می‌خواهد بکند. */}
          <Link href={paths.cafe(venue.slug)} target="_blank" className={styles.addLink}>
            صفحه‌ی عمومی
          </Link>
          <button
            type="button"
            className={shellStyles.iconButton}
            aria-label="اطلاعات و تنظیمات"
            onClick={() => setTab('info')}
          >
            <IconGear size={21} />
          </button>
        </div>
      </header>

      <p className={styles.mockNotice}>
        این پنل هنوز به سرور وصل نیست: هر تغییری که اینجا بدهید با رفرش صفحه از
        بین می‌رود و در صفحه‌ی عمومی کافه دیده نمی‌شود.
      </p>

      <main className={styles.screen}>
        {tab === 'dashboard' && (
          <DashboardTab
            venueName={venue.name}
            districtName={venue.districtName}
            photo={venue.photo}
            rating={venue.rating}
            reviewCount={venue.reviewCount}
            qualityScore={venue.qualityScore}
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

      {/* پیام تُست عمداً «ذخیره نشد» را تکرار نمی‌کند؛ نوار بالا آن را گفته. */}
      <Toast visible={saved.visible} message="✓ در این صفحه اعمال شد" />

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

/**
 * مالکی که هنوز هیچ کافه‌ای ندارد.
 *
 * حالت واقعی است، نه خطا: نقش «مالک» را ادمین می‌دهد و ممکن است هنوز کافه‌ای
 * به حسابش وصل نکرده باشد. پنل خالی بهتر از کرش است، به‌شرطی که بگوید قدم
 * بعدی چیست.
 */
function NoVenue() {
  return (
    <MobileShell>
      <div className={styles.claim}>
        <h1 className={styles.claimTitle}>هنوز کافه‌ای به حساب شما وصل نیست</h1>
        <p className={styles.claimText}>
          برای مدیریت یک کافه، اول باید مالکیتش تأیید شود. صفحه‌ی کافه‌تان را در
          کافه‌گرد پیدا کنید و درخواست مالکیت بدهید؛ تأیید نهایی با ادمین است و
          بعد از آن همین صفحه پنل کافه‌ی شما می‌شود.
        </p>
        <p className={styles.claimText}>
          اگر قبلاً درخواست داده‌اید، احتمالاً هنوز بررسی نشده. کافه‌تان اصلاً در
          کافه‌گرد نیست؟ به ما بگویید تا ثبتش کنیم.
        </p>
        <div className={styles.claimActions}>
          <Link
            href={paths.search}
            className={`${shellStyles.primaryButton} ${styles.claimPrimary}`}
          >
            پیدا کردن کافه‌ام
          </Link>
          <Link href={paths.profile} className={styles.claimSecondary}>
            بازگشت به پروفایل
          </Link>
        </div>
      </div>
    </MobileShell>
  )
}
