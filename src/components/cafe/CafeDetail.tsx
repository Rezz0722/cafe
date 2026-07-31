'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BackChevron, MobileShell, shellStyles } from '@/components/layout/MobileShell'
import { BookmarkButton } from '@/components/ui/BookmarkButton'
import { CafePhoto } from '@/components/ui/CafePhoto'
import { Chip } from '@/components/ui/Chip'
import { Stars } from '@/components/ui/Stars'
import { Toast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { useSavedCafes } from '@/hooks/useSavedCafes'
import { useToast } from '@/hooks/useToast'
import { discountedPrice, fa, faDecimal, faPercent, relativeFa, toman } from '@/lib/format'
import { authUrl, paths } from '@/routes'
import { attributeLabel } from '@/core/taxonomy/attributes'
import { WEEKDAY_LABELS } from '@/core/hours/weekdays'
import { toPersianDow } from '@/core/hours/openState'
import { isMenuPriceStale, verificationLabel } from '@/core/quality/scores'
import { PLACE_KIND_LABELS, PRICE_TIER_LABELS } from '@/types'
import type { MenuItem, PlaceView } from '@/core/places/types'
import styles from './CafeDetail.module.css'

const REVIEW_TOAST = 'نظر شما ثبت شد ✓'
const MAP_ANCHOR = '#map'

interface SimilarCard {
  slug: string
  name: string
  rating: number
  districtName: string
}

interface CafeDetailProps {
  place: PlaceView
  districtName: string
  districtSlug: string
  similar: SimilarCard[]
}

export function CafeDetail({ place, districtName, districtSlug, similar }: CafeDetailProps) {
  const router = useRouter()
  const { isLoggedIn } = useAuth()
  const { isSaved, toggle } = useSavedCafes()
  const reviewToast = useToast()
  const [sectionId, setSectionId] = useState('')

  const saved = isSaved(place.slug)
  const today = toPersianDow(new Date())
  const section = place.menu.find((s) => s.id === sectionId) ?? place.menu[0]
  const kindLabel = PLACE_KIND_LABELS[place.kind] ?? 'کافه'

  /** هم ذخیره و هم ثبت نظر، اول نیاز به ورود دارند. */
  function requireAuth(): boolean {
    if (isLoggedIn) return true
    router.push(authUrl(paths.cafe(place.slug)))
    return false
  }

  function handleSave() {
    if (requireAuth()) toggle(place.slug)
  }

  function handleWriteReview() {
    if (requireAuth()) reviewToast.show()
  }

  return (
    <MobileShell>
      <div className={styles.page}>
        {/* ===== cover ===== */}
        <div className={styles.cover}>
          <CafePhoto
            alt={`فضای ${place.name}`}
            src={place.photos[0]?.url}
            placeholder="عکس کاور کافه"
            loading="eager"
          />
          <div className={styles.coverScrim} aria-hidden="true" />
          <button
            type="button"
            className={styles.coverBack}
            onClick={() => router.back()}
            aria-label="بازگشت"
          >
            <BackChevron />
          </button>
          <div className={styles.coverSave}>
            <BookmarkButton saved={saved} onToggle={handleSave} cafeName={place.name} />
          </div>
          <div className={styles.coverCopy}>
            <h1 className={styles.coverName}>{place.name}</h1>
            <div className={styles.coverMeta}>{`${kindLabel} · محلهٔ ${districtName}`}</div>
          </div>
        </div>

        {/* ===== key info ===== */}
        <div className={styles.infoBar}>
          <div className={styles.infoCell}>
            <div className={styles.infoValue}>
              <span className={styles.star} aria-hidden="true">
                ★
              </span>
              {faDecimal(Number(place.rawRating.toFixed(1)))}
            </div>
            <div className={styles.infoLabel}>{`${fa(place.ratingCount)} نظر`}</div>
          </div>
          <div className={styles.infoDivider} aria-hidden="true" />
          <div className={styles.infoCell}>
            <div
              className={`${styles.infoValue} ${
                place.isOpenNow ? styles.statusOpen : styles.statusClosed
              }`}
            >
              {place.openLabel}
            </div>
            <div className={styles.infoLabel}>{fa(place.openSubLabel)}</div>
          </div>
          <div className={styles.infoDivider} aria-hidden="true" />
          <div className={styles.infoCell}>
            <div className={styles.infoValue}>{PRICE_TIER_LABELS[place.priceTier]}</div>
            <div className={styles.infoLabel}>سطح قیمت</div>
          </div>
        </div>

        {/*
          نشان اعتماد — قابلیتی که در نسخه‌ی قبلی وجود نداشت.
          «۱۲ روز پیش بررسی شده» چیزی است که گوگل‌مپ نمی‌گوید و دقیقاً همان
          جایی است که ارزش داده‌محورِ محصول برای کاربر دیدنی می‌شود.
        */}
        <div className={styles.trustRow}>
          <span className={styles.trustBadge}>
            ✓ {verificationLabel(place.lastVerifiedAt)}
          </span>
          <span className={styles.trustMeta}>
            کامل‌بودن پروفایل {fa(place.qualityScore)}٪
          </span>
        </div>

        {/* ===== intent tags ===== */}
        <div className={styles.tags}>
          {place.activeAttributeIds.map((id) => (
            <span key={id} className={styles.tag}>
              {attributeLabel(id)}
            </span>
          ))}
        </div>

        {/* ===== quick actions ===== */}
        <div className={styles.actions}>
          <a href={MAP_ANCHOR} className={`${styles.action} ${styles.actionPrimary}`}>
            <RouteIcon size={22} />
            مسیریابی
          </a>
          {place.phone && (
            <a href={`tel:${place.phone}`} className={styles.action}>
              <PhoneIcon />
              تماس
            </a>
          )}
          {place.instagram && (
            <a
              href={`https://instagram.com/${place.instagram}`}
              className={styles.action}
              target="_blank"
              rel="noopener noreferrer"
            >
              <InstagramIcon />
              اینستاگرام
            </a>
          )}
        </div>

        {/* ===== menu ===== */}
        {section && (
          <section className={styles.blockFlush}>
            <h2 className={styles.blockTitleFlush}>منو</h2>
            <div className={`${shellStyles.scrollX} ${styles.rail}`}>
              {place.menu.map((s) => (
                <Chip
                  key={s.id}
                  label={s.name}
                  size="lg"
                  selected={s.id === section.id}
                  onClick={() => setSectionId(s.id)}
                />
              ))}
            </div>
            <div className={styles.menuList}>
              {section.items
                .filter((item) => item.active)
                .map((item) => (
                  <MenuItemCard key={item.id} item={item} />
                ))}
            </div>
          </section>
        )}

        {/* ===== gallery ===== */}
        {place.photos.length > 0 && (
          <section className={styles.blockFlush}>
            <h2 className={styles.blockTitleFlush}>عکس‌های کافه</h2>
            <div className={`${shellStyles.scrollX} ${styles.rail}`}>
              {place.photos.map((photo) => (
                <div key={photo.id} className={styles.galleryItem}>
                  <CafePhoto alt={photo.alt} src={photo.url} placeholder="عکس" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ===== opening hours ===== */}
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>ساعات کاری</h2>
          <div className={styles.hoursCard}>
            {WEEKDAY_LABELS.map((dayLabel, dow) => {
              const rule = place.hours.find((h) => h.dow === dow)
              const closed = !rule || rule.closed
              return (
                <div
                  key={dayLabel}
                  className={`${styles.hoursRow} ${dow === today ? styles.hoursRowToday : ''}`}
                >
                  <span className={styles.hoursDay}>
                    {dayLabel}
                    {dow === today && <span className={styles.todayTag}>{' · امروز'}</span>}
                  </span>
                  <span
                    className={`${styles.hoursTime} ${closed ? styles.hoursClosed : ''}`}
                    dir={closed ? undefined : 'ltr'}
                  >
                    {closed ? 'تعطیل' : `${fa(rule.opensAt)} - ${fa(rule.closesAt)}`}
                  </span>
                </div>
              )
            })}
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
          <p className={styles.address}>{place.address}</p>
          {districtSlug && (
            <Link href={paths.district(districtSlug)} className={styles.routeOutline}>
              همه‌ی کافه‌های {districtName}
            </Link>
          )}
        </section>

        {/* ===== reviews ===== */}
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>نظرها و امتیازها</h2>
          <div className={styles.ratingCard}>
            <div className={styles.ratingSummary}>
              <div className={styles.ratingValue}>
                {faDecimal(Number(place.rawRating.toFixed(1)))}
              </div>
              <Stars count={place.rawRating} />
            </div>
            <p className={styles.ratingNote}>
              {`میانگین امتیاز از ${fa(place.ratingCount)} نظر واقعیِ کاربران. امتیاز فقط با نظر کاربرها تعیین می‌شه.`}
            </p>
          </div>

          <div className={styles.reviewList}>
            {place.reviews.map((review) => (
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
                    <div className={styles.reviewDate}>{relativeFa(review.createdAt)}</div>
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
        {similar.length > 0 && (
          <section className={styles.blockFlush}>
            <h2 className={styles.blockTitleFlush}>کافه‌های مشابه</h2>
            <div className={`${shellStyles.scrollX} ${styles.rail}`}>
              {similar.map((cafe) => (
                <Link key={cafe.slug} href={paths.cafe(cafe.slug)} className={styles.similarCard}>
                  <div className={styles.similarMedia}>
                    <CafePhoto alt="" placeholder="عکس" />
                  </div>
                  <div className={styles.similarBody}>
                    <div className={styles.similarName}>{cafe.name}</div>
                    <div className={styles.similarHood}>{cafe.districtName}</div>
                    <div className={styles.similarRating}>
                      <span className={styles.star} aria-hidden="true">
                        ★
                      </span>
                      {faDecimal(Number(cafe.rating.toFixed(1)))}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
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

function RouteIcon({ size }: { size: number }) {
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

function PhoneIcon() {
  return (
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
  )
}

function InstagramIcon() {
  return (
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
  )
}

function MenuItemCard({ item }: { item: MenuItem }) {
  const discount = item.discount ?? 0
  const hasDiscount = discount > 0
  const stale = isMenuPriceStale(item.priceUpdatedAt)

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
        {/*
          با تورم ایران، قیمت منو ظرف چند هفته غلط می‌شود. نمایش قیمتِ کهنه
          بدون هشدار، اعتماد را از بین می‌برد — پس کهنگی را صریح می‌گوییم.
        */}
        {stale && <div className={styles.priceStale}>قیمت ممکن است به‌روز نباشد</div>}
      </div>
    </div>
  )
}
