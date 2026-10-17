'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { House, MapPinned, Search, UserRound } from 'lucide-react'
import { paths } from '@/routes'
import styles from './MobileBottomNav.module.css'

const ITEMS = [
  { label: 'خانه', href: paths.home, icon: House },
  { label: 'کشف', href: paths.search, icon: Search },
  { label: 'نقشه', href: paths.search + '?view=map', icon: MapPinned },
  { label: 'پروفایل', href: paths.profile, icon: UserRound },
]

export function MobileBottomNav() {
  const pathname = usePathname() ?? paths.home
  const isCafeDetail = /^\/cafe\/[^/]+\/?$/.test(pathname)

  if (pathname.startsWith(paths.admin) || pathname.startsWith(paths.auth) || isCafeDetail) return null

  return (
    <nav className={styles.nav} aria-label="دسترسی سریع موبایل">
      {ITEMS.map((item) => {
        const Icon = item.icon
        const current = item.href.includes('#')
          ? false
          : item.href === paths.home
          ? pathname === paths.home
          : !item.href.includes('?') && pathname.startsWith(item.href)

        return (
          <Link
            key={item.label}
            href={item.href}
            className={styles.item}
            aria-current={current ? 'page' : undefined}
          >
            <Icon size={20} strokeWidth={current ? 2.4 : 1.9} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
