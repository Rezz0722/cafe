'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { House, Menu, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { authUrl, paths } from '@/routes'
import styles from './SiteHeader.module.css'

// لوگو از `public/` سرو می‌شود؛ در App Router دیگر import دارایی لازم نیست.
const LOGO_SRC = '/logo-sm.webp'

const NAV_LINKS = [
  { label: 'کشف', href: paths.search },
  /*
    «محله‌ها» به لندینگِ محله‌ها می‌رود.

    قبلاً به `paths.district('ahmadabad')` می‌رفت — یعنی کاربری که «محله‌ها»
    را می‌زد، سرِ *یک* محله‌ی مشخص درمی‌آمد و هیچ‌جا فهرست بقیه را نمی‌دید.
  */
  { label: 'محله‌ها', href: paths.districtHub },
  { label: 'دربارهٔ ما', href: paths.home },
  // «مشارکت» تا امروز به صفحه‌ی اصلی می‌رفت، یعنی کار نمی‌کرد. حالا صفحه‌ی
  // واقعی خودش را دارد و از آنجا کاربر به اصلاح اطلاعات کافه‌ها می‌رسد.
  { label: 'مشارکت', href: paths.contribute },
]

interface Props {
  /**
   * نام سایت — از تنظیمات پنل ادمین، از طریق `layout`.
   *
   * رشته‌ی ثابت نیست چون در هدر، فوتر، عنوان صفحه و OpenGraph تکرار می‌شود؛
   * وقتی نامِ برند از «کافه‌گرد» به «کو کافه» عوض شد، هر کدام جای خودش باید
   * پیدا می‌شد. پیش‌فرض دارد تا این کامپوننت جای دیگری هم قابل استفاده بماند.
   */
  siteName?: string
}

/** Sticky top bar. Collapses to a burger drawer below 760px. */
export function SiteHeader({ siteName = 'کو کافه' }: Props) {
  const { isLoggedIn, user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // A route change means the drawer's job is done.
  useEffect(() => setDrawerOpen(false), [pathname])

  // `usePathname` برخلاف `useLocation` کوئری‌استرینگ ندارد. برای بازگشت بعد از
  // ورود کافی است، و از `useSearchParams` پرهیز می‌کنیم چون کل هدر را وادار به
  // رندر کلاینتی صفحات استاتیک می‌کند.
  const accountLabel = isLoggedIn ? 'پروفایل من' : 'ورود | ثبت‌نام'
  const accountTarget = isLoggedIn ? paths.profile : authUrl(pathname ?? undefined)

  return (
    <header className={styles.header}>
      <div className={`container ${styles.bar}`}>
        <Link href={paths.home} className={styles.brand}>
          <img className={styles.logo} src={LOGO_SRC} alt={siteName} width={42} height={42} />
          <span className={styles.brandName}>{siteName}</span>
        </Link>

        <nav className={styles.nav} aria-label="ناوبری اصلی">
          {/*
            دکمه‌ی خانه، جدا از لوگو.

            لوگو هم به خانه می‌رود ولی همه این را نمی‌دانند — و کاربری که از
            گوگل مستقیم روی صفحه‌ی یک کافه آمده، صریح‌ترین راه برگشت را
            می‌خواهد. روی صفحه‌ی اصلی رندر نمی‌شود چون آنجا بی‌معنی است.
          */}
          {pathname !== paths.home && (
            <Link href={paths.home} className={styles.homeLink} aria-label="صفحه‌ی اصلی">
              <House size={17} aria-hidden="true" />
              <span>خانه</span>
            </Link>
          )}
          {NAV_LINKS.map((link) => (
            <Link key={link.label} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>

        {/*
          دیگر پرچم `ready` لازم نیست: نشست از layout سرور می‌آید، پس همین حالت
          در رندر سرور هم رندر می‌شود و نه چیزی «می‌پرد» و نه hydration به‌هم
          می‌ریزد. کاربری که هنوز نامش را ثبت نکرده، شماره‌اش را هم نداریم که
          نشان دهیم، پس «کاربر» می‌ماند.
        */}
        {isLoggedIn ? (
          <button
            type="button"
            className={styles.profileButton}
            onClick={() => router.push(paths.profile)}
          >
            <img className={styles.avatar} src={LOGO_SRC} alt="" width={32} height={32} />
            <span className={styles.profileName}>{user?.name || 'کاربر'}</span>
          </button>
        ) : (
          <button
            type="button"
            className={styles.loginButton}
            onClick={() => router.push(authUrl(pathname ?? undefined))}
          >
            ورود | ثبت‌نام
          </button>
        )}

        <button
          type="button"
          className={styles.burger}
          aria-label={drawerOpen ? 'بستن منو' : 'منو'}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((open) => !open)}
        >
          {drawerOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
      </div>

      {drawerOpen && (
        <div className={styles.drawer}>
          {pathname !== paths.home && (
            <Link href={paths.home} className={styles.drawerLink}>
              <House size={16} aria-hidden="true" />
              خانه
            </Link>
          )}
          {NAV_LINKS.map((link) => (
            <Link key={link.label} href={link.href} className={styles.drawerLink}>
              {link.label}
            </Link>
          ))}
          <Link href={accountTarget} className={styles.drawerCta}>
            {accountLabel}
          </Link>
        </div>
      )}
    </header>
  )
}
