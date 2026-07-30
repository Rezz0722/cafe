import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Client-side navigation keeps the scroll position, which is wrong when moving
 * between pages. Reset on every path change, but not on a query-only change —
 * the result list updates its own query string as filters change and must not
 * yank the user back to the top mid-browse.
 */
export function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}
