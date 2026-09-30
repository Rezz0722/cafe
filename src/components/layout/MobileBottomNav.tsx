'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Scale, House, MapPinned, MessageSquareText, Navigation, Search, UtensilsCrossed, UserRound } from 'lucide-react'
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

  if (pathname.startsWith(paths.admin) || pathname.startsWith(paths.auth)) return null

  const items = pathname.startsWith('/cafe/')
    ? [
        { label: 'مقایسه', href: `${pathname}#price-compare`, icon: Scale },
        { label: 'منو', href: `${pathname}#menu`, icon: UtensilsCrossed },
        { label: 'مسیریابی', href: `${pathname}#directions`, icon: Navigation },
        { label: 'نظرها', href: `${pathname}#reviews`, icon: MessageSquareText },
      ]
    : ITEMS

  return (
    <nav className={styles.nav} aria-label="دسترسی سریع موبایل">
      {items.map((item) => {
        const Icon = item.icon
        const opensCafeMenu = pathname.startsWith('/cafe/') && item.label === 'منو'
        if(pathname.startsWith('/cafe/') && item.label==='مقایسه') return <button key={item.label} type="button" className={styles.item} onClick={()=>document.querySelector<HTMLButtonElement>('#price-compare button')?.click()}><Icon size={20} aria-hidden="true"/><span>{item.label}</span></button>
        const current = item.href.includes('#')
          ? false
          : item.href === paths.home
          ? pathname === paths.home
          : !item.href.includes('?') && pathname.startsWith(item.href)

        if (opensCafeMenu) {
          return (
            <a
              key={item.label}
              href={`${pathname}?menu=1#menu`}
              className={styles.item}
              onClick={(event) => {
                const launcher = document.querySelector<HTMLAnchorElement>('[data-menu-launcher]')
                if (launcher) {
                  event.preventDefault()
                  launcher.click()
                }
              }}
            >
              <Icon size={20} strokeWidth={1.9} aria-hidden="true" />
              <span>{item.label}</span>
            </a>
          )
        }

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
