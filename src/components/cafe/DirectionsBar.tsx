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
import { ChevronDown, Navigation, Phone } from 'lucide-react'
import { InstagramIcon } from '@/components/ui/BrandIcons'
import { buildDirectionLinks, geoUri } from '@/core/map/directions'
import { MapServiceIcon } from './MapServiceIcon'
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
  const detailsRef = useRef<HTMLDetailsElement>(null)

  const close = () => {
    if (detailsRef.current) detailsRef.current.open = false
  }

  /*
    بستن با کلیک بیرون و Escape — بهبود، نه شرطِ کارکرد. بدون JS، کاربر با
    زدن دوباره‌ی خودِ دکمه می‌بندد که رفتار بومیِ `details` است.
  */
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const element = detailsRef.current
      if (!element?.open) return
      if (!element.contains(event.target as Node)) element.open = false
    }
    const onEscape = (event: KeyboardEvent) => {
      const element = detailsRef.current
      if (event.key !== 'Escape' || !element?.open) return
      element.open = false
      // فوکوس به دکمه برمی‌گردد، وگرنه کاربر کیبورد سرِ صفحه پرت می‌شود.
      element.querySelector('summary')?.focus()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onEscape)
    }
  }, [])

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

  return (
    <div className={styles.bar}>
      {hasCoords && links.length > 0 ? (
        <details className={styles.pickerWrap} ref={detailsRef}>
          <summary className={styles.primaryAction}>
            <Navigation size={17} aria-hidden="true" />
            مسیریابی
            <ChevronDown size={15} aria-hidden="true" className={styles.caret} />
          </summary>

          {/* پرده — فقط روی موبایل دیده می‌شود؛ کلیکش شیت را می‌بندد. */}
          <div className={styles.scrim} onClick={close} aria-hidden="true" />

          <div className={styles.sheet} role="menu" aria-label="انتخاب اپ مسیریابی">
            <div className={styles.grip} aria-hidden="true" />
            <p className={styles.sheetTitle}>با کدام اپ می‌روید؟</p>

            {links.map((link) => (
              <a
                key={link.id}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                role="menuitem"
                className={styles.sheetItem}
                onClick={close}
              >
                <MapServiceIcon service={link.id} />
                <span className={styles.sheetLabel}>{link.label}</span>
                {link.local && <span className={styles.localTag}>دقیق‌تر در ایران</span>}
              </a>
            ))}

            <div className={styles.sheetDivider} role="separator" />

            <a
              href={geoUri({ lat: lat!, lng: lng!, name })}
              role="menuitem"
              className={styles.sheetItem}
              onClick={close}
            >
              <MapServiceIcon service="device" />
              <span className={styles.sheetLabel}>اپ نقشه‌ی خودِ گوشی</span>
            </a>

            <button
              type="button"
              role="menuitem"
              className={styles.sheetItem}
              onClick={() => copy(`${lat},${lng}`, 'مختصات')}
            >
              <MapServiceIcon service="copy" />
              <span className={styles.sheetLabel}>کپی مختصات</span>
            </button>

            {address && (
              <button
                type="button"
                role="menuitem"
                className={styles.sheetItem}
                onClick={() => copy(address, 'آدرس')}
              >
                <MapServiceIcon service="copy" />
                <span className={styles.sheetLabel}>کپی آدرس</span>
              </button>
            )}
          </div>
        </details>
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
