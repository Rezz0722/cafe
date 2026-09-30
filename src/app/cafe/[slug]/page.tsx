import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LazyCafeMap } from '@/components/map/LazyCafeMap'
import { DirectionsBar } from '@/components/cafe/DirectionsBar'
import { HoursCard } from '@/components/cafe/HoursCard'
import { CafePopover, MenuOpenButton } from '@/components/cafe/CafePopover'
import { MenuBrowser } from '@/components/cafe/MenuBrowser'
import { PlaceGallery, type GalleryImage } from '@/components/cafe/PlaceGallery'
import { ReviewForm } from '@/components/cafe/ReviewForm'
import { SavePlaceButton } from '@/components/cafe/SavePlaceButton'
import { SharePlaceButton } from '@/components/cafe/SharePlaceButton'
import { ClubJoinButton } from '@/components/cafe/ClubJoinButton'
import { SuggestEdit } from '@/components/cafe/SuggestEdit'
import { Stars } from '@/components/ui/Stars'
import { Armchair, BadgeCheck, BadgePercent, CameraOff, ChevronDown, Coffee, Croissant, Database, ExternalLink, MapPin, MessageSquareText, ShoppingBag, UtensilsCrossed, WalletCards } from 'lucide-react'
import { BreadcrumbJsonLd, PlaceJsonLd } from '@/components/seo/PlaceJsonLd'
import { getSession } from '@/core/auth/currentUser'
import { getVenueDiscount } from '@/core/club/venueDiscounts'
import { discountedPrice } from '@/core/club/discount'
import { findUserById } from '@/core/auth/userRepo'
import { computeOpenState, groupedWeekSchedule, weekSchedule } from '@/core/hours/openNow'
import { getMapLabels } from '@/core/map/labels'
import {
  getPlaceDetail,
  getPlaceDishes,
  listNearbyPlaces,
  listPlaceReviews,
  listMyPlaceReviews,
} from '@/core/places/queries'
import { MaintenanceScreen } from '@/components/site/MaintenanceScreen'
import { maintenanceState } from '@/core/settings/maintenance'
import {
  getDiscoveryPolicy,
  getDataPolicy,
  getLocalePolicy,
  getMapPolicy,
  getModerationPolicy,
  getSiteName,
} from '@/core/settings/policies'
import { getMyReviewFor, listReviewableMenuItems, listSavedPlaceIds } from '@/core/user/userData'
import { fa, faCount, toman } from '@/lib/format'
import { authUrl, paths } from '@/routes'
import { ageInDays, placeIdentity, publicReviewerName } from '@/core/places/presentation'
import styles from './page.module.css'
import { listOffers, membershipFor } from '@/core/club/service'

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
 *   ۲. چطور بروم؟      → **یک** دکمه‌ی مسیریابی، بلافاصله زیر نام
 *   ۳. چه دارد و چند؟  → منو با جست‌وجو و پرش دسته
 *   ۴. کجاست؟          → نقشه‌ی آفلاین با پین
 *   ۵. چه کسی رفته؟    → نظرها
 *
 * ═══ سه چیزی که در بازبینی دوم عوض شد ═══
 *
 * ۱. **«اینجا چه پیدا می‌کنید» حذف شد.** از `place_facet` ساخته می‌شد و
 *    تکنیکاً درست بود، ولی همان چیزی را می‌گفت که نوار دسته‌ی خودِ منو
 *    چند سانتی‌متر پایین‌تر بهتر می‌گوید — با این تفاوت که به‌شکل چیپ‌های
 *    پراکنده روی موبایل سه چهار خط می‌شد و صفحه را جلوی منو سد می‌کرد.
 *    داده‌اش سر جایش است؛ فقط دیگر اینجا رندر نمی‌شود، و کوئری‌اش هم دیگر
 *    اجرا نمی‌شود.
 * ۲. **ساعت کاری از جدول هفت‌سطری به سطرهای گروهی رفت** و از ستون کنار
 *    به سرصفحه آمد. اکثر کافه‌ها شنبه–چهارشنبه یک ساعت‌اند؛ هفت سطر برای
 *    دو واقعیت، ولخرجیِ فضاست.
 * ۳. **ستون کنار روی موبایل دیگر بالای منو نمی‌آید.** نقشه + تماس +
 *    «نزدیک همین‌جا» با هم حدود یک صفحه‌ی موبایل بودند که کاربر باید قبل از
 *    رسیدن به منو رد می‌کرد. حالا آدرس و وضعیت و دکمه‌ی مسیریابی در سرصفحه
 *    همان کار را می‌کنند و منو بلافاصله بعد از اطلاعات می‌آید.
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

const NEARBY_KIND_ICON = {
  cafe: Coffee,
  cafe_restaurant: UtensilsCrossed,
  restaurant: UtensilsCrossed,
  bakery: Croissant,
  lounge: Armchair,
  shop: ShoppingBag,
} as const

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

const SOURCE_LABELS: Record<string, string> = {
  owner: 'ثبت‌شده توسط مدیر مجموعه',
  field_visit: 'بررسی میدانی کو کافه',
  instagram: 'صفحهٔ رسمی مجموعه',
  import: 'همگام‌سازی از منوی آنلاین مجموعه',
  user: 'پیشنهاد کاربران؛ در انتظار تأیید تکمیلی',
  inferred: 'محاسبه‌شده از داده‌های منو',
}

/** تمایز نسخه‌ها/شعبه‌هایی که نام و محلهٔ یکسان دارند، بدون چپاندن slug لاتین در title. */
function seoPageQualifier(slug: string, branchName: string | null): string | null {
  const branch = branchName?.replace(/\s+/g, ' ').trim()
  if (branch) return `شعبهٔ ${branch}`
  if (/(?:^|-)(?:arabic|arabi)(?:-|$)/.test(slug)) return 'منوی عربی'
  if (/(?:^|-)takeaway(?:-|$)/.test(slug)) return 'بیرون‌بر'
  const branchBySuffix: Record<string, string> = {
    'sugar-bahar': 'شعبهٔ بهار',
    'sugar-razavi': 'شعبهٔ رضوی',
    'sugar-koohsangi': 'شعبهٔ کوهسنگی',
  }
  return branchBySuffix[slug] ?? null
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const [place, locale] = await Promise.all([getPlaceDetail(slug), getLocalePolicy()])
  if (!place) return { title: 'پیدا نشد' }

  const where = place.districtName
    ? `${place.districtName}، ${locale.cityName}`
    : locale.cityName
  const qualifier = seoPageQualifier(place.slug, place.branchName)
  const title = `${place.name}${qualifier ? `، ${qualifier}` : ''} — ${KIND_LABELS[place.kind] ?? 'کافه'} در ${where}`

  // توضیحات از داده‌ی واقعی ساخته می‌شود نه از یک قالب ثابت: عددِ منو و
  // میانگین قیمت همان چیزی است که در نتیجه‌ی جست‌وجو تصمیم‌ساز است.
  const bits: string[] = []
  if (place.menuItemCount > 0) bits.push(`${fa(place.menuItemCount)} آیتم منو با قیمت`)
  if (place.priceMedian) bits.push(`میانهٔ قیمت ${toman(place.priceMedian)}`)
  bits.push('ساعت کاری، نقشه و مسیریابی')

  const about = place.about?.replace(/\s+/g, ' ').trim() ?? ''
  const factualDescription = `${place.name} در ${where}. ${bits.join(' · ')}. مشاهدهٔ منو و قیمت ثبت‌شده، ساعت کاری، آدرس، نقشه و مسیریابی در کو کافه.`
  // توضیح کوتاه منبع به‌تنهایی snippet ضعیفی می‌سازد؛ واقعیت‌های صفحه آن را
  // کامل می‌کنند. متن بلند نیز برای جلوگیری از بریدگی بی‌هدف محدود می‌شود.
  const description = (about.length >= 80
    ? about
    : `${about ? `${about} — ` : ''}${factualDescription}`
  ).slice(0, 160)

  return {
    title,
    description,
    alternates: { canonical: paths.cafe(place.slug) },
    openGraph: {
      type: 'website',
      title,
      description,
      url: paths.cafe(place.slug),
      images: place.cover
        ? [{ url: place.cover.fullUrl }]
        : place.logo
          ? [{ url: place.logo.fullUrl }]
          : undefined,
    },
  }
}

export default async function CafePage({ params }: PageProps) {
  const gate = await maintenanceState()
  if (gate.closed) {
    return <MaintenanceScreen siteName={gate.siteName} message={gate.message} />
  }

  const { slug } = await params
  const place = await getPlaceDetail(slug)
  if (!place) notFound()
  const venueDiscount = await getVenueDiscount(place.id)

  const { user } = await getSession()
  const account = user ? await findUserById(user.id) : null

  const [locale, map, discovery, dataPolicy, moderation, siteName] = await Promise.all([
    getLocalePolicy(),
    getMapPolicy(),
    getDiscoveryPolicy(),
    getDataPolicy(),
    getModerationPolicy(),
    getSiteName(),
  ])

  const [dishes, reviews, nearby, reviewableMenuItems] = await Promise.all([
    getPlaceDishes(place.id),
    listPlaceReviews(place.id),
    place.coords && place.geoStatus === 'ok'
      ? listNearbyPlaces(place.coords, {
          excludePlaceId: place.id,
          limit: 6,
          radiusKm: discovery.nearbyRadiusKm,
        })
      : Promise.resolve([]),
    listReviewableMenuItems(place.id),
  ])

  // داده‌ی مخصوص کاربرِ وارد‌شده — فقط اگر نشستی وجود داشته باشد.
  const [savedIds, myReview, ownReviews] = user
    ? await Promise.all([listSavedPlaceIds(user.id), getMyReviewFor(user.id, place.id), listMyPlaceReviews(user.id, place.id)])
    : [[], null, []]
  const isSaved = savedIds.includes(place.id)
  const [clubMembership, clubOffers] = await Promise.all([
    user ? membershipFor(user.id, place.id) : Promise.resolve(null),
    listOffers(place.id),
  ])
  // Show personal reviews (including pending) exactly once, outside the editor.
  // Only the authenticated author can see their unpublished history.
  const visibleReviews = [...ownReviews, ...reviews.filter(review => !user || review.userId !== user.id)]

  const computedOpen = computeOpenState(place.hours, new Date(), locale.timeZone)
  const open = place.status === 'temporarily_closed'
    ? { status: 'closed' as const, label: 'موقتاً تعطیل است', subLabel: 'پیش از مراجعه با مجموعه تماس بگیرید', minutesToClose: null }
    : computedOpen
  /* `week` فقط برای JSON-LD می‌ماند — گوگل ساعت را روزبه‌روز می‌خواهد.
     چیزی که کاربر می‌بیند `hourGroups` است. */
  const week = weekSchedule(place.hours, new Date(), locale.timeZone)
  const hourGroups = groupedWeekSchedule(place.hours, new Date(), locale.timeZone)
  const labels = getMapLabels({ zoom: 14, limit: 24 })
  const kindLabel = KIND_LABELS[place.kind] ?? 'کافه'
  const identity = placeIdentity(place)
  const priceAgeDays = ageInDays(place.priceLastUpdatedAt ?? place.lastVerifiedAt)
  const priceIsStale = place.priceStatsItemCount > 0 && (
    place.priceStaleItemCount > 0 || (priceAgeDays !== null && priceAgeDays > dataPolicy.stalePriceDays)
  )
  const priceDate = place.priceLastUpdatedAt ?? place.lastVerifiedAt
  const formattedPriceDate = priceDate
    ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeZone: locale.timeZone }).format(priceDate)
    : null
  const sourceLabel = SOURCE_LABELS[place.source] ?? 'دادهٔ ثبت‌شده در کو کافه'

  /* گالری فقط از تصاویر مدیریت‌شدهٔ همین شعبه می‌آید. تصویر خوراکی یا لوگو
     دیگر به‌جای عکس محیط جا زده نمی‌شود. لوگو فقط وقتی هیچ عکس واقعی ثبت
     نشده باشد، به‌عنوان fallback خنثی نمایش داده می‌شود. */
  const galleryImages: GalleryImage[] = []
  const galleryUrls = new Set<string>()
  const addGalleryImage = (image: (typeof place.logo), alt: string) => {
    if (!image || galleryUrls.has(image.url)) return
    galleryUrls.add(image.url)
    galleryImages.push({ url: image.url, fullUrl: image.fullUrl, alt, width: image.width, height: image.height })
  }
  // کاور انتخاب‌شده همیشه اول است و duplicate آن از فهرست حذف می‌شود.
  addGalleryImage(place.cover, `نمای ${place.name}`)
  for (const photo of place.photos) {
    addGalleryImage(photo, photo.alt)
  }

  // Broad, sufficiently sampled comparisons, not only hand-picked bargains.
  const comparableDishes = dishes
    .filter(
      (dish) =>
        dish.minPrice !== null &&
        dish.cityMedian !== null &&
        dish.cityPlaceCount >= dataPolicy.popularDishMinPlaces &&
        dish.minPrice > 0 && dish.cityMedian > 0 &&
        dish.minPrice >= dish.cityMedian * 0.55 && dish.minPrice <= dish.cityMedian * 2,
    )
    .slice(0, 6)

  return (
    <>
      <PlaceJsonLd
        locale={{
          cityName: locale.cityName,
          regionName: locale.regionName,
          countryCode: locale.countryCode,
        }}
        place={{
          name: place.name,
          slug: place.slug,
          kind: place.kind,
          address: place.address,
          coords: place.coords,
          phone: place.phones[0]?.phone ?? null,
          priceTier: place.priceTier,
          rating: place.rawRating ?? undefined,
          ratingCount: place.ratingCount,
          imageUrl: place.cover?.fullUrl ?? place.logo?.fullUrl ?? null,
          sameAs: place.socials.map((social) => social.url),
          description: place.about,
          hours: week.map((day) => ({ dow: day.dow, ranges: day.ranges })),
          menu: place.menu.map((section) => ({
            name: section.name,
            items: section.items.map((item) => ({
              name: item.name,
              description: item.description,
              price: item.priceUnknown?null:discountedPrice(item.price, venueDiscount?.percent??0),
            })),
          })),
        }}
      />
      <BreadcrumbJsonLd
        items={[
          { name: siteName, path: paths.home },
          ...(place.districtName && place.districtId
            ? [{ name: place.districtName, path: paths.district(place.districtSlug ?? place.districtId) }]
            : []),
          { name: place.name, path: paths.cafe(place.slug) },
        ]}
      />

      <main id="page-top" className={styles.page}>
        <nav className={styles.breadcrumbs} aria-label="مسیر صفحه">
          <Link href={paths.home}>خانه</Link>
          <span aria-hidden="true">/</span>
          {place.districtName && place.districtId ? (
            <Link href={paths.district(place.districtSlug ?? place.districtId)}>
              {place.districtName}
            </Link>
          ) : (
            <Link href={paths.search}>کشف کافه‌ها</Link>
          )}
          <span aria-hidden="true">/</span>
          <span aria-current="page">{place.name}</span>
        </nav>

        <section className={styles.introGrid} data-has-media={galleryImages.length > 0} aria-labelledby="place-title">
          <div className={styles.heroVisual}>
            {galleryImages.length > 0 ? (
              <PlaceGallery images={galleryImages} placeName={place.name} />
            ) : (
              <div className={styles.heroFallback}>
                <span className={styles.fallbackLetter}>{identity.title.trim().charAt(0)}</span>
                <div className={styles.fallbackCaption}>
                  <CameraOff size={18} aria-hidden="true" />
                  <span>تصویر محیط این شعبه هنوز ثبت نشده</span>
                </div>
              </div>
            )}
          </div>

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
                  <Coffee size={30} strokeWidth={1.6} />
                </span>
              )}

              <div className={styles.heroText}>
                <div className={styles.badges}>
                  <span className={styles.kind}>{kindLabel}</span>
                  {identity.branchLabel && <span className={styles.branch}>{identity.branchLabel}</span>}
                  {place.districtName && place.districtId && (
                    <Link href={paths.district(place.districtSlug ?? place.districtId)} className={styles.district}>
                      {place.districtName}
                    </Link>
                  )}
                  {place.ribbon && <span className={styles.ribbon}>{place.ribbon}</span>}
                </div>

                <h1 id="place-title" className={styles.name}>{identity.title}</h1>
                {(place.brandNameEn ?? place.nameEn) && <p className={styles.nameEn}>{place.brandNameEn ?? place.nameEn}</p>}
              </div>
            </div>

            <div className={styles.visitSnapshot}>
              <div className={styles.statusLine}>
                <span
                  className={`${styles.openBadge} ${
                    open.status === 'open'
                      ? styles.openNow
                      : open.status === 'closed'
                        ? styles.closedNow
                        : styles.unknownNow
                  }`}
                >
                  {open.status === 'open' ? 'الان باز است' : open.label}
                </span>
                {open.subLabel && <span className={styles.openSub}>{open.subLabel}</span>}
              </div>
              {place.address && <p className={styles.address}><MapPin size={17} aria-hidden="true" /> <span>{place.address}</span></p>}
              <HoursCard groups={hourGroups} />
            </div>

            <div className={styles.actionRow} id="directions">
              <MenuOpenButton />
              <DirectionsBar
                lat={place.coords?.lat ?? null}
                lng={place.coords?.lng ?? null}
                name={place.name}
                address={place.address}
                phones={place.phones}
                instagram={place.instagram}
                geoStatus={place.geoStatus}
                services={map.routingServices}
              />
              <SavePlaceButton
                placeId={place.id}
                slug={place.slug}
                initialSaved={isSaved}
                signedIn={!!user}
                authHref={authUrl(paths.cafe(place.slug))}
              />
              <SharePlaceButton name={place.name} />
              <ClubJoinButton placeId={place.id} slug={place.slug} joined={clubMembership?.status === 'active'} signedIn={!!user} authHref={authUrl(paths.cafe(place.slug))} />
            </div>
            {clubOffers.length > 0 && <div className={styles.clubOffers}><strong><BadgePercent size={16}/> پیشنهاد اعضای باشگاه</strong>{clubOffers.map(offer=><span key={offer.id}>{offer.title} · {offer.discountLabel}</span>)}</div>}
          </header>
        </section>

        <section className={styles.compactFacts} aria-label="خلاصهٔ تصمیم‌گیری">
          {place.priceMedian !== null && (
            <div className={styles.factItem}>
              <WalletCards size={21} aria-hidden="true" />
              <span><small>میانهٔ قیمت پایه</small><strong>{toman(place.priceMedian)}</strong></span>
              <em>{TIER_LABELS[place.priceTier] ?? '—'}</em>
              {place.priceMin!==null && place.priceMax!==null && <small>بازهٔ پایه: از {toman(place.priceMin)} تا {toman(place.priceMax)}</small>}
            </div>
          )}
          {place.ratingCount > 0 && (
            <Link className={styles.ratingFact} href="#reviews"><MessageSquareText size={21} aria-hidden="true" /><span><small>تجربهٔ ثبت‌شده</small><strong>★ {fa((place.rawRating ?? place.rating).toFixed(1))} از ۵</strong></span><em>{faCount(place.ratingCount)} نظر{place.ratingCount<5?' · اولیه':''}</em></Link>
          )}
          <div className={styles.compareFact} id="price-compare"><CafePopover label="مقایسه با قیمت شهر" title="قیمت اینجا در مقایسه با شهر" scan>
            <div className={styles.compareIntro}><span>از منوهای واقعی مشهد</span><h3>با دید باز انتخاب کن</h3><p>قیمت شروع هر خوراکی در این کافه، کنار میانهٔ قیمت ثبت‌شدهٔ همان خوراکی در شهر.</p></div>
            {comparableDishes.length===0?<div className={styles.compareEmpty}><strong>برای یک مقایسهٔ مطمئن، هنوز داده کافی نیست</strong><p>وقتی تعداد منوهای قابل مقایسه بیشتر شود، نتیجه اینجا نمایش داده می‌شود.</p></div>:<ul className={styles.compareList}>{comparableDishes.map(dish=><li key={dish.dishId}><div className={styles.compareHeading}><Link href={paths.dish(dish.slug)}>{dish.nameFa}</Link><small>{faCount(dish.cityPlaceCount)} مجموعه در نمونهٔ شهر</small></div><div className={styles.compareNumbers}><div><span>شروع قیمت اینجا</span><strong>{toman(dish.minPrice!)}</strong></div><div><span>میانهٔ شهر</span><strong>{toman(dish.cityMedian!)}</strong></div></div><Link className={styles.compareExplore} href={paths.dish(dish.slug)}>دیدن قیمت‌ها و گزینه‌های دیگر</Link></li>)}</ul>}
            <p className={styles.compareCaveat}>مقایسهٔ قیمت پایه است، نه قیمت با تخفیف. اندازه، مواد و افزودنی‌ها ممکن است متفاوت باشند؛ ارزان‌تر بودن به‌تنهایی نشانهٔ انتخاب بهتر نیست.</p>
          </CafePopover></div>
        </section>

        <nav className={styles.pageNav} aria-label="بخش‌های صفحه">
          <a href="#menu">منو و قیمت‌ها</a>
          {place.about && <a href="#about">دربارهٔ اینجا</a>}
          <a href="#reviews">نظرها</a>
          <a href="#map">نقشه و تماس</a>
        </nav>

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
            {/* منو هدف اصلی بیشتر بازدیدهاست؛ مخصوصاً روی موبایل نباید بعد از
                متن معرفی و پیشنهادهای قیمتی دفن شود. خود مرورگر منو در موبایل
                یک CTA جمع‌وجور است و با یک لمس تمام‌صفحه باز می‌شود. */}
            <MenuBrowser
              discountPercent={venueDiscount?.percent??0}
              discountExpiresAt={venueDiscount?.expiresAt.toISOString()??null}
              sections={place.menu}
              placeName={place.name}
              logoUrl={place.logo?.url ?? null}
              sourceUrl={place.menuUrl}
              branchName={place.branchName}
              priceUpdatedLabel={formattedPriceDate}
              priceIsStale={priceIsStale}
              sourceLabel={sourceLabel}
            />

            {place.about && (
              <section className={styles.about} id="about">
                <span className={styles.sectionKicker}>داستان این مکان</span>
                <h2 className={styles.sectionHeading}>دربارهٔ {place.name}</h2>
                {place.about
                  .split('\n')
                  .filter(Boolean)
                  .map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
              </section>
            )}

            <section className={styles.reviews} id="reviews">
              <span className={styles.sectionKicker}>تجربهٔ آدم‌ها</span>
              <h2 className={styles.sectionHeading}>نظرها دربارهٔ {place.name}</h2>
              {visibleReviews.length === 0 ? (
                <p className={styles.noReviews}>
                  هنوز نظری ثبت نشده. اگر اینجا رفته‌اید، اولین نفر باشید.
                </p>
              ) : (
                <ul className={styles.reviewList}>
                  {visibleReviews.map((review) => (
                    <li key={review.id} data-own-review={review.userId === user?.id || undefined} data-review-status={review.status} className={`${styles.review} ${review.isBloggerReview ? styles.bloggerReview : ''} ${review.userId === user?.id ? styles.ownReview : ''}`}>
                      {review.userId === user?.id && <p className={styles.ownReviewStatus}>نظر شما · {review.status === 'approved' ? 'منتشر شده' : review.status === 'rejected' ? 'تأیید نشده؛ فقط برای شما قابل مشاهده است' : 'در انتظار بررسی؛ فقط برای شما قابل مشاهده است'}</p>}
                      <div className={styles.reviewHead}>
                        <div className={styles.reviewAuthor}>
                          <strong>{publicReviewerName(review.authorName)} {review.isBloggerReview && <span className={styles.bloggerMark}><BadgeCheck size={14} aria-hidden="true" /> بلاگر تأییدشده</span>}</strong>
                          <time dateTime={(review.visitDate ?? review.createdAt).toISOString()}>
                            {review.visitDate ? 'مراجعه در ' : 'ثبت در '}
                            {new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeZone: locale.timeZone }).format(review.visitDate ?? review.createdAt)}
                          </time>
                        </div>
                        <Stars count={review.stars} size={15} showEmpty />
                      </div>
                      {review.text && <p className={styles.reviewText}>{review.text}</p>}
                      {review.itemNames.length > 0 && <p className={styles.reviewItems}>سفارش: {review.itemNames.join('، ')}</p>}
                      {review.isBloggerReview && review.videoUrl && <a className={styles.reviewVideo} href={review.videoUrl} target="_blank" rel="noopener noreferrer nofollow"><ExternalLink size={16} aria-hidden="true" /> دیدن ویدئوی بررسی {publicReviewerName(review.authorName)} در اینستاگرام</a>}
                      {review.replies.map((reply) => (
                        <div className={styles.ownerReply} key={reply.id}>
                          <strong>پاسخ مجموعه</strong>
                          <p>{reply.text}</p>
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
              {ownReviews.length > 0 && <Link className={styles.myReviewsLink} href={paths.myReviews}>همهٔ تجربه‌های من و وضعیت انتشارشان</Link>}

              {/* فرمی که مطمئنیم خطا می‌دهد نباید نمایش داده شود. */}
              {moderation.reviewsEnabled && (
                <>
                  {myReview && (
                    <details className={styles.reviewEditor}>
                      <summary>
                        <span><strong>ویرایش آخرین نظر شما</strong><small>{myReview.status === 'approved' ? 'منتشر شده' : myReview.status === 'rejected' ? 'تأیید نشده' : 'در انتظار بررسی'}</small></span>
                        <span className={styles.reviewEditLabel}>ویرایش نظر <ChevronDown size={17} aria-hidden="true" /></span>
                      </summary>
                      <div className={styles.reviewEditorBody}>
                        <ReviewForm placeId={place.id} slug={place.slug} placeName={place.name} signedIn existing={myReview} menuItems={reviewableMenuItems} authHref={authUrl(`${paths.cafe(place.slug)}#reviews`)} minTextLength={moderation.reviewMinTextLength} maxTextLength={moderation.reviewMaxTextLength} isBlogger={account?.isBlogger === true} />
                      </div>
                    </details>
                  )}
                  <div className={styles.reviewFormWrap}>
                    <h3 className={styles.reviewFormTitle}>{myReview ? 'مراجعهٔ جدیدت را ثبت کن' : 'نظرت را بنویس'}</h3>
                    <ReviewForm placeId={place.id} slug={place.slug} placeName={place.name} signedIn={!!user} existing={null} menuItems={reviewableMenuItems} authHref={authUrl(`${paths.cafe(place.slug)}#reviews`)} minTextLength={moderation.reviewMinTextLength} maxTextLength={moderation.reviewMaxTextLength} isBlogger={account?.isBlogger === true} />
                  </div>
                </>
              )}
            </section>
          </div>

          <aside className={styles.side}>
            <section className={`${styles.card} ${styles.mapCard}`} id="map">
              <h2 className={styles.sideHeading}>پیداکردن اینجا</h2>
              {place.coords && place.geoStatus === 'ok' ? (
                <LazyCafeMap
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
                  zoom={Math.min(16, map.maxZoom)}
                  height="300px"
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

            {(place.phones.length > 0 || place.socials.length > 0) && (
              <section className={`${styles.card} ${styles.contactCard}`}>
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
              <section className={`${styles.card} ${styles.nearbyCard}`}>
                <h2 className={styles.sideHeading}>نزدیک همین‌جا</h2>
                <ul className={styles.nearbyList}>
                  {nearby.map((card) => {
                    const NearbyIcon = NEARBY_KIND_ICON[card.kind as keyof typeof NEARBY_KIND_ICON] ?? Coffee
                    return <li key={card.id}>
                      <Link href={paths.cafe(card.slug)} className={styles.nearbyItem}>
                        {card.logo ? (
                          <img src={card.logo.url} alt="" width={38} height={38} loading="lazy" />
                        ) : (
                          <span className={styles.nearbyEmpty} aria-hidden="true">
                            <NearbyIcon size={17} strokeWidth={1.7} />
                          </span>
                        )}
                        <span className={styles.nearbyBody}>
                          <strong>{card.name}</strong>
                          <span>
                            {card.distanceKm < 1
                              ? `${fa(Math.round(card.distanceKm * 1000))} متر فاصلهٔ مستقیم`
                              : `${fa(card.distanceKm.toFixed(1))} کیلومتر فاصلهٔ مستقیم`}
                          </span>
                        </span>
                      </Link>
                    </li>
                  })}
                </ul>
              </section>
            )}

            {/*
              «مشارکت» — تا امروز آیتمی در منوی بالا بود که به صفحه‌ی اصلی
              می‌رفت. جای واقعی‌اش همین‌جاست: کاربر دقیقاً وقتی می‌فهمد ساعت
              کاری غلط است که آن را روی همین صفحه دیده.
            */}
            <SuggestEdit
              placeId={place.id}
              placeName={place.name}
              signedIn={!!user}
              authHref={authUrl(paths.cafe(place.slug))}
              currentValues={{
                hours: hourGroups
                  .filter((group) => !group.unknown)
                  .map(
                    (group) =>
                      `${group.label}: ${group.closed ? 'تعطیل' : group.ranges.join('، ')}`,
                  )
                  .join(' · '),
                address: place.address,
                phone: place.phones.map((phone) => phone.phone).join('، '),
                coords: place.coords ? `${place.coords.lat},${place.coords.lng}` : null,
                instagram: place.instagram,
                name: place.name,
              }}
            />
          </aside>
        </div>
        <section className={`${styles.dataTrust} ${priceIsStale ? styles.dataTrustStale : ''}`} aria-label="منبع و تازگی اطلاعات">
          <div className={styles.trustLead}><span className={styles.trustIcon} aria-hidden="true"><Database size={20}/></span><div><strong>{sourceLabel}</strong><span>{formattedPriceDate?`آخرین به‌روزرسانی قیمت: ${formattedPriceDate}`:'زمان به‌روزرسانی ثبت نشده است'}{priceIsStale?' · برخی قیمت‌ها نیاز به بازبینی دارند':''}</span></div></div>
          {place.priceStatsItemCount>0 && <details><summary>مبنای آمار قیمت</summary><p>بر پایهٔ {faCount(place.priceStatsItemCount)} آیتم مشمول؛ خدمات و قیمت‌های خارج از قواعد محاسبه کنار گذاشته می‌شوند. بازهٔ قیمت از میانه و ردهٔ قیمت جداست.{place.priceMinItemName&&place.priceMaxItemName?` کمینه: ${place.priceMinItemName}؛ بیشینه: ${place.priceMaxItemName}.`:''}</p></details>}
        </section>
      </main>
    </>
  )
}
