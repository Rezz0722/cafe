'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronLeft, ChevronRight, ImageOff, Images, Maximize2, X } from 'lucide-react'
import styles from './PlaceGallery.module.css'

export interface GalleryImage {
  url: string
  fullUrl: string
  alt: string
  width: number | null
  height: number | null
}

export function PlaceGallery({ images, placeName }: { images: GalleryImage[]; placeName: string }) {
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const galleryActions=useRef<{close:()=>void;show:(index:number)=>void}>({close:()=>{},show:()=>{}})
  const closeRef = useRef<HTMLButtonElement>(null)
  const launcherRef = useRef<HTMLAnchorElement>(null)
  const swipeRef = useRef<{ x: number; y: number; pointerId: number } | null>(null)

  const selected = images[active] ?? images[0]
  const markFailed = (url: string) => setFailed((current) => new Set(current).add(url))

  const writeUrl = (isOpen: boolean, index: number, mode: 'push' | 'replace' = 'replace') => {
    const url = new URL(window.location.href)
    if (isOpen) {
      url.searchParams.set('gallery', '1')
      url.searchParams.set('photo', String(index + 1))
    } else {
      url.searchParams.delete('gallery')
      url.searchParams.delete('photo')
    }
    const state = { ...(window.history.state ?? {}), kucafeGallery: isOpen }
    window.history[mode === 'push' ? 'pushState' : 'replaceState'](state, '', url)
  }

  const show = (index: number, updateUrl = open) => {
    const safeIndex = Math.min(Math.max(index, 0), images.length - 1)
    setActive(safeIndex)
    if (updateUrl) writeUrl(true, safeIndex)
  }

  const openGallery = () => {
    setOpen(true)
    writeUrl(true, active, 'push')
  }

  const closeGallery = () => {
    setOpen(false)
    writeUrl(false, active)
    requestAnimationFrame(() => launcherRef.current?.focus())
  }

  galleryActions.current={close:closeGallery,show}
  useEffect(() => {
    const syncFromUrl = () => {
      const url = new URL(window.location.href)
      const requested = Number(url.searchParams.get('photo')) - 1
      if (Number.isInteger(requested) && requested >= 0 && requested < images.length) {
        setActive(requested)
      }
      setOpen(url.searchParams.get('gallery') === '1')
    }
    syncFromUrl()
    window.addEventListener('popstate', syncFromUrl)
    return () => window.removeEventListener('popstate', syncFromUrl)
  }, [images.length])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') galleryActions.current.close()
      if (event.key === 'ArrowLeft') galleryActions.current.show(active + 1)
      if (event.key === 'ArrowRight') galleryActions.current.show(active - 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [active, open])

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.pointerType !== 'touch') return
    swipeRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
  }
  const onPointerUp = (event: ReactPointerEvent) => {
    const start = swipeRef.current
    swipeRef.current = null
    if (!start || start.pointerId !== event.pointerId) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dx) < 45 || Math.abs(dx) <= Math.abs(dy) * 1.2) return
    if (dx < 0 && active < images.length - 1) show(active + 1)
    if (dx > 0 && active > 0) show(active - 1)
  }

  if (!selected || images.length === 0) return null
  const selectedBroken = failed.has(selected.fullUrl) && failed.has(selected.url)

  return (
    <section className={styles.gallery} aria-label={`تصاویر محیط ${placeName}`}>
      <a ref={launcherRef} href={`?gallery=1&photo=${active + 1}`} className={styles.mainImage} onClick={(event) => { event.preventDefault(); openGallery() }} aria-label={`بازکردن گالری ${placeName}`}>
        {selectedBroken ? (
          <span className={styles.broken}><ImageOff size={30} /><span>این تصویر در دسترس نیست</span></span>
        ) : (
          <img
            src={selected.fullUrl}
            alt={selected.alt}
            width={selected.width ?? 1000}
            height={selected.height ?? 700}
            fetchPriority="high"
            decoding="async"
            onError={(event) => {
              const image = event.currentTarget
              if (image.src !== new URL(selected.url, window.location.href).href) {
                markFailed(selected.fullUrl)
                image.src = selected.url
              } else markFailed(selected.url)
            }}
          />
        )}
        <span className={styles.expand}><Maximize2 size={16} /> نمایش گالری</span>
        <span className={styles.counter} aria-label={`تصویر ${active + 1} از ${images.length}`}><Images size={15} aria-hidden="true" />{faCounter(active + 1, images.length)}</span>
      </a>

      {images.length > 1 && (
        <div className={styles.thumbnailStrip}>
          <div className={styles.thumbnails} role="list" aria-label="انتخاب تصویر محیط">
            {images.map((image, index) => (
              <button key={`${image.url}-${index}`} type="button" role="listitem" className={index === active ? styles.thumbnailActive : styles.thumbnail} onClick={() => show(index, false)} aria-label={`نمایش ${image.alt}`} aria-pressed={index === active}>
                <img src={image.url} alt="" width={image.width ?? 240} height={image.height ?? 160} loading="lazy" decoding="async" onError={() => markFailed(image.url)} />
              </button>
            ))}
          </div>
          <span className={styles.swipeHint}>تصاویر بیشتری هست؛ ردیف را ورق بزنید</span>
        </div>
      )}

      {open && (
        <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label={`گالری ${placeName}`} onClick={closeGallery}>
          <header className={styles.lightboxHead}><span>{faCounter(active + 1, images.length)}</span><button ref={closeRef} type="button" onClick={closeGallery} aria-label="بستن گالری"><X size={22} /></button></header>
          <div className={styles.lightboxStage} onClick={(event) => event.stopPropagation()} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { swipeRef.current = null }}>
            <button type="button" className={styles.previous} onClick={() => show(active - 1)} disabled={active === 0} aria-label="تصویر قبلی"><ChevronRight size={26} /></button>
            {selectedBroken ? <span className={styles.broken}><ImageOff size={34} /><span>این تصویر در دسترس نیست</span></span> : <img src={selected.fullUrl} alt={selected.alt} width={selected.width ?? 1000} height={selected.height ?? 700} onError={() => markFailed(selected.fullUrl)} />}
            <button type="button" className={styles.next} onClick={() => show(active + 1)} disabled={active === images.length - 1} aria-label="تصویر بعدی"><ChevronLeft size={26} /></button>
          </div>
          <p className={styles.lightboxCaption}>{selected.alt}</p>
        </div>
      )}
    </section>
  )
}

function faCounter(current: number, total: number): string {
  return `${current.toLocaleString('fa-IR')} از ${total.toLocaleString('fa-IR')}`
}
