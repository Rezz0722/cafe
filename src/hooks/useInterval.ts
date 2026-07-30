import { useEffect, useRef } from 'react'

/**
 * `setInterval` that survives re-renders: the latest `callback` is always the
 * one that fires, and passing `null` for `delay` pauses the timer.
 */
export function useInterval(callback: () => void, delay: number | null): void {
  const latest = useRef(callback)

  useEffect(() => {
    latest.current = callback
  }, [callback])

  useEffect(() => {
    if (delay === null) return
    const id = window.setInterval(() => latest.current(), delay)
    return () => window.clearInterval(id)
  }, [delay])
}
