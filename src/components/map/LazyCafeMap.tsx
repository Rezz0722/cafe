'use client'

import dynamic from 'next/dynamic'
import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { MapPinned } from 'lucide-react'
import type { CafeMapProps } from './CafeMap'
import styles from './LazyCafeMap.module.css'

const CafeMap = dynamic(
  () => import('./CafeMap').then((module) => module.CafeMap),
  {
    ssr: false,
    loading: () => <div className={styles.loading} role="status">در حال آماده‌سازی نقشه…</div>,
  },
)

interface MapImportBoundaryProps {
  children: ReactNode
  minHeight: string
}

/**
 * شکست دانلود chunk یا خودِ ماژول MapLibre باید داخل قاب نقشه مهار شود.
 * بدون boundary، خطای import تنبل به نزدیک‌ترین error boundary صفحه نشت
 * می‌کند و ممکن است کل مسیر را با صفحهٔ خطا جایگزین کند. نقشه هیچ scroll
 * lock سراسری ندارد؛ fallback نیز یک عنصر معمولی داخل flow صفحه است.
 */
export class MapImportBoundary extends Component<MapImportBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('بارگذاری ماژول نقشه ناموفق بود:', error.message, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <div className={styles.importFailure} style={{ minHeight: this.props.minHeight }} role="status">
        <MapPinned size={24} aria-hidden="true" />
        <span>
          <strong>نقشه بار نشد</strong>
          <small>صفحه همچنان قابل استفاده است؛ برای بارگذاری دوباره تلاش کنید.</small>
        </span>
        <button type="button" onClick={() => window.location.reload()}>
          تلاش دوباره
        </button>
      </div>
    )
  }
}

/**
 * نقشهٔ پایین صفحه را تا نزدیک‌شدن به viewport دانلود نمی‌کند.
 * دکمهٔ دستی برای مرورگرهای قدیمی و کاربری که مستقیم نقشه را می‌خواهد باقی است.
 */
export function LazyCafeMap(props: CafeMapProps) {
  const [shouldLoad, setShouldLoad] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const minHeight = props.height ?? '420px'

  useEffect(() => {
    if (shouldLoad || !rootRef.current) return
    if (!('IntersectionObserver' in window)) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        setShouldLoad(true)
        observer.disconnect()
      },
      { rootMargin: '320px 0px' },
    )
    observer.observe(rootRef.current)
    return () => observer.disconnect()
  }, [shouldLoad])

  return (
    <div
      ref={rootRef}
      className={styles.reserve}
      style={{ minHeight }}
    >
      {shouldLoad ? (
        <MapImportBoundary minHeight={minHeight}>
          <CafeMap {...props} />
        </MapImportBoundary>
      ) : (
        <button
          className={styles.trigger}
          style={{ minHeight }}
          type="button"
          onClick={() => setShouldLoad(true)}
        >
          <MapPinned size={24} aria-hidden="true" />
          <span>
            <strong>نمایش نقشه</strong>
            <small>نقشه هنگام نیاز بارگذاری می‌شود</small>
          </span>
        </button>
      )}
    </div>
  )
}
