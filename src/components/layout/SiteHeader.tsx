import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import logo from '@/assets/logo.png'
import { useAuth } from '@/hooks/useAuth'
import { authUrl, paths, searchUrl } from '@/routes'
import styles from './SiteHeader.module.css'

const NAV_LINKS = [
  { label: 'کشف', to: paths.search },
  { label: 'محله‌ها', to: searchUrl('احمدآباد') },
  { label: 'دربارهٔ ما', to: paths.home },
  { label: 'مشارکت', to: paths.home },
]

/** Sticky top bar. Collapses to a burger drawer below 760px. */
export function SiteHeader() {
  const { isLoggedIn, user } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // A route change means the drawer's job is done.
  useEffect(() => setDrawerOpen(false), [pathname])

  const accountLabel = isLoggedIn ? 'پروفایل من' : 'ورود | ثبت‌نام'
  const accountTarget = isLoggedIn ? paths.profile : authUrl(pathname)

  return (
    <header className={styles.header}>
      <div className={`container ${styles.bar}`}>
        <Link to={paths.home} className={styles.brand}>
          <img className={styles.logo} src={logo} alt="کافه‌گرد" width={42} height={42} />
          <span className={styles.brandName}>کافه‌گرد</span>
        </Link>

        <nav className={styles.nav} aria-label="ناوبری اصلی">
          {NAV_LINKS.map((link) => (
            <Link key={link.label} to={link.to}>
              {link.label}
            </Link>
          ))}
        </nav>

        {isLoggedIn ? (
          <button
            type="button"
            className={styles.profileButton}
            onClick={() => navigate(paths.profile)}
          >
            <img className={styles.avatar} src={logo} alt="" width={32} height={32} />
            <span className={styles.profileName}>{user?.name ?? 'کاربر'}</span>
          </button>
        ) : (
          <button
            type="button"
            className={styles.loginButton}
            onClick={() => navigate(authUrl(pathname))}
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
            <Link key={link.label} to={link.to} className={styles.drawerLink}>
              {link.label}
            </Link>
          ))}
          <Link to={accountTarget} className={styles.drawerCta}>
            {accountLabel}
          </Link>
        </div>
      )}
    </header>
  )
}
