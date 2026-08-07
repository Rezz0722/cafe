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
import { Search, Star, X } from 'lucide-react'
import { fa, toman } from '@/lib/format'
import { normalizeFa } from '@/core/text/normalize'
import { MenuItemImage } from './MenuItemImage'
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
  /**
   * لوگوی مجموعه — جایگزینِ تصویرِ آیتم‌هایی که عکس اختصاصی ندارند.
   *
   * بدون این، آن آیتم‌ها یک مربع خالی می‌گرفتند؛ در فهرستی که نیمی از
   * آیتم‌هایش عکس دارند، آن مربع‌ها شبیه خرابیِ بارگذاری دیده می‌شدند.
   */
  logoUrl?: string | null
  /** آدرس منوی اصلی در منبع، اگر خواستند نسخه‌ی کامل را ببینند. */
  sourceUrl?: string | null
}

export function MenuBrowser({ sections, placeName, logoUrl = null, sourceUrl }: Props) {
  const [query, setQuery] = useState('')
  const [activeSection, setActiveSection] = useState<number | 'all'>('all')
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
  }, [sections, activeSection, normalizedQuery])

  const totalItems = useMemo(
    () => sections.reduce((sum, section) => sum + section.items.length, 0),
    [sections],
  )
  const shownItems = visible.reduce((sum, section) => sum + section.items.length, 0)

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
          </p>
        </div>
      </header>

      {/*
        چک‌باکس «فقط با عکس» برداشته شد.

        دو دلیل: (۱) حالا هر آیتم تصویر دارد — یا عکس خودش یا لوگوی مجموعه —
        پس «با عکس» دیگر تفکیک‌کننده نیست. (۲) کاربر دنبال *غذا* می‌گردد نه
        دنبال عکس؛ آن فیلتر نصفِ منو را پنهان می‌کرد بدون اینکه به سؤالی جواب
        بدهد.
      */}
      <div className={styles.controls}>
        <div className={styles.searchBox}>
          <Search size={17} aria-hidden="true" className={styles.searchIcon} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="در منو بگرد — مثلاً لاته، پاستا، کروسان"
            aria-label="جست‌وجو در منو"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="پاک‌کردن جست‌وجو">
              <X size={17} aria-hidden="true" />
            </button>
          )}
        </div>
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
                  {/*
                    تصویر همیشه هست: عکس آیتم، وگرنه لوگوی مجموعه، وگرنه آیکون.
                    فقط عکسِ *اختصاصی* قابل بزرگ‌شدن است — لایت‌باکسِ لوگو
                    وعده‌ای است که چیزی پشتش نیست.
                  */}
                  {item.image ? (
                    <button
                      type="button"
                      className={styles.thumb}
                      onClick={() => setLightbox(item)}
                      aria-label={`بزرگ‌کردن تصویر ${item.name}`}
                    >
                      <MenuItemImage
                        src={item.image.url}
                        fallbackSrc={logoUrl}
                        alt={`${item.name} — ${placeName}`}
                        // width/height در دیتابیس ثبت شده تا چیدمان با رسیدن
                        // هر تصویر نپرد.
                        width={item.image.width}
                        height={item.image.height}
                      />
                    </button>
                  ) : (
                    <span className={styles.thumb}>
                      <MenuItemImage src={null} fallbackSrc={logoUrl} alt="" />
                    </span>
                  )}

                  <div className={styles.itemBody}>
                    <h4 className={styles.itemName}>
                      {item.name}
                      {item.featured && (
                        <Star
                          size={14}
                          aria-label="آیتم ویژه‌ی مجموعه"
                          className={styles.featured}
                        />
                      )}
                    </h4>
                    {item.nameEn && <p className={styles.itemNameEn}>{item.nameEn}</p>}
                    {item.description && <p className={styles.itemDesc}>{item.description}</p>}

                    <div className={styles.itemFoot}>
                      {item.price !== null ? (
                        <span className={styles.price}>
                          <span className={styles.priceValue}>
                            {fa(item.price.toLocaleString('fa-IR'))}
                          </span>
                          <span className={styles.priceUnit}>تومان</span>
                        </span>
                      ) : (
                        /* صفر و «۰٫۱» در منبع قیمت نبودند؛ نمایش «۰ تومان»
                           دروغ می‌شد. */
                        <span className={styles.priceUnknown}>قیمت روز</span>
                      )}
                      {!item.available && <span className={styles.soldOut}>موجود نیست</span>}
                    </div>
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
            <X size={22} aria-hidden="true" />
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
