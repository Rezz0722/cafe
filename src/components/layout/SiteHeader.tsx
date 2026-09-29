'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, MapPin, UserRound } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { authUrl, paths } from '@/routes'
import { ThemeSwitcher } from '@/components/theme/ThemeSwitcher'
import styles from './SiteHeader.module.css'

const NAV_LINKS = [
  { label: 'کشف کافه', href: paths.search },
  { label: 'منو و قیمت', href: paths.menuHub },
  { label: 'محله‌ها', href: paths.districtHub },
  { label: 'برای کافه‌ها', href: '/#for-venues' },
]

interface Props {
  siteName?: string
}

function isCurrent(pathname: string, href: string): boolean {
  if (href === paths.home) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function SiteHeader({ siteName = 'کو کافه' }: Props) {
  const { isLoggedIn, user } = useAuth()
  const pathname = usePathname() ?? paths.home

  const accountLabel = isLoggedIn ? user?.name || 'پروفایل من' : 'ورود | ثبت‌نام'
  const accountTarget = isLoggedIn ? paths.profile : authUrl(pathname)

  return (
    <header className={styles.header}>
      <div className={`container ${styles.bar}`}>
        <Link href={paths.home} className={styles.brand} aria-label={`${siteName}، صفحه اصلی`}>
          <span className={styles.brandMark} aria-hidden="true">
            <img src="/brand/app-icon-192.png" alt="" width={192} height={192} />
          </span>
          <span className={styles.brandCopy}>
            <span className={styles.brandName}>{siteName}</span>
            <small>جای خوب پیدا می‌شود</small>
          </span>
        </Link>

        <nav className={styles.nav} aria-label="ناوبری اصلی">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isCurrent(pathname, link.href) ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className={styles.actions}>
          <ThemeSwitcher />
          <Link href={paths.districtHub} className={styles.city} aria-label="انتخاب محله در مشهد">
            <MapPin size={16} aria-hidden="true" />
            <span>مشهد</span>
            <ChevronDown size={14} aria-hidden="true" className={styles.cityCaret} />
          </Link>
          <Link
            href={accountTarget}
            className={`${styles.accountButton} ${isLoggedIn ? styles.accountLoggedIn : ''}`}
            aria-label={isLoggedIn ? `پروفایل ${accountLabel}` : accountLabel}
          >
            <span className={styles.accountIcon} aria-hidden="true"><UserRound size={17} /></span>
            <span className={styles.accountLabel}>{accountLabel}</span>
            {isLoggedIn && <ChevronDown size={14} aria-hidden="true" className={styles.accountCaret} />}
          </Link>
        </div>
      </div>
    </header>
  )
}
