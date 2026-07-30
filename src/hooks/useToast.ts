import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A one-slot toast: `show()` reveals it and it hides itself after `duration`.
 * Returns the visibility flag rather than rendering, so the caller decides where
 * the toast lives in the tree.
 */
export function useToast(duration = 1600): { visible: boolean; show: () => void } {
  const [visible, setVisible] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  const show = useCallback(() => {
    setVisible(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setVisible(false), duration)
  }, [duration])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return { visible, show }
}
