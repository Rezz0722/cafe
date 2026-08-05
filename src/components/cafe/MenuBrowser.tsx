'use client'

/**
 * مرورگر منو.
 *
 * ═══ مسئله‌ی مقیاس ═══
 *
 * منوی واقعی این کافه‌ها بین ۱ تا **۲۸۷ آیتم** در **تا ۳۰ دسته** دارد. یک
 * فهرست ساده‌ی پشت‌سرهم در این مقیاس غیرقابل استفاده است: کاربری که دنبال
 * قیمت لاته است باید ۲۰۰ آیتم اسکرول کند.
 *
 * سه چیز این را حل می‌کند:
 *   ۱. نوار دسته‌ی چسبان — پرش مستقیم به هر دسته
 *   ۲. جست‌وجوی درون‌منو — «لاته» بنویس، بلافاصله پیدا شود
 *   ۳. تصویر با بارگذاری تنبل — ۵۶٪ آیتم‌ها تصویر دارند و بارکردن یک‌جای
 *      ۲۸۷ تصویر، صفحه را روی موبایل می‌خواباند
 *
 * ═══ چرا فیلتر در کلاینت ═══
 *
 * کل منوی یک کافه از قبل در HTML صفحه است (server component آن را داده)، پس
 * فیلترکردن در مرورگر بدون رفت‌وبرگشت شبکه انجام می‌شود و بلافاصله جواب
 * می‌دهد. برای ۲۸۷ آیتم، هزینه‌اش صفر است.
 */

import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { fa, toman } from '@/lib/format'
import { normalizeFa } from '@/core/text/normalize'
import styles from './MenuBrowser.module.css'

export interface MenuItemProps {
  id: number
  name: string
  nameEn: string | null
  description: string | null
  price: number | null
  priceUnknown: boolean
  available: boolean
  featured: boolean
  image: { url: string; fullUrl: string; width: number | null; height: number | null } | null
}

export interface MenuSectionProps {
  id: number
  name: string
  description: string | null
  items: MenuItemProps[]
}

interface Props {
  sections: MenuSectionProps[]
  /** نامِ کافه — برای متن جایگزین تصویرها. */
  placeName: string
  /** آدرس منوی اصلی در منبع، اگر خواستند نسخه‌ی کامل را ببینند. */
  sourceUrl?: string | null
}

export function MenuBrowser({ sections, placeName, sourceUrl }: Props) {
  const [query, setQuery] = useState('')
  const [activeSection, setActiveSection] = useState<number | 'all'>('all')
  const [onlyWithPhoto, setOnlyWithPhoto] = useState(false)
  const [lightbox, setLightbox] = useState<MenuItemProps | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // `useDeferredValue` تایپ‌کردن را روان نگه می‌دارد: فیلترِ ۲۸۷ آیتم سریع
  // است ولی رندرِ دوباره‌ی ۲۸۷ کارت نه.
  const deferredQuery = useDeferredValue(query)

  const normalizedQuery = useMemo(() => normalizeFa(deferredQuery.trim()), [deferredQuery])

  const visible = useMemo(() => {
    return sections
      .map((section) => {
        if (activeSection !== 'all' && section.id !== activeSection) {
          return { ...section, items: [] }
        }
        let items = section.items
        if (onlyWithPhoto) items = items.filter((item) => item.image)
        if (normalizedQuery) {
          items = items.filter((item) => {
            const haystack = `${normalizeFa(item.name)} ${normalizeFa(item.nameEn ?? '')} ${normalizeFa(
              item.description ?? '',
            )}`
            return haystack.includes(normalizedQuery)
          })
        }
        return { ...section, items }
      })
      .filter((section) => section.items.length > 0)
  }, [sections, activeSection, normalizedQuery, onlyWithPhoto])

  const totalItems = useMemo(
    () => sections.reduce((sum, section) => sum + section.items.length, 0),
    [sections],
  )
  const shownItems = visible.reduce((sum, section) => sum + section.items.length, 0)
  const photoCount = useMemo(
    () => sections.reduce((sum, s) => sum + s.items.filter((i) => i.image).length, 0),
    [sections],
  )

  const jumpTo = (sectionId: number) => {
    setActiveSection('all')
    setQuery('')
    // بعد از پاک‌شدن فیلتر، عنصر باید دوباره در DOM باشد.
    requestAnimationFrame(() => {
      document.getElementById(`menu-section-${sectionId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  if (totalItems === 0) {
    return (
      <div className={styles.emptyMenu}>
        <p>منوی این مجموعه هنوز ثبت نشده است.</p>
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
            دیدن منو در سایت مجموعه
          </a>
        )}
      </div>
    )
  }

  return (
    <section className={styles.wrap} aria-labelledby="menu-heading">
      <header className={styles.head}>
        <div>
          <h2 id="menu-heading" className={styles.title}>
            منو
          </h2>
          <p className={styles.subtitle}>
            {fa(totalItems)} آیتم در {fa(sections.length)} دسته
            {photoCount > 0 && <> · {fa(photoCount)} آیتم با عکس</>}
          </p>
        </div>
      </header>

      <div className={styles.controls}>
        <div className={styles.searchBox}>
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="در منو بگرد — مثلاً لاته، پاستا، کروسان"
            aria-label="جست‌وجو در منو"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="پاک‌کردن جست‌وجو">
              ×
            </button>
          )}
        </div>
        {photoCount > 0 && (
          <label className={styles.photoToggle}>
            <input
              type="checkbox"
              checked={onlyWithPhoto}
              onChange={(event) => setOnlyWithPhoto(event.target.checked)}
            />
            فقط با عکس
          </label>
        )}
      </div>

      {/* نوار دسته — چسبان، تا در منوی ۲۸۷ آیتمی همیشه در دسترس باشد */}
      <nav className={styles.sectionNav} aria-label="دسته‌های منو">
        <button
          type="button"
          className={`${styles.chip} ${activeSection === 'all' ? styles.chipActive : ''}`}
          onClick={() => setActiveSection('all')}
        >
          همه
        </button>
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`${styles.chip} ${activeSection === section.id ? styles.chipActive : ''}`}
            onClick={() =>
              activeSection === section.id ? jumpTo(section.id) : setActiveSection(section.id)
            }
          >
            {section.name}
            <span className={styles.chipCount}>{fa(section.items.length)}</span>
          </button>
        ))}
      </nav>

      {normalizedQuery && (
        <p className={styles.resultCount} role="status">
          {shownItems > 0
            ? `${fa(shownItems)} آیتم پیدا شد`
            : 'چیزی با این نام در منو نیست'}
        </p>
      )}

      <div ref={listRef} className={styles.sections}>
        {visible.map((section) => (
          <div key={section.id} id={`menu-section-${section.id}`} className={styles.section}>
            <h3 className={styles.sectionTitle}>
              {section.name}
              <span className={styles.sectionCount}>{fa(section.items.length)} آیتم</span>
            </h3>
            {section.description && <p className={styles.sectionDesc}>{section.description}</p>}
            <ul className={styles.items}>
              {section.items.map((item) => (
                <li
                  key={item.id}
                  className={`${styles.item} ${item.available ? '' : styles.itemUnavailable}`}
                >
                  {item.image ? (
                    <button
                      type="button"
                      className={styles.thumbButton}
                      onClick={() => setLightbox(item)}
                      aria-label={`بزرگ‌کردن تصویر ${item.name}`}
                    >
                      {/* width/height در دیتابیس ثبت شده تا چیدمان با
                          رسیدن هر تصویر نپرد. */}
                      <img
                        src={item.image.url}
                        alt={`${item.name} — ${placeName}`}
                        width={item.image.width ?? 400}
                        height={item.image.height ?? 400}
                        loading="lazy"
                        decoding="async"
                        className={styles.thumb}
                      />
                    </button>
                  ) : (
                    <span className={styles.thumbEmpty} aria-hidden="true" />
                  )}

                  <div className={styles.itemBody}>
                    <div className={styles.itemHead}>
                      <h4 className={styles.itemName}>
                        {item.name}
                        {item.featured && (
                          <span className={styles.featured} title="آیتم ویژه‌ی مجموعه">
                            ★
                          </span>
                        )}
                      </h4>
                      {item.nameEn && <span className={styles.itemNameEn}>{item.nameEn}</span>}
                    </div>
                    {item.description && <p className={styles.itemDesc}>{item.description}</p>}
                    {!item.available && <span className={styles.soldOut}>موجود نیست</span>}
                  </div>

                  <div className={styles.itemPrice}>
                    {item.price !== null ? (
                      <>
                        <span className={styles.priceValue}>{fa(item.price.toLocaleString('fa-IR'))}</span>
                        <span className={styles.priceUnit}>تومان</span>
                      </>
                    ) : (
                      /* صفر و «۰٫۱» در منبع قیمت نبودند؛ نمایش «۰ تومان»
                         دروغ می‌شد. */
                      <span className={styles.priceUnknown}>قیمت روز</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {lightbox && (
        <div
          className={styles.lightbox}
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.name}
          onClick={() => setLightbox(null)}
        >
          <button type="button" className={styles.lightboxClose} aria-label="بستن">
            ×
          </button>
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

      {sourceUrl && (
        <p className={styles.sourceNote}>
          منو از{' '}
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
            منوی رسمی مجموعه
          </a>{' '}
          گرفته شده. قیمت‌ها ممکن است تغییر کرده باشد.
        </p>
      )}
    </section>
  )
}

export default MenuBrowser
