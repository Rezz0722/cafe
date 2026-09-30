'use client'

/**
 * مسیریابی و تماس.
 *
 * ═══ چرا یک دکمه، نه یک نوار دکمه ═══
 *
 * نسخه‌ی قبلی دو دکمه‌ی مسیریابی + «بیشتر» + تماس + اینستاگرام را کنار هم
 * می‌گذاشت: روی موبایل سه خط دکمه که هیچ‌کدام از بقیه مهم‌تر به نظر نمی‌رسید.
 * کاربر یک تصمیم دارد («ببر منو آنجا») و باید یک دکمه ببیند؛ اینکه با نشان
 * برود یا گوگل، تصمیم *بعدی* اوست و جایش داخل همان دکمه است.
 *
 * ═══ چرا `details` و نه state ═══
 *
 * نسخه‌ی اول این کامپوننت فهرست را با `useState` رندر می‌کرد — یعنی لینک‌های
 * مسیریابی **در HTML سرور نبودند** و فقط بعد از hydration ساخته می‌شدند. سه
 * چیز را می‌شکست: بدون جاوااسکریپت دکمه هیچ کاری نمی‌کرد، خزنده‌ی گوگل هیچ
 * لینکی نمی‌دید، و `pages:smoke` که وجود `neshan.org/maps/routing` را در HTML
 * می‌سنجد قرمز شد — دقیقاً کاری که برای همین ساخته شده بود.
 *
 * `details/summary` همان جمع‌شدن را بومی می‌دهد: محتوا در HTML اولیه هست،
 * بازوبسته‌شدن بدون JS کار می‌کند، و بستن با Escape یا کلیک بیرون فقط یک
 * بهبود روی آن است.
 *
 * ═══ چرا شیت پایین روی موبایل ═══
 *
 * منوی چسبیده به دکمه روی صفحه‌ی کوچک از لبه بیرون می‌زند و ردیف‌هایش برای
 * انگشت کوچک‌اند. شیت پایینِ صفحه در دسترسِ شست است و ردیف‌های ۵۴ پیکسلی
 * می‌گیرد. بالای ۶۴۰px همان لیست به‌شکل popover کنار دکمه می‌نشیند.
 *
 * ترتیب سرویس‌ها از تنظیمات پنل ادمین می‌آید — در مشهد آدرس‌دهی نشان و بلد از
 * گوگل مپس دقیق‌تر است، ولی اگر روزی عوض شد نباید کامیت بخواهد.
 */

import { useEffect, useRef, useState } from 'react'
import { Phone } from 'lucide-react'
import { InstagramIcon } from '@/components/ui/BrandIcons'
import {
  buildDirectionLinks,
  geoUri,
  neshanIosRouteLink,
  neshanPointLink,
  neshanRouteLink,
} from '@/core/map/directions'
import { MapServiceIcon } from './MapServiceIcon'
import { CafePopover } from './CafePopover'
import styles from './DirectionsBar.module.css'

interface Props {
  lat: number | null
  lng: number | null
  name: string
  address?: string
  phones?: { phone: string; kind: string }[]
  instagram?: string | null
  /** وقتی مختصات نداریم — پیام صادق، نه دکمه‌ی بی‌کار. */
  geoStatus?: string
  /** سرویس‌های مسیریابی و ترتیبشان — از تنظیمات پنل ادمین. */
  services?: string[]
}

const DEFAULT_SERVICES = ['neshan', 'balad', 'google', 'waze', 'osm']

export function DirectionsBar({
  lat,
  lng,
  name,
  address,
  phones = [],
  instagram,
  geoStatus,
  services = DEFAULT_SERVICES,
}: Props) {
  /** «کپی شد» — بازخورد لازم است، وگرنه کاربر نمی‌داند کلیک کارگر شد یا نه. */
  const [copied, setCopied] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)

  const close = () => {
    sheetRef.current?.closest('dialog')?.querySelector<HTMLButtonElement>('header button[aria-label="بستن"]')?.click()
  }

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(null), 1800)
    return () => clearTimeout(timer)
  }, [copied])

  const hasCoords = lat !== null && lng !== null && geoStatus !== 'missing'
  const all = hasCoords ? buildDirectionLinks({ lat, lng, name }) : []

  /* سرویسی که در تنظیمات نیست، هیچ‌جا نمایش داده نمی‌شود. */
  const links = services
    .map((id) => all.find((link) => link.id === id))
    .filter((link): link is (typeof all)[number] => Boolean(link))

  const callable = phones.find((phone) => phone.kind !== 'reservation') ?? phones[0]

  const copy = (text: string, label: string) => {
    void navigator.clipboard?.writeText(text)
    setCopied(label)
    close()
  }

  /** iPadOS جدید خودش را Mac معرفی می‌کند؛ touch آن را از مک واقعی جدا می‌کند. */
  const isIos = () =>
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  /**
   * iOS طبق مستند نشان custom scheme می‌خواهد. اگر اپ باز شود صفحه hidden
   * می‌شود و fallback لغو می‌شود؛ اگر نصب نباشد، بعد از مکث کوتاه وب باز است.
   */
  const openIosWithWebFallback = (appHref: string, webHref: string) => {
    let appOpened = false
    let timer = 0
    const cleanup = () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return
      appOpened = true
      cleanup()
    }
    const onPageHide = () => {
      appOpened = true
      cleanup()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    timer = window.setTimeout(() => {
      cleanup()
      if (!appOpened) window.location.assign(webHref)
    }, 1400)
    window.location.assign(appHref)
  }

  const openNeshan = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    if (locating || lat === null || lng === null) return

    const target = { lat, lng, name }
    const pointFallback = neshanPointLink(target)
    setLocating(true)

    const openPoint = () => {
      setLocating(false)
      if (isIos()) {
        openIosWithWebFallback(`neshan://?ll=${lat.toFixed(6)},${lng.toFixed(6)}`, pointFallback)
      } else {
        window.location.assign(pointFallback)
      }
    }

    if (!navigator.geolocation) {
      openPoint()
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        const origin = { lat: position.coords.latitude, lng: position.coords.longitude }
        const webHref = neshanRouteLink(origin, target)
        if (isIos()) openIosWithWebFallback(neshanIosRouteLink(origin, target), webHref)
        else window.location.assign(webHref)
      },
      openPoint,
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 300_000 },
    )
  }

  return (
    <div className={styles.bar}>
      {hasCoords && links.length > 0 ? (
        <CafePopover label="مسیریابی" title="با کدام نقشه برویم؟" variant="primary">
          <div ref={sheetRef} className={styles.centeredApps} aria-label="انتخاب اپ مسیریابی">

            {links.map((link) => (
              <a
                key={link.id}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.sheetItem}
                onClick={link.id === 'neshan' ? openNeshan : close}
                aria-busy={link.id === 'neshan' && locating}
              >
                <MapServiceIcon service={link.id} />
                <span className={styles.sheetLabel}>
                  <strong>{link.id === 'neshan' && locating ? 'در حال دریافت موقعیت…' : link.label}</strong>
                  {link.id === 'neshan' && <small>اول اپ نشان؛ در صورت نصب‌نبودن نسخهٔ وب</small>}
                </span>
              </a>
            ))}

            <div className={styles.sheetDivider} role="separator" />

            <a
              href={geoUri({ lat: lat!, lng: lng!, name })}
              className={styles.sheetItem}
              onClick={close}
            >
              <MapServiceIcon service="device" />
              <span className={styles.sheetLabel}>اپ نقشه‌ی خودِ گوشی</span>
            </a>

            <button
              type="button"
              className={styles.sheetItem}
              onClick={() => copy(`${lat},${lng}`, 'مختصات')}
            >
              <MapServiceIcon service="copy" />
              <span className={styles.sheetLabel}>کپی مختصات</span>
            </button>

            {address && (
              <button
                type="button"
                className={styles.sheetItem}
                onClick={() => copy(address, 'آدرس')}
              >
                <MapServiceIcon service="copy" />
                <span className={styles.sheetLabel}>کپی آدرس</span>
              </button>
            )}
          </div>
        </CafePopover>
      ) : (
        /* بدون مختصات، دکمه‌ی مسیریابی یک وعده‌ی توخالی است. ۷۳ مکان در
           داده مختصات ندارند و برایشان آدرس متنی تنها چیزی است که داریم. */
        <p className={styles.noCoords}>
          مختصات دقیق این مجموعه ثبت نشده
          {address ? ` — آدرس: ${address}` : ''}
        </p>
      )}

      {callable && (
        <a href={`tel:${callable.phone}`} className={styles.action}>
          <Phone size={16} aria-hidden="true" />
          تماس
        </a>
      )}

      {instagram && (
        <a
          href={`https://instagram.com/${instagram}`}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className={styles.action}
        >
          <InstagramIcon size={16} />
          اینستاگرام
        </a>
      )}

      {copied && (
        <span className={styles.copied} role="status">
          {copied} کپی شد
        </span>
      )}
    </div>
  )
}

export default DirectionsBar
