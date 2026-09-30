'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

export function usePanelTab<T extends string>(allowed: readonly T[], fallback: T, canLeave: () => boolean): [T, (next: T) => void] {
  const [tab, update] = useState(fallback)
  const current = useRef(fallback)
  const guard = useRef(canLeave); guard.current = canLeave
  const key = allowed.join(',')
  const allowedRef=useRef(allowed);allowedRef.current=allowed
  useEffect(()=>{
    const frame=requestAnimationFrame(()=>{
      const nav=document.querySelector<HTMLElement>('nav[data-panel-tabs]')
      const selected=nav?.querySelector<HTMLElement>('button[aria-pressed="true"]')
      if(!nav||!selected||nav.scrollWidth<=nav.clientWidth)return
      const container=nav.getBoundingClientRect(),button=selected.getBoundingClientRect()
      nav.scrollBy({left:button.left+button.width/2-container.left-container.width/2,behavior:'instant'})
    })
    return()=>cancelAnimationFrame(frame)
  },[tab])
  useEffect(() => {
    const read = () => { const value = new URL(location.href).searchParams.get('tab'); return value && allowedRef.current.includes(value as T) ? value as T : fallback }
    const initial = read(); current.current = initial; update(initial)
    const back = () => {
      const next = read()
      if (next === current.current) return
      if (!guard.current()) { const url = new URL(location.href); url.searchParams.set('tab', current.current); history.pushState(history.state, '', url); return }
      current.current = next; update(next)
    }
    window.addEventListener('popstate', back)
    return () => window.removeEventListener('popstate', back)
  }, [key, fallback])
  const set = useCallback((next: T) => {
    if (next === current.current || !guard.current()) return
    const url = new URL(location.href); url.searchParams.set('tab', next)
    history.pushState(history.state, '', url)
    current.current = next; update(next)
  }, [])
  return [tab, set]
}
