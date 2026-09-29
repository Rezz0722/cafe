'use client'

import Link from 'next/link'
import { discountedPrice } from '@/core/club/discount'
import { categoryArtwork, categoryArtworkFull } from '@/core/taxonomy/categoryArtwork'
import {
  ArrowLeft,
  ChevronDown,
  Grid2X2,
  Images,
  List,
  Search,
  Sparkles,
  Star,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { itemSlug } from '@/core/items/identity'
import { normalizeFa } from '@/core/text/normalize'
import { presentMenuSectionName } from '@/core/places/presentation'
import { fa, faCount, toman } from '@/lib/format'
import { paths } from '@/routes'
import { MenuItemImage } from './MenuItemImage'
import styles from './MenuBrowser.module.css'

export interface MenuItemProps {
  id: number
  publicId: string
  name: string
  nameEn: string | null
  description: string | null
  price: number | null
  priceUnknown: boolean
  available: boolean
  featured: boolean
  image: { url: string; fullUrl: string; width: number | null; height: number | null } | null
  variants: { id: number; label: string; price: number | null; available: boolean }[]
}

export interface MenuSectionProps {
  id: number
  name: string
  description: string | null
  facetId?: string | null
  image?: { url: string; fullUrl: string; width: number | null; height: number | null } | null
  items: MenuItemProps[]
}

interface Props {
  discountPercent?:number
  discountExpiresAt?:string|null
  sections: MenuSectionProps[]
  placeName: string
  logoUrl?: string | null
  sourceUrl?: string | null
  branchName?: string | null
  priceUpdatedLabel?: string | null
  priceIsStale?: boolean
  sourceLabel?: string | null
}

const PAGE_SIZE = 18

/** نتیجه‌های زیاد را بین دسته‌ها محدود می‌کند تا حتی جست‌وجوی عمومی هم
 * صدها کارت را یک‌جا نسازد. */
function takeItems(sections: MenuSectionProps[], limit: number) {
  let remaining = limit

  return sections.flatMap((section) => {
    if (remaining <= 0) return []
    const items = section.items.slice(0, remaining)
    remaining -= items.length
    return items.length ? [{ ...section, items }] : []
  })
}

const MENU_QUERY_KEY = 'menu_q'
const MENU_SECTION_KEY = 'section'
const EMPTY_COVER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

function CategoryCardName({ name }: { name: string }) {
  const bilingual = name.match(/^(.+?)\s*\/\s*([A-Za-z].*)$/)
  return (
    <strong dir="auto">
      <span className={styles.categoryPrimaryName}>{bilingual?.[1] ?? name}</span>
      {bilingual && <span className={styles.categoryEnglishName} dir="ltr" lang="en">{bilingual[2]}</span>}
    </strong>
  )
}

export function MenuBrowser({
  sections,
  placeName,
  logoUrl = null,
  sourceUrl,
  branchName = null,
  priceUpdatedLabel = null,
  priceIsStale = false,
  sourceLabel = null,
  discountPercent = 0,
  discountExpiresAt = null,
}: Props) {
  const [discountClock,setDiscountClock]=useState(0)
  useEffect(()=>{
    setDiscountClock(Date.now())
    if(!discountExpiresAt)return
    const timer=setTimeout(()=>setDiscountClock(Date.now()),Math.min(Math.max(Date.parse(discountExpiresAt)-Date.now()+30,0),2147483000))
    const interval=setInterval(()=>setDiscountClock(Date.now()),30000)
    return()=>{clearTimeout(timer);clearInterval(interval)}
  },[discountExpiresAt])
  const activePercent=discountExpiresAt&&Date.parse(discountExpiresAt)>discountClock?discountPercent:0
  // دستهٔ خالی نه در شمارش می‌آید نه در ناوبری. هر دو نمای موبایل و دسکتاپ
  // دقیقاً از همین آرایه استفاده می‌کنند تا هیچ اختلاف عددی ممکن نباشد.
  const displaySections = useMemo(
    () => sections
      .filter((section) => section.items.length > 0)
      .map((section) => ({
        ...section,
        name: presentMenuSectionName(section.name, branchName),
      })),
    [branchName, sections],
  )
  const firstSectionId = displaySections[0]?.id ?? null
  const [query, setQuery] = useState('')
  const [activeSection, setActiveSection] = useState<number | null>(firstSectionId)
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE)
  const [menuOpen, setMenuOpen] = useState(false)
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  const [categoryPickerIsEntry, setCategoryPickerIsEntry] = useState(false)
  const [viewMode, setViewMode] = useState<'simple' | 'visual'>('simple')
  const [lightbox, setLightbox] = useState<MenuItemProps | null>(null)
  const deferredQuery = useDeferredValue(query)
  const closeMenuRef=useRef<()=>void>(()=>{})
  const closeRef = useRef<HTMLButtonElement>(null)
  const launcherRef = useRef<HTMLAnchorElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelBodyRef = useRef<HTMLDivElement>(null)
  const sectionNavRef = useRef<HTMLElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const categoryReturnFocusRef = useRef<HTMLButtonElement | null>(null)
  const railGesture = useRef({ pointerId: -1, x: 0, y: 0, moved: false })
  const categoryPickerRef = useRef<HTMLDivElement>(null)
  const categoryPickerCloseRef = useRef<HTMLButtonElement>(null)
  const lightboxRef = useRef<HTMLDivElement>(null)
  const lightboxCloseRef = useRef<HTMLButtonElement>(null)

  const totalItems = useMemo(
    () => displaySections.reduce((sum, section) => sum + section.items.length, 0),
    [displaySections],
  )
  const normalizedQuery = useMemo(() => normalizeFa(deferredQuery.trim()), [deferredQuery])

  const matchingSections = useMemo(() => {
    if (normalizedQuery) {
      return displaySections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => {
            const haystack = normalizeFa(
              `${item.name} ${item.nameEn ?? ''} ${item.description ?? ''} ${section.name}`,
            )
            return haystack.includes(normalizedQuery)
          }),
        }))
        .filter((section) => section.items.length > 0)
    }

    const selected = displaySections.find((section) => section.id === activeSection) ?? displaySections[0]
    return selected ? [selected] : []
  }, [activeSection, displaySections, normalizedQuery])

  const matchingCount = useMemo(
    () => matchingSections.reduce((sum, section) => sum + section.items.length, 0),
    [matchingSections],
  )
  const visibleSections = useMemo(
    () => takeItems(matchingSections, visibleLimit),
    [matchingSections, visibleLimit],
  )
  const selectedSection = displaySections.find((section) => section.id === activeSection) ?? displaySections[0]
  const overlayOpen = menuOpen || Boolean(lightbox) || categoryPickerOpen

  // Keep the document locked while moving between the stacked menu dialogs.
  // Releasing/reapplying the lock on every category choice can move the page.
  useEffect(() => {
    if (!overlayOpen) return
    const previousOverflow = document.body.style.overflow
    const previousRootOverflow = document.documentElement.style.overflow
    const previousOverscroll = document.documentElement.style.overscrollBehavior
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    document.documentElement.style.overscrollBehavior = 'none'
    return () => {
      document.body.style.overflow = previousOverflow
      document.documentElement.style.overflow = previousRootOverflow
      document.documentElement.style.overscrollBehavior = previousOverscroll
    }
  }, [overlayOpen])

  useEffect(() => {
    if (!overlayOpen) return
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const initialFocus = categoryPickerOpen ? categoryPickerCloseRef.current
      : lightbox ? lightboxCloseRef.current : closeRef.current
    const activeDialog = categoryPickerRef.current ?? lightboxRef.current ?? panelRef.current
    // When an inner dialog closes, keep the focus restored to its trigger.
    if (!activeDialog?.contains(document.activeElement)) initialFocus?.focus({ preventScroll: true })

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (categoryPickerOpen && categoryPickerIsEntry) closeMenuRef.current()
        else if (categoryPickerOpen) setCategoryPickerOpen(false)
        else if (lightbox) setLightbox(null)
        else closeMenuRef.current()
        return
      }

      // فوکوس نباید از پنجرهٔ تمام‌صفحه یا لایت‌باکس به محتوای پشت آن فرار کند.
      if (event.key !== 'Tab') return
      const scope = categoryPickerRef.current ?? lightboxRef.current ?? panelRef.current
      const focusable = Array.from(
        scope?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled])',
        ) ?? [],
      ).filter((element) => element.offsetParent !== null)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
    }
  }, [categoryPickerIsEntry, categoryPickerOpen, lightbox, overlayOpen])

  useEffect(() => {
    const mobileViewport = window.matchMedia('(max-width: 760px)')
    const syncFromUrl = () => {
      const url = new URL(window.location.href)
      const requestedSection = Number(url.searchParams.get(MENU_SECTION_KEY))
      if (displaySections.some((section) => section.id === requestedSection)) {
        setActiveSection(requestedSection)
        setViewMode('visual')
      }
      setQuery(url.searchParams.get(MENU_QUERY_KEY) ?? '')
      const nextMenuOpen = url.searchParams.get('menu') === '1'
      const needsCategoryChoice = nextMenuOpen && !displaySections.some((section) => section.id === requestedSection)
      setMenuOpen(nextMenuOpen && mobileViewport.matches)
      setCategoryPickerOpen(needsCategoryChoice)
      setCategoryPickerIsEntry(needsCategoryChoice)
    }
    const syncViewport = () => {
      setMenuOpen(new URL(window.location.href).searchParams.get('menu') === '1' && mobileViewport.matches)
    }

    syncFromUrl()
    window.addEventListener('popstate', syncFromUrl)
    mobileViewport.addEventListener('change', syncViewport)
    return () => {
      window.removeEventListener('popstate', syncFromUrl)
      mobileViewport.removeEventListener('change', syncViewport)
    }
  }, [displaySections])

  useEffect(() => {
    setVisibleLimit(PAGE_SIZE)
  }, [activeSection, normalizedQuery])

  // Scroll only the rail, and only as far as needed. scrollIntoView also scrolls
  // vertical ancestors, which used to undo the results scroll on mobile.
  useEffect(() => {
    if (categoryPickerOpen) return
    const rail = sectionNavRef.current
    const button = rail?.querySelector<HTMLElement>(`[data-menu-section-id="${activeSection}"]`)
    if (!rail || !button) return
    const frame = requestAnimationFrame(() => {
      const railBox = rail.getBoundingClientRect()
      const buttonBox = button.getBoundingClientRect()
      const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
      if (window.matchMedia('(max-width: 760px)').matches) {
        const offset = (buttonBox.left + buttonBox.width / 2) - (railBox.left + railBox.width / 2)
        if (Math.abs(offset) > 1) rail.scrollBy({ left: offset, behavior })
      } else {
        const top = buttonBox.top - railBox.top
        const bottom = buttonBox.bottom - railBox.bottom
        if (top < 0 || bottom > 0) rail.scrollBy({ top: top < 0 ? top : bottom, behavior })
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [activeSection, categoryPickerOpen, menuOpen])

  const writeMenuUrl = (
    open: boolean,
    sectionId: number | null,
    menuQuery: string,
    mode: 'push' | 'replace' = 'replace',
  ) => {
    const url = new URL(window.location.href)
    if (open) url.searchParams.set('menu', '1')
    else url.searchParams.delete('menu')
    if (sectionId !== null) url.searchParams.set(MENU_SECTION_KEY, String(sectionId))
    else url.searchParams.delete(MENU_SECTION_KEY)
    if (menuQuery.trim()) url.searchParams.set(MENU_QUERY_KEY, menuQuery.trim())
    else url.searchParams.delete(MENU_QUERY_KEY)
    const state = { ...(window.history.state ?? {}), kucafeMenu: open }
    window.history[mode === 'push' ? 'pushState' : 'replaceState'](state, '', url)
  }

  const openMenu = (sectionId?: number) => {
    const categoryWasChosen = typeof sectionId === 'number'
    const nextSection = categoryWasChosen ? sectionId : activeSection ?? firstSectionId
    if (nextSection !== null) setActiveSection(nextSection)
    if(window.matchMedia('(min-width: 761px)').matches){
      if (categoryWasChosen) setViewMode('visual')
      document.getElementById('menu')?.scrollIntoView({behavior:'smooth',block:'start'})
      return
    }
    setQuery('')
    setVisibleLimit(PAGE_SIZE)
    setViewMode(categoryWasChosen ? 'visual' : 'simple')
    setMenuOpen(true)
    setCategoryPickerOpen(!categoryWasChosen)
    setCategoryPickerIsEntry(!categoryWasChosen)
    writeMenuUrl(true, categoryWasChosen ? nextSection : null, '', 'push')
  }

  const closeMenu = () => {
    setLightbox(null)
    setCategoryPickerOpen(false)
    setCategoryPickerIsEntry(false)
    setMenuOpen(false)
    // بستنِ صریح باید همان لحظه URL را هم پاک کند. Back سخت‌افزاری مسیر
    // `popstate` را دارد؛ تکیه‌کردن این دکمه به history.back بعد از رفت‌وبرگشت
    // صفحهٔ آیتم در بعضی مرورگرها کاربر را روی `menu=1` نگه می‌داشت.
    writeMenuUrl(false, null, '')
    requestAnimationFrame(() => launcherRef.current?.focus({ preventScroll: true }))
  }

  closeMenuRef.current=closeMenu
  const chooseSection = (sectionId: number) => {
    setActiveSection(sectionId)
    setCategoryPickerOpen(false)
    setCategoryPickerIsEntry(false)
    setViewMode('visual')
    setQuery('')
    setVisibleLimit(PAGE_SIZE)
    writeMenuUrl(menuOpen, sectionId, '')
    requestAnimationFrame(() => {
      if (window.matchMedia('(max-width: 760px)').matches) {
        panelBodyRef.current?.scrollTo({ top: 0, behavior: 'instant' })
      } else {
        resultsRef.current?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
          block: 'start',
        })
      }
      if (categoryPickerOpen) {
        sectionNavRef.current?.querySelector<HTMLElement>(`[data-menu-section-id="${sectionId}"]`)
          ?.focus({ preventScroll: true })
      }
    })
  }

  const closeCategoryPicker = () => {
    if (categoryPickerIsEntry) closeMenu()
    else {
      setCategoryPickerOpen(false)
      requestAnimationFrame(() => categoryReturnFocusRef.current?.focus({ preventScroll: true }))
    }
  }

  const openCategoryPicker = (trigger: HTMLButtonElement) => {
    categoryReturnFocusRef.current = trigger
    setCategoryPickerIsEntry(false)
    setCategoryPickerOpen(true)
  }

  const focusSearch = () => {
    panelBodyRef.current?.scrollTo({ top: 0, behavior: 'instant' })
    requestAnimationFrame(() => searchInputRef.current?.focus({ preventScroll: true }))
  }

  if (totalItems === 0) {
    return (
      <section id="menu" className={styles.emptyMenu} aria-labelledby="menu-heading">
        <UtensilsCrossed size={24} aria-hidden="true" />
        <h2 id="menu-heading">منوی این مجموعه هنوز ثبت نشده است</h2>
        <p>به‌محض دریافت منوی رسمی، آیتم‌ها و قیمت‌ها اینجا نمایش داده می‌شوند.</p>
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
            دیدن منو در سایت مجموعه
          </a>
        )}
      </section>
    )
  }

  return (
    <section id="menu" className={styles.wrap} aria-label={`منوی ${placeName}`}>
      {activePercent>0&&<p className={styles.discountBanner}><strong>{fa(activePercent)}٪ تخفیف روی کل منو</strong><span>تا {new Date(discountExpiresAt!).toLocaleDateString('fa-IR',{timeZone:'Asia/Tehran',month:'long',day:'numeric'})} · قیمت پایه خط‌خورده است؛ با کد باشگاه جمع نمی‌شود.</span></p>}
      <div className={styles.mobileLauncher}>
        <div className={styles.launcherTop}>
          <span className={styles.launcherIcon} aria-hidden="true">
            <UtensilsCrossed size={23} />
          </span>
          <div>
            <h2 id="menu-heading" className={styles.launcherTitle}>منوی {placeName}</h2>
            <p><strong>{faCount(totalItems)}</strong> آیتم در <strong>{faCount(displaySections.length)}</strong> دسته؛ سریع پیدا کن و قیمت‌ها را ببین</p>
          </div>
        </div>

        <div className={styles.launcherCategories} aria-label="دسته‌های پیشنهادی منو">
          {displaySections.slice(0, 4).map((section) => (
            <button type="button" key={section.id} onClick={() => openMenu(section.id)}>
              {section.name}
              <span>{fa(section.items.length)}</span>
            </button>
          ))}
        </div>

        <a ref={launcherRef} data-menu-launcher href="?menu=1#menu" className={styles.launcherButton} onClick={(event) => { event.preventDefault(); openMenu() }}>
          <span>مشاهده منو</span>
          <ArrowLeft size={19} aria-hidden="true" />
        </a>
      </div>

      <div
        ref={panelRef}
        inert={categoryPickerOpen || Boolean(lightbox)}
        className={`${styles.panel} ${menuOpen ? styles.panelOpen : ''}`}
        role={menuOpen ? 'dialog' : undefined}
        aria-modal={menuOpen ? 'true' : undefined}
        aria-label={menuOpen ? `منوی ${placeName}` : undefined}
      >
        <header className={styles.mobilePanelHead}>
          <div className={styles.mobilePanelBack}>
            <button ref={closeRef} type="button" onClick={closeMenu} aria-label="بستن منو">
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
          </div>
          <div className={styles.mobilePanelBrand} title={placeName}>
            {logoUrl
              ? <img src={logoUrl} alt={`لوگوی ${placeName}`} width={40} height={40} />
              : <span aria-label={placeName}><UtensilsCrossed size={20} aria-hidden="true" /></span>}
          </div>
          <div className={styles.mobilePanelActions}>
            <button type="button" onClick={focusSearch} aria-label="جست‌وجو در منو">
              <Search size={19} aria-hidden="true" />
            </button>
            <button type="button" onClick={(event) => openCategoryPicker(event.currentTarget)} aria-label="نمایش همهٔ دسته‌بندی‌ها">
              <Grid2X2 size={19} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div ref={panelBodyRef} className={styles.panelBody}>
          <header className={styles.desktopHead}>
            <div className={styles.desktopTitleRow}>
              <span className={styles.titleIcon} aria-hidden="true">
                <UtensilsCrossed size={22} />
              </span>
              <div>
                <h2 id="menu-heading-desktop" className={styles.title}>منوی {placeName}</h2>
                <p className={styles.subtitle}>{faCount(totalItems)} آیتم در {faCount(displaySections.length)} دسته</p>
              </div>
            </div>
            <span className={styles.freshHint}><Sparkles size={15} /> نمای سریع برای دیدن نام و قیمت</span>
          </header>

          <div className={styles.searchBox}>
            <Search size={19} aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => {
                const next = event.target.value
                setQuery(next)
                writeMenuUrl(menuOpen, activeSection, next)
              }}
              placeholder="چی میل داری؟ مثلاً لاته، پاستا یا کیک"
              aria-label="جست‌وجو در تمام منو"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  writeMenuUrl(menuOpen, activeSection, '')
                }}
                aria-label="پاک‌کردن جست‌وجو"
              >
                <X size={17} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className={styles.workspace}>
            <aside className={styles.categoryRail}>
              <p className={styles.categoryLabel}>دسته‌بندی‌ها</p>
              <nav
                ref={sectionNavRef}
                className={styles.sectionNav}
                aria-label="دسته‌های منو"
                onPointerDownCapture={(event) => {
                  railGesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
                }}
                onPointerMoveCapture={(event) => {
                  const gesture = railGesture.current
                  if (event.pointerId === gesture.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 10) gesture.moved = true
                }}
                onPointerCancelCapture={() => { railGesture.current.moved = true }}
                onClickCapture={(event) => {
                  // No touchmove/preventDefault: the browser owns momentum scrolling.
                  // Suppress only the synthetic click after a drag; keyboard clicks work.
                  if (event.detail > 0 && railGesture.current.moved) {
                    event.preventDefault()
                    event.stopPropagation()
                  }
                }}
              >
                {displaySections.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    data-menu-section-id={section.id}
                    className={activeSection === section.id && !normalizedQuery ? styles.chipActive : ''}
                    onClick={() => chooseSection(section.id)}
                    aria-pressed={activeSection === section.id && !normalizedQuery}
                    title={section.name}
                  >
                    <img src={categoryArtwork(section.name, section.facetId, section.image?.url)} alt="" width={56} height={56} loading="lazy" decoding="async" draggable={false} className={styles.categoryArtwork}/>
                    <span className={styles.categoryNavScrim} aria-hidden="true" />
                    <span className={styles.categoryName}><CategoryCardName name={section.name} /></span>
                    <span className={styles.chipCount}>{fa(section.items.length)}</span>
                  </button>
                ))}
              </nav>
            </aside>

            <div className={styles.menuViewBar} aria-label="تنظیمات نمایش منو">
              <button type="button" className={styles.allCategoriesButton} onClick={(event) => openCategoryPicker(event.currentTarget)}>
                <Grid2X2 size={18} aria-hidden="true" />
                <span><strong>همهٔ دسته‌بندی‌ها</strong><small>{faCount(displaySections.length)} دسته در یک نگاه</small></span>
              </button>
              <div className={styles.viewToggle} role="group" aria-label="نوع نمایش آیتم‌های منو">
                <button type="button" data-active={viewMode === 'simple'} onClick={() => setViewMode('simple')} aria-pressed={viewMode === 'simple'}><List size={16} /> ساده</button>
                <button type="button" data-active={viewMode === 'visual'} onClick={() => setViewMode('visual')} aria-pressed={viewMode === 'visual'}><Images size={16} /> تصویری</button>
              </div>
            </div>

            <div
              ref={resultsRef}
              className={styles.results}
            >
              <div className={`${styles.resultHead} ${normalizedQuery ? styles.searchResultHead : styles.categoryResultHead}`}>
                {!normalizedQuery && selectedSection && (
                  <picture className={styles.resultArtwork}>
                    <source media="(max-width: 760px)" srcSet={EMPTY_COVER} />
                    <source media="(min-width: 900px)" srcSet={categoryArtworkFull(selectedSection.name, selectedSection.facetId, selectedSection.image?.fullUrl)} />
                    <img src={categoryArtwork(selectedSection.name, selectedSection.facetId, selectedSection.image?.url)} alt="" width={720} height={720} loading="lazy" decoding="async" />
                  </picture>
                )}
                {!normalizedQuery && <span className={styles.resultScrim} aria-hidden="true" />}
                <div className={styles.resultCopy}>
                  <p className={styles.resultEyebrow}>{normalizedQuery ? 'نتیجهٔ جست‌وجو در تمام منو' : 'دستهٔ انتخاب‌شده'}</p>
                  <h3>{normalizedQuery ? `«${deferredQuery.trim()}»` : selectedSection?.name}</h3>
                  {!normalizedQuery && selectedSection?.description && <p>{selectedSection.description}</p>}
                </div>
                <span className={styles.resultCount} role="status">{fa(matchingCount)} آیتم</span>
              </div>

              {matchingCount === 0 ? (
                <div className={styles.noResult}>
                  <Search size={25} aria-hidden="true" />
                  <strong>چیزی با این نام پیدا نشد</strong>
                  <p>نام کوتاه‌تری بنویس یا یکی از دسته‌ها را انتخاب کن.</p>
                  <button type="button" onClick={() => {
                    setQuery('')
                    writeMenuUrl(menuOpen, activeSection, '')
                  }}>پاک‌کردن جست‌وجو</button>
                </div>
              ) : (
                <div className={styles.sections}>
                  {visibleSections.map((section) => (
                    <section
                      key={section.id}
                      className={styles.menuSection}
                      aria-labelledby={normalizedQuery ? `menu-section-${section.id}` : undefined}
                    >
                      {normalizedQuery && (
                        <h4 id={`menu-section-${section.id}`} className={styles.searchSectionTitle}>{section.name}</h4>
                      )}
                      <ul className={`${styles.items} ${viewMode === 'simple' ? styles.simpleItems : ''}`}>
                        {section.items.map((item) => viewMode === 'simple' ? (
                          <li key={item.id} className={`${styles.simpleItem} ${item.available ? '' : styles.itemUnavailable}`}>
                            <Link href={paths.item(item.publicId, itemSlug(item.name))} className={styles.simpleItemLink}>
                              <span className={styles.simpleItemCopy}>
                                <span className={styles.simpleItemTitle}>{item.name}{item.featured && <Star size={13} aria-label="آیتم ویژهٔ مجموعه" className={styles.featured} />}{!item.available && <em>ناموجود</em>}</span>
                                {item.description && <span className={styles.simpleItemDesc}>{item.description}</span>}
                              </span>
                              <span className={styles.simpleDots} aria-hidden="true" />
                              {item.price !== null ? (
                                <span className={styles.simplePrice}>
                                  {activePercent > 0 && <del>{fa(item.price.toLocaleString('fa-IR'))}</del>}
                                  <strong>{item.variants.length ? 'از ' : ''}{fa(discountedPrice(item.price, activePercent)!.toLocaleString('fa-IR'))}</strong>
                                  <small>تومان</small>
                                </span>
                              ) : <span className={styles.simplePrice}><strong>قیمت روز</strong></span>}
                            </Link>
                            {item.variants.length > 0 && (
                              <ul className={styles.simpleVariants} aria-label={`سایزهای ${item.name}`}>
                                {item.variants.map((variant) => <li key={variant.id} data-available={variant.available}><span>{variant.label}</span><strong>{variant.price === null ? 'قیمت روز' : toman(discountedPrice(variant.price, activePercent)!)}</strong></li>)}
                              </ul>
                            )}
                          </li>
                        ) : (
                          <li key={item.id} className={`${styles.item} ${item.available ? '' : styles.itemUnavailable}`}>
                            {item.image ? (
                              <button type="button" className={styles.thumb} onClick={() => setLightbox(item)} aria-label={`بزرگ‌کردن تصویر ${item.name}`}>
                                <MenuItemImage src={item.image.url} fallbackSrc={logoUrl} alt={`${item.name} — ${placeName}`} width={item.image.width} height={item.image.height} />
                              </button>
                            ) : (
                              <span className={styles.thumb}><MenuItemImage src={null} fallbackSrc={logoUrl} alt="" /></span>
                            )}

                            <div className={styles.itemBody}>
                              <div className={styles.itemTitleRow}>
                                <h4 className={styles.itemName}>
                                  <Link href={paths.item(item.publicId, itemSlug(item.name))}>{item.name}</Link>
                                  {item.featured && <Star size={14} aria-label="آیتم ویژهٔ مجموعه" className={styles.featured} />}
                                </h4>
                                {!item.available && <span className={styles.soldOut}>ناموجود</span>}
                              </div>
                              {item.nameEn && <p className={styles.itemNameEn}>{item.nameEn}</p>}
                              {item.description && <p className={styles.itemDesc}>{item.description}</p>}
                              {item.variants.length > 0 && (
                                <ul className={styles.itemVariants} aria-label={`سایزهای ${item.name}`}>
                                  {item.variants.map((variant) => (
                                    <li key={variant.id} data-available={variant.available}>
                                      <span>{variant.label}</span>
                                      <strong>{variant.price === null ? 'قیمت روز' : toman(discountedPrice(variant.price,activePercent)!)}</strong>
                                      {!variant.available && <em>ناموجود</em>}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <div className={styles.itemFoot}>
                                {item.price !== null ? (
                                  <span className={styles.price}>
                                    {activePercent>0&&<del>{fa(item.price.toLocaleString('fa-IR'))}</del>}
                                    <strong>{item.variants.length ? 'از ' : ''}{fa(discountedPrice(item.price,activePercent)!.toLocaleString('fa-IR'))}</strong>
                                    <span>تومان</span>
                                  </span>
                                ) : (
                                  <span className={styles.priceUnknown}>قیمت روز</span>
                                )}
                                <Link href={paths.item(item.publicId, itemSlug(item.name))} className={styles.itemDetails}>مشاهده جزئیات</Link>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}

              {matchingCount > visibleLimit && (
                <button type="button" className={styles.loadMore} onClick={() => setVisibleLimit((current) => current + PAGE_SIZE)}>
                  <span>نمایش {fa(Math.min(PAGE_SIZE, matchingCount - visibleLimit))} مورد دیگر</span>
                  <ChevronDown size={18} aria-hidden="true" />
                </button>
              )}

              {(sourceUrl || sourceLabel || priceUpdatedLabel) && (
                <p className={`${styles.sourceNote} ${priceIsStale ? styles.sourceNoteStale : ''}`}>
                  <span>{priceIsStale ? 'نیازمند بازبینی' : sourceLabel ?? 'اطلاعات منو'}</span>
                  {priceUpdatedLabel && <> · به‌روزرسانی قیمت: {priceUpdatedLabel}</>}
                  {sourceUrl && <> · <a href={sourceUrl} target="_blank" rel="noopener noreferrer nofollow">مشاهدهٔ منبع منو</a></>}
                </p>
              )}

              <button type="button" className={styles.mobileDone} onClick={closeMenu}>بستن منو و بازگشت به صفحهٔ کافه</button>
            </div>
          </div>
        </div>
      </div>

      {categoryPickerOpen && (
        <div className={styles.categoryPickerBackdrop} onClick={closeCategoryPicker}>
          <div ref={categoryPickerRef} className={styles.categoryPicker} role="dialog" aria-modal="true" aria-labelledby="category-picker-title" onClick={(event) => event.stopPropagation()}>
            <header className={styles.categoryPickerHead}>
              <div><strong id="category-picker-title">دسته‌بندی‌های منو</strong><span>{placeName} · {faCount(displaySections.length)} دسته</span></div>
              <button ref={categoryPickerCloseRef} type="button" onClick={closeCategoryPicker} aria-label="بستن دسته‌بندی‌ها"><X size={20} /></button>
            </header>
            <div className={styles.categoryGrid}>
              {displaySections.map((section) => (
                <button key={section.id} type="button" aria-label={`${section.name}، ${faCount(section.items.length)} آیتم`} title={section.name} data-active={!categoryPickerIsEntry && !normalizedQuery && activeSection === section.id} onClick={() => chooseSection(section.id)}>
                  <picture className={styles.categoryCover}>
                    {section.image && !section.image.url.startsWith('/menu-categories/') && (
                      <source media="(max-width: 760px) and (min-resolution: 2dppx)" srcSet={section.image.fullUrl} />
                    )}
                    <source media="(min-width: 900px)" srcSet={categoryArtworkFull(section.name, section.facetId, section.image?.fullUrl)} />
                    <img src={categoryArtwork(section.name, section.facetId, section.image?.url)} alt="" width={720} height={540} loading="lazy" decoding="async" draggable={false} />
                  </picture>
                  <span className={styles.categoryScrim} aria-hidden="true" />
                  <span className={styles.categoryCardCopy}>
                    <CategoryCardName name={section.name} />
                    <small>{faCount(section.items.length)} آیتم</small>
                  </span>
                  <span className={styles.categoryCardCta} aria-hidden="true">دیدن آیتم‌ها <ArrowLeft size={18} /></span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div ref={lightboxRef} className={styles.lightbox} role="dialog" aria-modal="true" aria-label={lightbox.name} onClick={() => setLightbox(null)}>
          <button ref={lightboxCloseRef} type="button" className={styles.lightboxClose} onClick={() => setLightbox(null)} aria-label="بستن تصویر"><X size={22} aria-hidden="true" /></button>
          <figure className={styles.lightboxFigure} onClick={(event) => event.stopPropagation()}>
            <img src={lightbox.image!.fullUrl} alt={`${lightbox.name} — ${placeName}`} />
            <figcaption>
              <strong>{lightbox.name}</strong>
              {lightbox.price !== null && <span>{toman(lightbox.price)}</span>}
              {lightbox.description && <p>{lightbox.description}</p>}
            </figcaption>
          </figure>
        </div>
      )}
    </section>
  )
}

export default MenuBrowser
