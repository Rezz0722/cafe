'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { RefreshCw, WifiOff } from 'lucide-react'
import { installPlatform, inAppBrowser, type InstallPlatform } from '@/core/pwa/install'
import styles from './Pwa.module.css'

interface InstallPrompt extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
interface PwaContextValue {
  ready: boolean; installed: boolean; standalone: boolean; online: boolean; embedded: boolean; platform: InstallPlatform
  canPrompt: boolean; prompting: boolean; message: string; updateReady: boolean
  install(): Promise<void>; update(): void
}
const PwaContext = createContext<PwaContextValue | null>(null)

export function usePwa() {
  const value = useContext(PwaContext)
  if (!value) throw new Error('usePwa must be used inside PwaProvider')
  return value
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false), [installed, setInstalled] = useState(false)
  const [standalone, setStandalone] = useState(false)
  const [online, setOnline] = useState(true), [embedded, setEmbedded] = useState(false)
  const [platform, setPlatform] = useState<InstallPlatform>('desktop')
  const [canPrompt, setCanPrompt] = useState(false), [prompting, setPrompting] = useState(false)
  const [message, setMessage] = useState(''), [updateReady, setUpdateReady] = useState(false)
  const prompt = useRef<InstallPrompt | null>(null), registration = useRef<ServiceWorkerRegistration | null>(null)
  const requestedUpdate = useRef(false), promptBusy = useRef(false)
  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined
    let networkCheck = 0, networkController: AbortController | undefined
    const mode = window.matchMedia('(display-mode: standalone)')
    const detectInstalled = () => {
      const running = mode.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
      setStandalone(running); setInstalled(previous => previous || running)
    }
    const markOnline = () => {
      setOnline(true)
      void registration.current?.update().catch(() => {})
    }
    const verifyNetwork = async () => {
      const check = ++networkCheck
      networkController?.abort()
      if (navigator.onLine) { if (alive) markOnline(); return }

      // `navigator.onLine` is only a browser/OS hint. Some Android WebViews,
      // VPNs and captive networks report false while same-origin requests work.
      // Confirm a reported outage against an uncached, non-SW network request
      // before showing the global offline warning.
      const controller = new AbortController()
      networkController = controller
      const timeout = window.setTimeout(() => controller.abort(), 3000)
      try {
        await fetch(`/favicon.ico?connectivity=${Date.now()}`, {
          method: 'HEAD', cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
        })
        if (alive && check === networkCheck) markOnline()
      } catch {
        if (alive && check === networkCheck) setOnline(false)
      } finally {
        window.clearTimeout(timeout)
        if (networkController === controller) networkController = undefined
      }
    }
    const network = () => { void verifyNetwork() }
    const visible = () => { if (document.visibilityState === 'visible') network() }
    const beforeInstall = (event: Event) => {
      event.preventDefault(); prompt.current = event as InstallPrompt; setCanPrompt(true); setMessage('')
    }
    const didInstall = () => { prompt.current = null; setCanPrompt(false); setInstalled(true); setMessage('درخواست نصب کوکافه پذیرفته شد؛ آماده‌شدن آیکون ممکن است کمی طول بکشد.') }
    const controlled = () => { if (requestedUpdate.current) location.reload() }
    detectInstalled(); network(); setPlatform(installPlatform(navigator.userAgent, navigator.maxTouchPoints))
    setEmbedded(inAppBrowser(navigator.userAgent)); setReady(true)
    window.addEventListener('beforeinstallprompt', beforeInstall)
    window.addEventListener('appinstalled', didInstall)
    window.addEventListener('online', network); window.addEventListener('offline', network); window.addEventListener('focus', network)
    document.addEventListener('visibilitychange', visible)
    mode.addEventListener?.('change', detectInstalled)
    const installWorker = async () => {
      if (!('serviceWorker' in navigator) || !window.isSecureContext) return
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
        if (!alive) return
        registration.current = reg
        if (reg.waiting) setUpdateReady(true)
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing
          worker?.addEventListener('statechange', () => {
            if (alive && worker.state === 'installed' && navigator.serviceWorker.controller && reg.waiting) setUpdateReady(true)
          })
        })
        await reg.update().catch(() => {})
      } catch {
        // Registration is optional enhancement: never block search, login,
        // maps or scrolling on storage/network/browser failures.
        if (alive) setMessage('سایت قابل استفاده است؛ آماده‌سازی نسخهٔ نصب‌پذیر فعلاً انجام نشد. دوباره با اینترنت امتحان کن.')
      }
    }
    const schedule = () => { timer = setTimeout(() => { void installWorker() }, 1000) }
    if (document.readyState === 'complete') schedule(); else window.addEventListener('load', schedule, { once: true })
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('controllerchange', controlled)
    return () => {
      alive = false; networkController?.abort(); if (timer) clearTimeout(timer)
      window.removeEventListener('load', schedule); window.removeEventListener('beforeinstallprompt', beforeInstall)
      window.removeEventListener('appinstalled', didInstall); window.removeEventListener('online', network); window.removeEventListener('offline', network)
      window.removeEventListener('focus', network); document.removeEventListener('visibilitychange', visible)
      mode.removeEventListener?.('change', detectInstalled)
      if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('controllerchange', controlled)
    }
  }, [])

  const install = async () => {
    if (promptBusy.current) return
    const event = prompt.current
    if (!event) { setMessage('اگر دکمهٔ نصب مرورگر فعال نیست، از راهنمای پایین استفاده کن.'); return }
    promptBusy.current = true; setPrompting(true); setMessage('')
    try {
      await event.prompt(); const choice = await event.userChoice
      setMessage(choice.outcome === 'accepted' ? 'درخواست نصب پذیرفته شد؛ آماده‌شدن آیکون ممکن است کمی طول بکشد.' : 'نصب لغو شد؛ هر وقت خواستی از منوی مرورگر دوباره نصب کن.')
    } catch { setMessage('پنجرهٔ نصب باز نشد؛ از منوی مرورگر و راهنمای زیر استفاده کن.') }
    finally { prompt.current = null; setCanPrompt(false); setPrompting(false); promptBusy.current = false }
  }
  const update = () => {
    const waiting = registration.current?.waiting
    if (!waiting || !window.confirm('اگر فرم ذخیره‌نشده‌ای داری، ابتدا آن را ذخیره کن. نسخهٔ جدید با بازشدن دوبارهٔ همین صفحه فعال شود؟')) return
    requestedUpdate.current = true; waiting.postMessage({ type: 'SKIP_WAITING' })
  }
  return <PwaContext.Provider value={{ ready, installed, standalone, online, embedded, platform, canPrompt, prompting, message, updateReady, install, update }}>{children}</PwaContext.Provider>
}

export function PwaStatus() {
  const { online, updateReady, update } = usePwa()
  if (online && !updateReady) return null
  return <div className={styles.statusStrip}>
    {!online && <p role="status"><WifiOff size={18} aria-hidden="true" />آفلاین هستی؛ قیمت، تخفیف و وضعیت نمایش‌داده‌شده ممکن است به‌روز نباشد.</p>}
    {updateReady && online && <div role="status"><span>نسخهٔ جدید کوکافه آماده است.</span><button type="button" onClick={update}><RefreshCw size={16} aria-hidden="true" />به‌روزرسانی</button></div>}
  </div>
}
