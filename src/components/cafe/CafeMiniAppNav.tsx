'use client'

import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import { House, Info, MessageSquareText, UtensilsCrossed, ChevronRight } from 'lucide-react'
import styles from './CafeMiniAppNav.module.css'

type CafeScreen = 'overview' | 'menu' | 'reviews' | 'info'

const SCREENS = [
  { id: 'overview', label: 'خلاصه', icon: House },
  { id: 'menu', label: 'منو', icon: UtensilsCrossed },
  { id: 'reviews', label: 'تجربه‌ها', icon: MessageSquareText },
  { id: 'info', label: 'اطلاعات', icon: Info },
] as const

function screenFromLocation(): CafeScreen {
  const url = new URL(window.location.href)
  if (url.searchParams.get('menu') === '1' || url.hash === '#menu') return 'menu'
  if (url.hash === '#reviews') return 'reviews'
  if (['#info', '#map', '#about'].includes(url.hash)) return 'info'
  return 'overview'
}

export function CafeMiniAppNav({ placeName }: { placeName: string }) {
  const [screen, setScreen] = useState<CafeScreen>('overview')

  const sync = useCallback((focus = false) => {
    const root = document.getElementById('page-top')
    if (!root) return
    const next = screenFromLocation()
    const changed = root.dataset.cafeScreen !== next
    root.dataset.cafeScreen = next
    root.dataset.cafeReady = 'true'
    setScreen(next)
    if (!window.matchMedia('(max-width: 760px)').matches || !changed) return
    root.scrollTo({ top: 0, behavior: 'instant' })
    window.scrollTo({ top: 0, behavior: 'instant' })
    if (focus && next !== 'menu') {
      requestAnimationFrame(() => {
        const heading = root.querySelector<HTMLElement>(`[data-cafe-screen="${next}"] h1, [data-cafe-screen="${next}"] h2`)
        heading?.focus({ preventScroll: true })
      })
    }
  }, [])

  useEffect(() => {
    sync()
    const onLocation = () => sync()
    window.addEventListener('popstate', onLocation)
    window.addEventListener('hashchange', onLocation)
    window.addEventListener('kucafe:cafe-location', onLocation)
    return () => {
      window.removeEventListener('popstate', onLocation)
      window.removeEventListener('hashchange', onLocation)
      window.removeEventListener('kucafe:cafe-location', onLocation)
      const root = document.getElementById('page-top')
      if (root) {
        delete root.dataset.cafeScreen
        delete root.dataset.cafeReady
      }
    }
  }, [sync])

  const navigate = (target: CafeScreen, event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    if (target === screen) return
    if (target === 'menu') {
      const launcher = document.querySelector<HTMLAnchorElement>('[data-menu-launcher]')
      if (launcher) {
        launcher.click()
        const url = new URL(window.location.href)
        url.hash = 'menu'
        window.history.replaceState(window.history.state, '', url)
      } else {
        const url = new URL(window.location.href)
        url.hash = 'menu'
        window.history.pushState({ ...window.history.state, kucafeCafeScreen: 'menu' }, '', url)
      }
      sync(true)
      return
    }

    const url = new URL(window.location.href)
    url.searchParams.delete('menu')
    url.searchParams.delete('section')
    url.searchParams.delete('menu_q')
    url.hash = target
    window.history.pushState({ ...window.history.state, kucafeCafeScreen: target }, '', url)
    sync(true)
  }

  return (
    <>
      <div className={`${styles.screenBar} ${screen === 'overview' || screen === 'menu' ? styles.screenBarHidden : ''}`}>
        <a href="#overview" className={styles.overviewLink} onClick={(event) => navigate('overview', event)} aria-label="بازگشت به خلاصهٔ کافه">
          <ChevronRight size={19} aria-hidden="true" />
        </a>
        <span><strong>{SCREENS.find(item => item.id === screen)?.label}</strong><small>{placeName}</small></span>
      </div>
      <nav className={styles.nav} aria-label="بخش‌های کافه">
        {SCREENS.map(({ id, label, icon: Icon }) => (
          <a
            key={id}
            href={id === 'menu' ? '?menu=1#menu' : `#${id}`}
            className={styles.item}
            aria-current={screen === id ? 'page' : undefined}
            onClick={(event) => navigate(id, event)}
          >
            <Icon size={20} strokeWidth={screen === id ? 2.4 : 1.9} aria-hidden="true" />
            <span>{label}</span>
          </a>
        ))}
      </nav>
      <span className={styles.announcement} role="status" aria-live="polite">بخش {SCREENS.find(item => item.id === screen)?.label}</span>
    </>
  )
}
