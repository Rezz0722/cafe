'use client'

import Link from 'next/link'
import { Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { House, MapPinned, Search, UserRound } from 'lucide-react'
import { paths } from '@/routes'
import styles from './MobileBottomNav.module.css'
import { mobileBottomNavHref } from './mobileBottomNavState'

const ITEMS = [
  { label: 'خانه', href: paths.home, icon: House },
  { label: 'کشف', href: paths.search, icon: Search },
  { label: 'نقشه', href: paths.search + '?view=map', icon: MapPinned },
  { label: 'پروفایل', href: paths.profile, icon: UserRound },
]

export function MobileBottomNav() {
  return <Suspense fallback={null}><MobileBottomNavContent /></Suspense>
}

function MobileBottomNavContent() {
  const pathname = usePathname() ?? paths.home
  const searchParams = useSearchParams()
  const currentHref = mobileBottomNavHref(pathname, searchParams.get('view'))
  const isCafeDetail = /^\/cafe\/[^/]+\/?$/.test(pathname)

  if (pathname.startsWith(paths.admin) || pathname.startsWith(paths.auth) || isCafeDetail) return null

  return (
    <nav className={styles.nav} aria-label="دسترسی سریع موبایل">
      {ITEMS.map((item) => {
        const Icon = item.icon
        const current = item.href === currentHref

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
