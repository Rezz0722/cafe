import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BackChevron, MobileShell, shellStyles } from '@/components/layout/MobileShell'
import { BookmarkButton } from '@/components/ui/BookmarkButton'
import { CafePhoto } from '@/components/ui/CafePhoto'
import { Chip } from '@/components/ui/Chip'
import { Stars } from '@/components/ui/Stars'
import { Toast } from '@/components/ui/Toast'
import { getCafe, getCafeDetail } from '@/data/cafes'
import { PRICE_LABELS, todayIndex } from '@/data/taxonomy'
import { useAuth } from '@/hooks/useAuth'
import { useSavedCafes } from '@/hooks/useSavedCafes'
import { useToast } from '@/hooks/useToast'
import { discountedPrice, fa, faDecimal, faPercent, toman } from '@/lib/format'
import { authUrl, paths } from '@/routes'
import type { Cafe, MenuItem } from '@/types'
import styles from './CafeDetailPage.module.css'

const GALLERY_COUNT = 5
const REVIEW_TOAST = 'نظر شما ثبت شد ✓'

/** In-page target of the three «مسیریابی» controls. */
const MAP_ANCHOR = '#map'

export function CafeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isLoggedIn } = useAuth()
  const { isSaved, toggle } = useSavedCafes()
  const reviewToast = useToast()
  const [categoryId, setCategoryId] = useState('')

  const detail = id ? getCafeDetail(id) : undefined

  if (!detail) {
    return (
      <MobileShell>
        <div className={styles.notFound}>
          <p className={styles.notFoundTitle}>پیدا نشد</p>
          <Link to={paths.home} className={styles.notFoundLink}>
            صفحهٔ اصلی
          </Link>
        </div>
      </MobileShell>
    )
  }

  const cafeId = detail.id
  const saved = isSaved(cafeId)
  const today = todayIndex()
  const category = detail.menu.find((c) => c.id === categoryId) ?? detail.menu[0]
  const similar = detail.similar.map(getCafe).filter((c): c is Cafe => Boolean(c))

  /** Both save controls and the review CTA need a signed-in user first. */
  function requireAuth(): boolean {
    if (isLoggedIn) return true
    navigate(authUrl(paths.cafe(cafeId)))
    return false
  }

  function handleSave() {
    if (requireAuth()) toggle(cafeId)
  }

  function handleWriteReview() {
    if (requireAuth()) reviewToast.show()
  }

  return (
    <MobileShell>
      <div className={styles.page}>
        {/* ===== cover ===== */}
        <div className={styles.cover}>
          <CafePhoto alt={`فضای ${detail.name}`} placeholder="عکس کاور کافه" loading="eager" />
          <div className={styles.coverScrim} aria-hidden="true" />
          <button
            type="button"
            className={styles.coverBack}
            onClick={() => navigate(-1)}
            aria-label="بازگشت"
          >
            <BackChevron />
          </button>
          <div className={styles.coverSave}>
            <BookmarkButton saved={saved} onToggle={handleSave} cafeName={detail.name} />
          </div>
          <div className={styles.coverCopy}>
            <h1 className={styles.coverName}>{detail.name}</h1>
            <div className={styles.coverMeta}>{`${detail.type} · محلهٔ ${detail.hood}`}</div>
          </div>
        </div>

        {/* ===== key info ===== */}
        <div className={styles.infoBar}>
          <div className={styles.infoCell}>
            <div className={styles.infoValue}>
              <span className={styles.star} aria-hidden="true">
                ★
              </span>
              {faDecimal(detail.rating)}
            </div>
            <div className={styles.infoLabel}>{`${fa(detail.reviewCount)} نظر`}</div>
          </div>
          <div className={styles.infoDivider} aria-hidden="true" />
          <div className={styles.infoCell}>
            <div
              className={`${styles.infoValue} ${detail.isOpen ? styles.statusOpen : styles.statusClosed}`}
            >
              {detail.isOpen ? detail.openText : 'بسته است'}
            </div>
            <div className={styles.infoLabel}>{detail.isOpen ? detail.openSub : 'امروز تعطیل'}</div>
          </div>
          <div className={styles.infoDivider} aria-hidden="true" />
          <div className={styles.infoCell}>
            <div className={styles.infoValue}>{PRICE_LABELS[detail.priceKey]}</div>
            <div className={styles.infoLabel}>سطح قیمت</div>
          </div>
        </div>

        {/* ===== intent tags ===== */}
        <div className={styles.tags}>
          {detail.tags.map((tag) => (
            <span key={tag} className={styles.tag}>
              {tag}
            </span>
          ))}
        </div>

        {/* ===== quick actions ===== */}
        <div className={styles.actions}>
          <a href={MAP_ANCHOR} className={`${styles.action} ${styles.actionPrimary}`}>
            <RouteIcon size={22} />
            مسیریابی
          </a>
          <a href="tel:00000000" className={styles.action}>
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--c-primary-strong)"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            تماس
          </a>
          <a href="#" className={styles.action}>
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--c-pastel-pink-strong)"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="2" y="2" width="20" height="20" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
            </svg>
            اینستاگرام
          </a>
        </div>

        {/* ===== menu ===== */}
        <section className={styles.blockFlush}>
          <h2 className={styles.blockTitleFlush}>منو</h2>
          <div className={`${shellStyles.scrollX} ${styles.rail}`}>
            {detail.menu.map((cat) => (
              <Chip
                key={cat.id}
                label={cat.name}
                size="lg"
                selected={cat.id === category.id}
                onClick={() => setCategoryId(cat.id)}
              />
            ))}
          </div>
          <div className={styles.menuList}>
            {category.items.map((item) => (
              <MenuItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>

        {/* ===== gallery ===== */}
        <section className={styles.blockFlush}>
          <h2 className={styles.blockTitleFlush}>عکس‌های کافه</h2>
          <div className={`${shellStyles.scrollX} ${styles.rail}`}>
            {Array.from({ length: GALLERY_COUNT }, (_, index) => (
              <div key={index} className={styles.galleryItem}>
                <CafePhoto alt="" placeholder="عکس" />
              </div>
            ))}
          </div>
        </section>

        {/* ===== opening hours ===== */}
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>ساعات کاری</h2>
          <div className={styles.hoursCard}>
            {detail.hours.map((hour, index) => (
              <div
                key={hour.day}
                className={`${styles.hoursRow} ${index === today ? styles.hoursRowToday : ''}`}
              >
                <span className={styles.hoursDay}>
                  {hour.day}
                  {index === today && <span className={styles.todayTag}>{' · امروز'}</span>}
                </span>
                <span
                  className={`${styles.hoursTime} ${hour.closed ? styles.hoursClosed : ''}`}
                  dir={hour.closed ? undefined : 'ltr'}
                >
                  {hour.closed ? 'تعطیل' : `${hour.from} - ${hour.to}`}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ===== location ===== */}
        <section className={styles.block} id="map">
          <h2 className={styles.blockTitle}>موقعیت</h2>
          <div className={styles.mapFrame}>
            <svg
              className={styles.mapPin}
              width="38"
              height="38"
              viewBox="0 0 24 24"
              fill="var(--c-primary)"
              stroke="#fff"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" fill="#fff" stroke="none" />
            </svg>
          </div>
          <p className={styles.address}>{detail.address}</p>
          <a href={MAP_ANCHOR} className={styles.routeOutline}>
            <RouteIcon size={19} />
            مسیریابی
          </a>
        </section>

        {/* ===== reviews ===== */}
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>نظرها و امتیازها</h2>
          <div className={styles.ratingCard}>
            <div className={styles.ratingSummary}>
              <div className={styles.ratingValue}>{faDecimal(detail.rating)}</div>
              <Stars count={detail.rating} />
            </div>
            <p className={styles.ratingNote}>
              {`میانگین امتیاز از ${fa(detail.reviewCount)} نظر واقعیِ کاربران. امتیاز فقط با نظر کاربرها تعیین می‌شه.`}
            </p>
          </div>

          <div className={styles.reviewList}>
            {detail.reviews.map((review) => (
              <article key={review.id} className={styles.reviewCard}>
                <div className={styles.reviewHead}>
                  <div className={styles.avatar} aria-hidden="true">
                    {review.author.slice(0, 1)}
                  </div>
                  <div className={styles.reviewWho}>
                    <div className={styles.reviewNameRow}>
                      <span className={styles.reviewName}>{review.author}</span>
                      {review.badge && <span className={styles.reviewBadge}>{review.badge}</span>}
                    </div>
                    <div className={styles.reviewDate}>{review.date}</div>
                  </div>
                  <Stars count={review.stars} />
                </div>
                <p className={styles.reviewText}>{review.text}</p>
              </article>
            ))}
          </div>

          <button
            type="button"
            className={`${shellStyles.primaryButton} ${styles.reviewCta}`}
            onClick={handleWriteReview}
          >
            ثبت نظر
          </button>
        </section>

        {/* ===== similar venues ===== */}
        <section className={styles.blockFlush}>
          <h2 className={styles.blockTitleFlush}>کافه‌های مشابه</h2>
          <div className={`${shellStyles.scrollX} ${styles.rail}`}>
            {similar.map((cafe) => (
              <Link key={cafe.id} to={paths.cafe(cafe.id)} className={styles.similarCard}>
                <div className={styles.similarMedia}>
                  <CafePhoto alt="" placeholder="عکس" />
                </div>
                <div className={styles.similarBody}>
                  <div className={styles.similarName}>{cafe.name}</div>
                  <div className={styles.similarHood}>{cafe.hood}</div>
                  <div className={styles.similarRating}>
                    <span className={styles.star} aria-hidden="true">
                      ★
                    </span>
                    {faDecimal(cafe.rating)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* ===== sticky bottom bar ===== */}
      <div className={styles.stickyBar}>
        <button
          type="button"
          className={`${styles.saveButton} ${saved ? styles.saveButtonOn : ''}`}
          onClick={handleSave}
          aria-pressed={saved}
        >
          {saved ? 'ذخیره شد ✓' : 'ذخیره'}
        </button>
        <a href={MAP_ANCHOR} className={styles.routeSolid}>
          <RouteIcon size={19} />
          مسیریابی
        </a>
      </div>

      <Toast visible={reviewToast.visible} message={REVIEW_TOAST} />
    </MobileShell>
  )
}

interface RouteIconProps {
  size: number
}

function RouteIcon({ size }: RouteIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="3 11 22 2 13 21 11 13 3 11" />
    </svg>
  )
}

interface MenuItemCardProps {
  item: MenuItem
}

function MenuItemCard({ item }: MenuItemCardProps) {
  const discount = item.discount ?? 0
  const hasDiscount = discount > 0

  return (
    <div className={styles.menuItem}>
      <div className={styles.menuMedia}>
        <CafePhoto alt="" placeholder="عکس" />
      </div>
      <div className={styles.menuBody}>
        <div className={styles.menuName}>{item.name}</div>
        {item.en && (
          <div className={styles.menuEn} dir="ltr">
            {item.en}
          </div>
        )}
        <div className={styles.menuDesc}>{item.desc ?? '—'}</div>
        <div className={styles.menuPrices}>
          {hasDiscount ? (
            <>
              <span className={styles.priceWas}>{toman(item.price)}</span>
              <span className={styles.priceNow}>
                {toman(discountedPrice(item.price, item.discount))}
              </span>
              <span className={styles.discountBadge}>{faPercent(discount)}</span>
            </>
          ) : (
            <span className={styles.price}>{toman(item.price)}</span>
          )}
        </div>
      </div>
    </div>
  )
}
