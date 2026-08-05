'use client'

/**
 * دکمه‌های مسیریابی و تماس.
 *
 * ═══ چرا نشان اول است ═══
 *
 * در مشهد آدرس‌دهی نشان و بلد از گوگل مپس دقیق‌تر است، خصوصاً برای کوچه‌ها،
 * پاساژها و مجتمع‌ها. کاربر ایرانی هم به احتمال بیشتری همان را نصب دارد.
 * ولی گوگل مپس هم هست، چون بعضی کاربران فقط آن را دارند.
 *
 * ═══ چرا دو سطح ═══
 *
 * دو گزینه‌ی اصلی همیشه دیده می‌شوند و بقیه در یک منوی جمع‌شده. نمایش هر پنج
 * سرویس به‌صورت دکمه، مهم‌ترین کار صفحه («ببر منو آنجا») را در شلوغی گم
 * می‌کند.
 */

import { useEffect, useRef, useState } from 'react'
import { buildDirectionLinks, geoUri } from '@/core/map/directions'
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
}

export function DirectionsBar({
  lat,
  lng,
  name,
  address,
  phones = [],
  instagram,
  geoStatus,
}: Props) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  const hasCoords = lat !== null && lng !== null && geoStatus !== 'missing'
  const links = hasCoords ? buildDirectionLinks({ lat, lng, name }) : []
  const primary = links.filter((link) => link.id === 'neshan' || link.id === 'google')
  const rest = links.filter((link) => link.id !== 'neshan' && link.id !== 'google')
  const callable = phones.find((phone) => phone.kind !== 'reservation') ?? phones[0]

  return (
    <div className={styles.bar}>
      {hasCoords ? (
        <>
          {primary.map((link, index) => (
            <a
              key={link.id}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className={index === 0 ? styles.primaryAction : styles.action}
            >
              <span aria-hidden="true">➤</span>
              مسیریابی {link.label}
            </a>
          ))}

          <div className={styles.menuWrap} ref={menuRef}>
            <button
              type="button"
              className={styles.action}
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-haspopup="menu"
            >
              بیشتر ▾
            </button>
            {open && (
              <div className={styles.menu} role="menu">
                {rest.map((link) => (
                  <a
                    key={link.id}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    role="menuitem"
                    className={styles.menuItem}
                  >
                    مسیریابی {link.label}
                  </a>
                ))}
                <a
                  href={geoUri({ lat: lat!, lng: lng!, name })}
                  role="menuitem"
                  className={styles.menuItem}
                >
                  اپ نقشه‌ی گوشی
                </a>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    void navigator.clipboard?.writeText(`${lat},${lng}`)
                    setOpen(false)
                  }}
                >
                  کپی مختصات
                </button>
                {address && (
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    onClick={() => {
                      void navigator.clipboard?.writeText(address)
                      setOpen(false)
                    }}
                  >
                    کپی آدرس
                  </button>
                )}
              </div>
            )}
          </div>
        </>
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
          <span aria-hidden="true">☎</span>
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
          <span aria-hidden="true">◧</span>
          اینستاگرام
        </a>
      )}
    </div>
  )
}

export default DirectionsBar
