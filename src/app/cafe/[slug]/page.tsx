import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CafeMap } from '@/components/map/CafeMap'
import { DirectionsBar } from '@/components/cafe/DirectionsBar'
import { MenuBrowser } from '@/components/cafe/MenuBrowser'
import { ReviewForm } from '@/components/cafe/ReviewForm'
import { SavePlaceButton } from '@/components/cafe/SavePlaceButton'
import { BreadcrumbJsonLd, PlaceJsonLd } from '@/components/seo/PlaceJsonLd'
import { getSession } from '@/core/auth/currentUser'
import { computeOpenState, weekSchedule } from '@/core/hours/openNow'
import { getMapLabels } from '@/core/map/labels'
import {
  getPlaceDetail,
  getPlaceDishes,
  getPlaceFacetSummary,
  listNearbyPlaces,
  listPlaceReviews,
} from '@/core/places/queries'
import { getMyReviewFor, listSavedPlaceIds } from '@/core/user/userData'
import { fa, toman } from '@/lib/format'
import { authUrl, paths } from '@/routes'
import styles from './page.module.css'

/**
 * صفحه‌ی کافه — مهم‌ترین صفحه‌ی سایت.
 *
 * ═══ چه چیزی عوض شد و چرا ═══
 *
 * چیدمان قبلی برای داده‌ی نمونه طراحی شده بود: چند تگ، یک بازه‌ی قیمت و منوی
 * چندآیتمی. داده‌ی واقعی چیز دیگری است — تا **۲۸۷ آیتم منو** در **۳۰ دسته**،
 * ۵۶٪ آیتم‌ها عکس‌دار، ساعت کاری با شیفت شکسته، و چند شماره تلفن. چیدمان
 * قبلی زیر این حجم می‌شکست.
 *
 * چیدمان جدید بر ترتیب سؤال‌های واقعی کاربر بنا شده:
 *   ۱. الان باز است؟   → نشانِ وضعیت در سرصفحه، اولین چیز بعد از نام
 *   ۲. چطور بروم؟      → دکمه‌ی مسیریابی، بلافاصله زیر نام
 *   ۳. چه دارد و چند؟  → منو با جست‌وجو و پرش دسته
 *   ۴. کجاست؟          → نقشه‌ی آفلاین با پین
 *   ۵. چه کسی رفته؟    → نظرها
 */

interface PageProps {
  params: Promise<{ slug: string }>
}

/**
 * `force-dynamic` عمدی است.
 *
 * `generateStaticParams` برای ۳۲۶ کافه یعنی ۳۲۶ بار خواندن کل منو در زمان
 * build (چند دقیقه)، و هر ویرایش کافه‌دار صفحه را بیات می‌گذارد. رندر در لحظه
 * روی MySQL محلی چند میلی‌ثانیه است.
 */
export const dynamic = 'force-dynamic'

const KIND_LABELS: Record<string, string> = {
  cafe: 'کافه',
  cafe_restaurant: 'کافه‌رستوران',
  restaurant: 'رستوران',
  bakery: 'بیکری',
  lounge: 'لانژ',
  shop: 'فروشگاه',
}

const TIER_LABELS: Record<number, string> = { 1: 'اقتصادی', 2: 'متوسط', 3: 'گران' }

const SOCIAL_LABELS: Record<string, string> = {
  instagram: 'اینستاگرام',
  telegram: 'تلگرام',
  whatsapp: 'واتساپ',
  website: 'وب‌سایت',
  reservation: 'رزرواسیون',
  virtual_tour: 'تور مجازی',
  survey: 'نظرسنجی',
  rubika: 'روبیکا',
  eitaa: 'ایتا',
  bale: 'بله',
  other: 'لینک',
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const place = await getPlaceDetail(slug)
  if (!place) return { title: 'پیدا نشد' }

  const where = place.districtName ? `${place.districtName}، مشهد` : 'مشهد'
  const title = `${place.name} — ${KIND_LABELS[place.kind] ?? 'کافه'} در ${where}`

  // توضیحات از داده‌ی واقعی ساخته می‌شود نه از یک قالب ثابت: عددِ منو و
  // میانگین قیمت همان چیزی است که در نتیجه‌ی جست‌وجو تصمیم‌ساز است.
  const bits: string[] = []
  if (place.menuItemCount > 0) bits.push(`${fa(place.menuItemCount)} آیتم منو با قیمت`)
  if (place.priceMedian) bits.push(`میانگین ${toman(place.priceMedian)}`)
  bits.push('ساعت کاری، نقشه و مسیریابی')

  const description = place.about
    ? place.about.replace(/\s+/g, ' ').slice(0, 155)
    : `${place.name} در ${where}. ${bits.join(' · ')}`

  return {
    title,
    description,
    alternates: { canonical: paths.cafe(place.slug) },
    openGraph: {
      type: 'website',
      title,
      description,
      url: paths.cafe(place.slug),
      images: place.logo ? [{ url: place.logo.fullUrl }] : undefined,
    },
  }
}

export default async function CafePage({ params }: PageProps) {
  const { slug } = await params
  const place = await getPlaceDetail(slug)
  if (!place) notFound()

  const { user } = await getSession()

  const [facets, dishes, reviews, nearby] = await Promise.all([
    getPlaceFacetSummary(place.id),
    getPlaceDishes(place.id),
    listPlaceReviews(place.id),
    place.coords && place.geoStatus === 'ok'
      ? listNearbyPlaces(place.coords, { excludePlaceId: place.id, limit: 6 })
      : Promise.resolve([]),
  ])

  // داده‌ی مخصوص کاربرِ وارد‌شده — فقط اگر نشستی وجود داشته باشد.
  const [savedIds, myReview] = user
    ? await Promise.all([listSavedPlaceIds(user.id), getMyReviewFor(user.id, place.id)])
    : [[], null]
  const isSaved = savedIds.includes(place.id)

  const open = computeOpenState(place.hours)
  const week = weekSchedule(place.hours)
  const labels = getMapLabels({ zoom: 14, limit: 24 })
  const kindLabel = KIND_LABELS[place.kind] ?? 'کافه'

  /**
   * دیش‌هایی که اینجا حداقل ۲۰٪ ارزان‌تر از میانه‌ی شهری‌اند.
   *
   * این یک واقعیتِ اثبات‌پذیر است، نه تبلیغ: هر دو عدد از داده‌ی واقعی می‌آیند
   * و در کنار هم نمایش داده می‌شوند تا کاربر خودش قضاوت کند.
   */
  const goodValue = dishes
    .filter(
      (dish) =>
        dish.minPrice !== null &&
        dish.cityMedian !== null &&
        dish.minPrice < dish.cityMedian * 0.8,
    )
    .slice(0, 4)

  return (
    <>
      <PlaceJsonLd
        place={{
          name: place.name,
          slug: place.slug,
          kind: place.kind,
          address: place.address,
          coords: place.coords,
          phone: place.phones[0]?.phone ?? null,
          priceTier: place.priceTier,
          rating: place.rating,
          ratingCount: place.ratingCount,
          imageUrl: place.logo?.fullUrl ?? null,
          description: place.about,
          hours: week.map((day) => ({ dow: day.dow, ranges: day.ranges })),
          menu: place.menu.map((section) => ({
            name: section.name,
            items: section.items.map((item) => ({
              name: item.name,
              description: item.description,
              price: item.price,
            })),
          })),
        }}
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'کافه‌گرد', path: paths.home },
          ...(place.districtName && place.districtId
            ? [{ name: place.districtName, path: paths.district(place.districtSlug ?? place.districtId) }]
            : []),
          { name: place.name, path: paths.cafe(place.slug) },
        ]}
      />

      <article className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroMain}>
            {place.logo ? (
              <img
                src={place.logo.url}
                alt={`لوگوی ${place.name}`}
                width={place.logo.width ?? 96}
                height={place.logo.height ?? 96}
                className={styles.logo}
              />
            ) : (
              <span className={styles.logoEmpty} aria-hidden="true">
                ☕
              </span>
            )}

            <div className={styles.heroText}>
              <div className={styles.badges}>
                <span className={styles.kind}>{kindLabel}</span>
                {place.districtName && place.districtId && (
                  <Link
                    href={paths.district(place.districtSlug ?? place.districtId)}
                    className={styles.district}
                  >
                    {place.districtName}
                  </Link>
                )}
                {place.ribbon && <span className={styles.ribbon}>{place.ribbon}</span>}
              </div>

              <h1 className={styles.name}>{place.name}</h1>
              {place.nameEn && <p className={styles.nameEn}>{place.nameEn}</p>}

              <div className={styles.metaRow}>
                <span
                  className={`${styles.openBadge} ${
                    open.status === 'open'
                      ? styles.openNow
                      : open.status === 'closed'
                        ? styles.closedNow
                        : styles.unknownNow
                  }`}
                >
                  {open.label}
                </span>
                {open.subLabel && <span className={styles.openSub}>{open.subLabel}</span>}
              </div>

              {place.address && <p className={styles.address}>{place.address}</p>}
            </div>
          </div>

          <div className={styles.actionRow}>
            <DirectionsBar
              lat={place.coords?.lat ?? null}
              lng={place.coords?.lng ?? null}
              name={place.name}
              address={place.address}
              phones={place.phones}
              instagram={place.instagram}
              geoStatus={place.geoStatus}
            />
            <SavePlaceButton
              placeId={place.id}
              slug={place.slug}
              initialSaved={isSaved}
              signedIn={!!user}
              authHref={authUrl(paths.cafe(place.slug))}
            />
          </div>
        </header>

        <section className={styles.stats} aria-label="خلاصه">
          {place.priceMedian !== null && (
            <div className={styles.stat}>
              <span className={styles.statValue}>{toman(place.priceMedian)}</span>
              <span className={styles.statLabel}>میانگین قیمت منو</span>
            </div>
          )}
          {place.priceMin !== null && place.priceMax !== null && (
            <div className={styles.stat}>
              <span className={styles.statValue}>
                {fa(place.priceMin.toLocaleString('fa-IR'))} –{' '}
                {fa(place.priceMax.toLocaleString('fa-IR'))}
              </span>
              <span className={styles.statLabel}>بازه‌ی قیمت (تومان)</span>
            </div>
          )}
          <div className={styles.stat}>
            <span className={styles.statValue}>{TIER_LABELS[place.priceTier] ?? '—'}</span>
            <span className={styles.statLabel}>رده‌ی قیمت</span>
          </div>
          {place.menuItemCount > 0 && (
            <div className={styles.stat}>
              <span className={styles.statValue}>{fa(place.menuItemCount)}</span>
              <span className={styles.statLabel}>آیتم منو</span>
            </div>
          )}
          {place.ratingCount > 0 && (
            <div className={styles.stat}>
              <span className={styles.statValue}>{fa(place.rating.toFixed(1))}</span>
              <span className={styles.statLabel}>از {fa(place.ratingCount)} نظر</span>
            </div>
          )}
        </section>

        {place.priceUnitFixed && (
          /* شفافیت درباره‌ی دست‌کاری داده: قیمت‌های این مجموعه در منبع به
             «هزار تومان» بود و اصلاح شد. پنهان‌کردنش یعنی اگر اشتباه کرده
             باشیم، کاربر هیچ راهی برای فهمیدنش ندارد. */
          <p className={styles.dataNote}>
            قیمت‌های منوی این مجموعه در منبع به «هزار تومان» ثبت شده بود و برای نمایش به
            تومان تبدیل شده است.
          </p>
        )}

        <div className={styles.grid}>
          <div className={styles.main}>
            {place.about && (
              <section className={styles.about}>
                <h2 className={styles.sectionHeading}>درباره</h2>
                {place.about
                  .split('\n')
                  .filter(Boolean)
                  .map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
              </section>
            )}

            {facets.length > 0 && (
              <section className={styles.facets}>
                <h2 className={styles.sectionHeading}>اینجا چه پیدا می‌کنید</h2>
                <p className={styles.facetsNote}>از منوی واقعی استخراج شده — نه برچسبِ دستی.</p>
                <ul className={styles.facetList}>
                  {facets.map((facet) => (
                    <li key={facet.facetId} className={styles.facetChip}>
                      <span className={styles.facetIcon} aria-hidden="true">
                        {facet.icon}
                      </span>
                      <span className={styles.facetLabel}>{facet.labelFa}</span>
                      <span className={styles.facetCount}>{fa(facet.itemCount)} آیتم</span>
                      {facet.minPrice !== null && (
                        <span className={styles.facetPrice}>از {toman(facet.minPrice)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {goodValue.length > 0 && (
              <section className={styles.value}>
                <h2 className={styles.sectionHeading}>ارزان‌تر از میانگین شهر</h2>
                <ul className={styles.valueList}>
                  {goodValue.map((dish) => (
                    <li key={dish.dishId}>
                      <strong>{dish.nameFa}</strong>
                      <span className={styles.valuePrice}>{toman(dish.minPrice!)}</span>
                      <span className={styles.valueCity}>
                        میانه‌ی شهر {toman(dish.cityMedian!)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <MenuBrowser sections={place.menu} placeName={place.name} sourceUrl={place.menuUrl} />

            <section className={styles.reviews} id="reviews">
              <h2 className={styles.sectionHeading}>نظرها</h2>
              {reviews.length === 0 ? (
                <p className={styles.noReviews}>
                  هنوز نظری ثبت نشده. اگر اینجا رفته‌اید، اولین نفر باشید.
                </p>
              ) : (
                <ul className={styles.reviewList}>
                  {reviews.map((review) => (
                    <li key={review.id} className={styles.review}>
                      <div className={styles.reviewHead}>
                        <strong>{review.authorName || 'کاربر کافه‌گرد'}</strong>
                        <span className={styles.reviewStars} aria-label={`${review.stars} از ۵`}>
                          {'★'.repeat(review.stars)}
                          <span className={styles.starsDim}>{'★'.repeat(5 - review.stars)}</span>
                        </span>
                      </div>
                      {review.text && <p className={styles.reviewText}>{review.text}</p>}
                    </li>
                  ))}
                </ul>
              )}

              <div className={styles.reviewFormWrap}>
                <h3 className={styles.reviewFormTitle}>
                  {myReview ? 'ویرایش نظر تو' : 'نظرت را بنویس'}
                </h3>
                <ReviewForm
                  placeId={place.id}
                  slug={place.slug}
                  placeName={place.name}
                  signedIn={!!user}
                  existing={myReview}
                  authHref={authUrl(`${paths.cafe(place.slug)}#reviews`)}
                />
              </div>
            </section>
          </div>

          <aside className={styles.side}>
            <section className={styles.card}>
              <h2 className={styles.sideHeading}>روی نقشه</h2>
              {place.coords && place.geoStatus === 'ok' ? (
                <CafeMap
                  places={[
                    {
                      id: place.id,
                      slug: place.slug,
                      name: place.name,
                      lat: place.coords.lat,
                      lng: place.coords.lng,
                      logoUrl: place.logo?.url ?? null,
                    },
                  ]}
                  labels={labels}
                  focusSlug={place.slug}
                  center={place.coords}
                  zoom={16}
                  height="240px"
                  showLocate={false}
                />
              ) : (
                <p className={styles.mapMissing}>
                  {place.geoStatus === 'out_of_area'
                    ? 'مختصات این مجموعه بیرون از محدوده‌ی مشهد ثبت شده و روی نقشه‌ی شهر نمی‌آید.'
                    : 'مختصات این مجموعه ثبت نشده است.'}
                </p>
              )}
            </section>

            <section className={styles.card}>
              <h2 className={styles.sideHeading}>ساعت کاری</h2>
              <table className={styles.hoursTable}>
                <tbody>
                  {week.map((day) => (
                    <tr key={day.dow} className={day.isToday ? styles.today : undefined}>
                      <th scope="row">{day.dayName}</th>
                      <td>
                        {day.unknown ? (
                          <span className={styles.hoursUnknown}>نامشخص</span>
                        ) : day.closed ? (
                          <span className={styles.hoursClosed}>تعطیل</span>
                        ) : (
                          /* هر شیفت جدا نمایش داده می‌شود. ادغام «۱۲–۱۶:۳۰» و
                             «۲۰–۲۳:۳۰» در یک بازه، ساعت ۱۸ را «باز» نشان
                             می‌داد که نیست. */
                          day.ranges.map((range) => (
                            <span key={range} className={styles.hoursRange}>
                              {fa(range)}
                            </span>
                          ))
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {(place.phones.length > 0 || place.socials.length > 0) && (
              <section className={styles.card}>
                <h2 className={styles.sideHeading}>تماس و شبکه‌ها</h2>
                <ul className={styles.contactList}>
                  {place.phones.map((phone) => (
                    <li key={phone.phone}>
                      <a href={`tel:${phone.phone}`}>{fa(phone.phone)}</a>
                      {phone.kind === 'reservation' && (
                        <span className={styles.contactTag}>رزرو</span>
                      )}
                    </li>
                  ))}
                  {place.socials.map((social) => (
                    <li key={social.url}>
                      <a href={social.url} target="_blank" rel="noopener noreferrer nofollow">
                        {social.label ?? SOCIAL_LABELS[social.kind] ?? social.kind}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {nearby.length > 0 && (
              <section className={styles.card}>
                <h2 className={styles.sideHeading}>نزدیک همین‌جا</h2>
                <ul className={styles.nearbyList}>
                  {nearby.map((card) => (
                    <li key={card.id}>
                      <Link href={paths.cafe(card.slug)} className={styles.nearbyItem}>
                        {card.logo ? (
                          <img src={card.logo.url} alt="" width={38} height={38} loading="lazy" />
                        ) : (
                          <span className={styles.nearbyEmpty} aria-hidden="true">
                            ☕
                          </span>
                        )}
                        <span className={styles.nearbyBody}>
                          <strong>{card.name}</strong>
                          <span>
                            {card.distanceKm < 1
                              ? `${fa(Math.round(card.distanceKm * 1000))} متر`
                              : `${fa(card.distanceKm.toFixed(1))} کیلومتر`}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </article>
    </>
  )
}
