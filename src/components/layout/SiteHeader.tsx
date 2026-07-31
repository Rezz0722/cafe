'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { authUrl, paths } from '@/routes'
import styles from './SiteHeader.module.css'

// لوگو از `public/` سرو می‌شود؛ در App Router دیگر import دارایی لازم نیست.
const LOGO_SRC = '/logo-sm.webp'

const NAV_LINKS = [
  { label: 'کشف', href: paths.search },
  // «محله‌ها» حالا به صفحه‌ی واقعی محله می‌رود، نه به جست‌وجوی متنی.
  { label: 'محله‌ها', href: paths.district('ahmadabad') },
  { label: 'دربارهٔ ما', href: paths.home },
  { label: 'مشارکت', href: paths.home },
]

/** Sticky top bar. Collapses to a burger drawer below 760px. */
export function SiteHeader() {
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
          <img className={styles.logo} src={LOGO_SRC} alt="کافه‌گرد" width={42} height={42} />
          <span className={styles.brandName}>کافه‌گرد</span>
        </Link>

        <nav className={styles.nav} aria-label="ناوبری اصلی">
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
          aria-label="منو"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((open) => !open)}
        >
          ☰
        </button>
      </div>

      {drawerOpen && (
        <div className={styles.drawer}>
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
