import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Book,
  CakeSlice,
  Building2,
  Camera,
  ChevronLeft,
  Clock3,
  Coffee,
  Heart,
  Laptop,
  Leaf,
  LocateFixed,
  MapPinned,
  Moon,
  MessageCircle,
  Salad,
  Star,
  Store,
  Sunrise,
  Trees,
  UtensilsCrossed,
  Users,
  WalletCards,
} from 'lucide-react'
import { CafeCard } from '@/components/cafe/CafeCard'
import { DiscountDiscovery } from '@/components/cafe/DiscountDiscovery'
import { ExperienceClickTracker } from '@/components/experience/ExperienceClickTracker'
import { DiscoveryClickTracker } from '@/components/home/DiscoveryClickTracker'
import { HeroSearch } from '@/components/home/HeroSearch'
import { InstallLink } from '@/components/pwa/InstallApp'
import { MaintenanceScreen } from '@/components/site/MaintenanceScreen'
import { FacetIcon } from '@/components/ui/FacetIcon'
import {
  getSiteStats,
  listDistricts,
  listFilterFacets,
  listPlaceCards,
  listPopularDishes,
} from '@/core/places/queries'
import { searchPath } from '@/core/search/filters'
import { listExperienceSummaries } from '@/core/experience/queries'
import { listUpcomingPublicEvents } from '@/core/events/service'
import { pickHomeRecommendations } from '@/core/discovery/homeRecommendations'
import { listTrustedReviewCards } from '@/core/discovery/trustedReviews'
import { maintenanceState } from '@/core/settings/maintenance'
import { getDiscoveryPolicy, getLocalePolicy } from '@/core/settings/policies'
import { getSettings } from '@/core/settings/store'
import { faCount, toman } from '@/lib/format'
import { absoluteUrl, authUrl, paths } from '@/routes'
import { BRAND_ALIASES } from '@/core/seo/brand'
import styles from '@/components/home/Home.module.css'

const FAQS = [
  {
    question: 'کو کافه دقیقاً چه کاری انجام می‌دهد؟',
    answer:
      'کو کافه راهنمای انتخاب کافه و رستوران در مشهد است. نام مجموعه، محله یا یک آیتم منو را جست‌وجو کن و منو، آخرین قیمت ثبت‌شده، ساعت کاری، آدرس و مسیر را یک‌جا ببین.',
  },
  {
    question: 'اگر اسم کافه‌ای را ندانم، از کجا شروع کنم؟',
    answer:
      'چیزی را که میل داری، مثل پاستا، ماچا یا صبحانه جست‌وجو کن؛ یا از نزدیک من، الان باز است و انتخاب محله استفاده کن.',
  },
  {
    question: 'قیمت‌های منو چقدر قابل اعتمادند؟',
    answer:
      'قیمت هر آیتم آخرین مقدار ثبت‌شده در منوی همان شعبه است. زمان تغییر ثبت‌شده و هشدار تازگی قیمت در صفحهٔ مجموعه نمایش داده می‌شود؛ همگام‌سازی منبع به‌معنای تأیید قیمت نیست.',
  },
  {
    question: 'صاحب کافه چطور منو و اطلاعاتش را مدیریت کند؟',
    answer:
      'از بخش «برای کافه‌ها» وارد پنل شو. بعد از تأیید دسترسی می‌توانی اطلاعات شعبه، تصاویر، ساعت کاری، دسته‌بندی و آیتم‌های منو را مدیریت و QR منو دریافت کنی.',
  },
] as const

export async function generateMetadata(): Promise<Metadata> {
  const [settings, locale] = await Promise.all([getSettings(), getLocalePolicy()])
  const title = `${settings.siteName} | منو، قیمت و کافه‌های ${locale.cityName}`
  const description = `کافه یا غذای مناسب را در ${locale.cityName} پیدا کن؛ منوی کامل و قیمت، ساعت کاری، محله، نقشه، نزدیک‌ترین‌ها و مسیریابی در ${settings.siteName}.`

  return {
    title,
    description,
    alternates: { canonical: '/' },
    category: 'راهنمای کافه و رستوران',
    openGraph: {
      type: 'website',
      locale: 'fa_IR',
      siteName: settings.siteName,
      title,
      description,
      url: '/',
      images: [{
        url: '/brand/og-home.png',
        width: 1200,
        height: 630,
        alt: `${settings.siteName}؛ جای خوب پیدا می‌شود`,
      }],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['/brand/og-home.png'] },
  }
}

function HomeJsonLd({
  siteName,
  description,
  cityName,
  featured,
}: {
  siteName: string
  description: string
  cityName: string
  featured: { name: string; slug: string }[]
}) {
  const homeUrl = absoluteUrl('/')
  const organizationId = `${homeUrl}#organization`
  const websiteId = `${homeUrl}#website`
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: siteName,
        alternateName: BRAND_ALIASES,
        url: homeUrl,
        logo: absoluteUrl('/brand/app-icon-512.png'),
        description,
        areaServed: { '@type': 'City', name: cityName },
      },
      {
        '@type': 'WebSite',
        '@id': websiteId,
        url: homeUrl,
        name: siteName,
        alternateName: BRAND_ALIASES,
        description,
        inLanguage: 'fa-IR',
        publisher: { '@id': organizationId },
        potentialAction: {
          '@type': 'SearchAction',
          target: `${absoluteUrl(paths.search)}?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'CollectionPage',
        '@id': `${homeUrl}#home`,
        url: homeUrl,
        name: `راهنمای کافه‌ها و رستوران‌های ${cityName}`,
        description,
        inLanguage: 'fa-IR',
        isPartOf: { '@id': websiteId },
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: featured.map((place, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: place.name,
            url: absoluteUrl(paths.cafe(place.slug)),
          })),
        },
      },
      {
        '@type': 'FAQPage',
        '@id': `${homeUrl}#faq`,
        mainEntity: FAQS.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}

export default async function HomePage() {
  const gate = await maintenanceState()
  if (gate.closed) return <MaintenanceScreen siteName={gate.siteName} message={gate.message} />

  const [discovery, locale, settings] = await Promise.all([
    getDiscoveryPolicy(),
    getLocalePolicy(),
    getSettings(),
  ])
  const [stats, rankedPlaces, facets, districts, popularDishes, events, trustedReviews] = await Promise.all([
    getSiteStats(),
    listPlaceCards({ limit: Math.max(24, discovery.homeCardCount * 5), sort: 'quality' }),
    listFilterFacets(),
    listDistricts(),
    listPopularDishes(8),
    listUpcomingPublicEvents({ limit: 2 }),
    listTrustedReviewCards(3),
  ])
  const experienceSummaries = await listExperienceSummaries()

  const facetLabels = Object.fromEntries(facets.map((facet) => [facet.id, facet.labelFa]))
  const popularFacets = facets.filter((facet) => facet.kind !== 'service' && facet.placeCount > 0).slice(0, 6)
  const activeDistricts = districts.filter((district) => district.placeCount > 0).slice(0, 10)
  const siteDescription = `راهنمای منو، قیمت و انتخاب کافه‌ها و رستوران‌های ${locale.cityName}`
  const availableExperiences = experienceSummaries.filter((item) => item.candidateCount > 0)
  const experienceIcons = { work: Laptop, date: Heart, gathering: Users, birthday: CakeSlice, desserts: CakeSlice, healthy: Salad, breakfast: Sunrise, study: Book, outdoor: Trees, 'late-night': Moon, photogenic: Camera, calm: Leaf, 'specialty-coffee': Coffee }
  const featured = pickHomeRecommendations(rankedPlaces, Math.min(4, discovery.homeCardCount))
  const firstExperience = availableExperiences[0]
  const firstFood = popularFacets[0]

  return (
    <div className={styles.home}>
      <ExperienceClickTracker />
      <DiscoveryClickTracker />
      <HomeJsonLd
        siteName={settings.siteName}
        description={siteDescription}
        cityName={locale.cityName}
        featured={featured.map(({ card }) => card)}
      />

      <main>
        <section className={styles.hero} aria-labelledby="home-title">
          <div className={`container ${styles.heroGrid}`}>
            <div className={styles.heroCopy}>
              <div className={styles.eyebrow}>
                <span className={styles.liveDot} aria-hidden="true" />
                راهنمای انتخاب کافه در {locale.cityName}
              </div>
              <h1 id="home-title" className={styles.title}>
                امروز <span>کجا بریم؟</span>
              </h1>
              <p className={styles.lede}>
                کافه‌های {locale.cityName}، منو، قیمت و تجربهٔ آدم‌ها.
              </p>

              <HeroSearch />

              <div className={styles.heroShortcuts} aria-label="شروع سریع">
                <Link href={searchPath({ nearMe: true, sort: 'distance' })} data-discovery-event="nearby_search_started" data-discovery-context="near_me" data-discovery-source="hero">
                  <LocateFixed size={18} aria-hidden="true" /> نزدیک من
                </Link>
                <Link href={searchPath({ openNow: true })}>
                  <Clock3 size={18} aria-hidden="true" /> الان باز است
                </Link>
                <Link href={paths.districtHub} data-discovery-event="discovery_category_clicked" data-discovery-context="district" data-discovery-source="hero">
                  <Building2 size={18} aria-hidden="true" /> انتخاب محله
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className={`container ${styles.quickDiscovery}`} aria-labelledby="quick-discovery-title">
          <div className={styles.sectionHeading}>
            <div><span className={styles.sectionKicker}>از نیازت شروع کن</span><h2 id="quick-discovery-title">چی برات مهم‌تره؟</h2></div>
          </div>
          <div className={styles.quickDiscoveryGrid}>
            {firstExperience && <Link href={paths.experience(firstExperience.experience.slug)} className={styles.quickDiscoveryCard} data-experience-track="card_click" data-experience-slug={firstExperience.experience.slug} data-experience-count={firstExperience.candidateCount}>
              <span className={styles.quickDiscoveryIcon}><Heart size={21} aria-hidden="true" /></span>
              <span><strong>حال‌وهوا و مناسبت</strong><small>{firstExperience.experience.shortTitle}، کار، قرار و بیشتر</small></span><ArrowLeft size={17} aria-hidden="true" />
            </Link>}
            {firstFood && <Link href={paths.menuCategory(firstFood.id)} className={styles.quickDiscoveryCard} data-discovery-event="food_category_selected" data-discovery-context={firstFood.id} data-discovery-source="quick_discovery">
              <span className={styles.quickDiscoveryIcon}><UtensilsCrossed size={21} aria-hidden="true" /></span>
              <span><strong>غذا و نوشیدنی</strong><small>{firstFood.labelFa} و منوهای واقعی</small></span><ArrowLeft size={17} aria-hidden="true" />
            </Link>}
            <Link href={paths.districtHub} className={styles.quickDiscoveryCard} data-discovery-event="discovery_category_clicked" data-discovery-context="district" data-discovery-source="quick_discovery">
              <span className={styles.quickDiscoveryIcon}><MapPinned size={21} aria-hidden="true" /></span>
              <span><strong>محله و موقعیت</strong><small>نزدیک من، الان باز و نقشه</small></span><ArrowLeft size={17} aria-hidden="true" />
            </Link>
          </div>
          <nav className={styles.quickHubLinks} aria-label="همهٔ مسیرهای کشف">
            <Link href={paths.experienceHub}>همهٔ تجربه‌ها</Link>
            <Link href={paths.menuHub}>همهٔ دسته‌های منو</Link>
            <Link href={paths.districtHub}>همهٔ محله‌ها</Link>
          </nav>
        </section>
        {trustedReviews.length >= 3 && (
          <section className={`container ${styles.section} ${styles.trustedReviewSection}`} aria-labelledby="home-reviews-title">
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionKicker}>تجربهٔ واقعی، نه تبلیغ</span>
                <h2 id="home-reviews-title">کافه‌هایی که مردم درباره‌شون نوشتن</h2>
                <p>گزیده‌ای از نظرهای تأییدشده؛ برای تصمیم خودت متن کامل را در صفحهٔ کافه ببین.</p>
              </div>
              <Link href={paths.reviewedCafes} className={styles.textLink}>همهٔ تجربه‌ها <ArrowLeft size={16} aria-hidden="true" /></Link>
            </div>
            <div className={styles.trustedReviewGrid}>
              {trustedReviews.map(card => (
                <Link key={card.reviewId} href={`${paths.cafe(card.placeSlug)}#reviews`} className={styles.trustedReviewCard}
                  data-discovery-event="review_card_opened" data-discovery-context={String(card.placeId)} data-discovery-source="trusted_reviews">
                  <span className={styles.trustedReviewVenue}>
                    {card.placeImage ? <img src={card.placeImage} alt="" width={64} height={64} loading="lazy" /> : <span className={styles.trustedReviewFallback}><Coffee size={22} aria-hidden="true" /></span>}
                    <span><strong>{card.placeName}</strong><small>{card.districtName ?? 'مشهد'} · {faCount(card.approvedReviewCount)} تجربهٔ تأییدشده</small></span>
                  </span>
                  <span className={styles.trustedReviewMeta}>
                    {card.rating !== null && <span><Star size={14} fill="currentColor" aria-hidden="true" /> {card.rating.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}</span>}
                    {card.isBloggerReview && <span>تجربهٔ بلاگر</span>}
                    {card.placeStatus === 'temporarily_closed' && <span>موقتاً بسته</span>}
                    <span>{card.reviewedAt.toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' })}</span>
                  </span>
                  <span className={styles.trustedReviewQuote}>«{card.excerpt}»</span>
                  <span className={styles.trustedReviewFoot}><span><MessageCircle size={15} aria-hidden="true" /> خواندن تجربه</span><ArrowLeft size={16} aria-hidden="true" /></span>
                </Link>
              ))}
            </div>
          </section>
        )}
        {availableExperiences.length > 0 && (
          <section className={`container ${styles.section} ${styles.experienceSection}`} aria-labelledby="experience-title">
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionKicker}>انتخاب از روی نیاز</span>
                <h2 id="experience-title">برای چه لحظه‌ای کافه می‌خواهی؟</h2>
                <p>گزینه‌هایی بر اساس امکانات و اطلاعات ثبت‌شده؛ شفاف و بدون ادعای «بهترین» بودن.</p>
              </div>
              <Link href={paths.experienceHub} className={styles.textLink}>
                همهٔ تجربه‌ها <ArrowLeft size={16} />
              </Link>
            </div>
            <div className={styles.experienceRail}>
              {availableExperiences.map(({ experience, candidateCount }) => {
                const Icon = experienceIcons[experience.slug]
                return (
                  <Link
                    href={paths.experience(experience.slug)}
                    className={styles.experienceCard}
                    key={experience.slug}
                    data-experience-track="card_click"
                    data-experience-slug={experience.slug}
                    data-experience-count={candidateCount}
                    style={{ '--experience-accent': experience.accent } as CSSProperties}
                  >
                    <img src={experience.image} alt={experience.imageAlt} width={1536} height={1024} loading="lazy" />
                    <span className={styles.experienceCopy}>
                      <i><Icon size={17} /></i>
                      <b>{experience.shortTitle}</b>
                      <small>{faCount(candidateCount)}</small>
                    </span>
                  </Link>
                )
              })}
            </div>
          </section>
        )}
        <section className={`container ${styles.section} ${styles.discoverySection}`} aria-labelledby="discovery-title">
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.sectionKicker}>منوی واقعی مجموعه‌ها</span>
              <h2 id="discovery-title">چی بخوریم؟</h2>
              <p>از خوراکی دلخواهت به کافه‌هایی برس که آن را در منوی ثبت‌شده دارند.</p>
            </div>
            <Link href={paths.menuHub} className={styles.textLink}>
              همهٔ دسته‌ها <ArrowLeft size={16} />
            </Link>
          </div>

          <div className={styles.discoveryGrid}>
            <div className={styles.categoryGrid} aria-label="دسته‌های محبوب منو">
              {popularFacets.map((facet) => (
                <Link href={paths.menuCategory(facet.id)} className={styles.categoryCard} key={facet.id} data-discovery-event="food_category_selected" data-discovery-context={facet.id} data-discovery-source="food_discovery">
                  <span className={styles.categoryIcon}><FacetIcon id={facet.id} size={22} /></span>
                  <span><b>{facet.labelFa}</b><small>{faCount(facet.placeCount)} مجموعه</small></span>
                  <ChevronLeft size={17} aria-hidden="true" />
                </Link>
              ))}
            </div>

            {popularDishes.length > 0 && (
              <aside className={styles.comparePanel} aria-label="مقایسهٔ قیمت‌های محبوب">
                <div className={styles.compareHeading}>
                  <WalletCards size={21} aria-hidden="true" />
                  <span><b>قیمت‌های ثبت‌شده را ببین</b><small>قیمت امروزِ کافه تضمین نمی‌شود</small></span>
                </div>
                <div className={styles.dishList}>
                  {popularDishes.slice(0, 2).map((dish) => (
                    <Link href={paths.dish(dish.slug)} key={dish.id}>
                      <span><b>{dish.nameFa}</b><small>{faCount(dish.placeCount)} منو</small></span>
                      <em>{dish.minPrice !== null ? `از ${toman(dish.minPrice)}` : 'مشاهده'}</em>
                      <ChevronLeft size={16} aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              </aside>
            )}
          </div>
        </section>

        {activeDistricts.length > 0 && (
          <section className={`container ${styles.section} ${styles.districtSection}`} aria-labelledby="district-title">
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionKicker}>نزدیک‌تر انتخاب کن</span>
                <h2 id="district-title">{locale.cityName}، محله‌به‌محله</h2>
              </div>
              <Link href={paths.districtHub} className={styles.textLink}>همهٔ محله‌ها <ArrowLeft size={16} /></Link>
            </div>
            <div className={styles.districtRail}>
              {activeDistricts.map((district) => (
                <Link href={paths.district(district.slug)} key={district.id} data-discovery-event="discovery_category_clicked" data-discovery-context={district.slug} data-discovery-source="district">
                  <MapPinned size={19} aria-hidden="true" />
                  <span><b>{district.name}</b><small>{faCount(district.placeCount)} مجموعه</small></span>
                  <ChevronLeft size={16} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {featured.length > 0 && (
          <section className={styles.featuredBand} aria-labelledby="featured-title">
            <div className={`container ${styles.section}`}>
              <div className={styles.sectionHeading}>
                <div>
                  <span className={styles.sectionKicker}>دلیل روشن برای شروع</span>
                  <h2 id="featured-title">کافه‌های قابل بررسی</h2>
                  <p>هر پیشنهاد بر پایهٔ دادهٔ ثبت‌شده است؛ نه عنوان «بهترین» یا بازدید بالا.</p>
                </div>
                <Link href={searchPath({ sort: 'quality' })} className={styles.textLink}>
                  همهٔ کافه‌ها <ArrowLeft size={16} />
                </Link>
              </div>
              <div className={styles.featuredGrid}>
                {featured.map(({ card, reason }) => (
                  <div className={styles.featuredEntry} key={card.id} data-discovery-event="cafe_detail_opened" data-discovery-context={String(card.id)} data-discovery-source="featured">
                    <span className={styles.featuredReason}>{reason}</span>
                    <CafeCard card={card} facetLabels={facetLabels} />
                    <Link className={styles.featuredMenuLink} href={`${paths.cafe(card.slug)}?menu=1#menu`} data-discovery-event="menu_opened_from_discovery" data-discovery-context={String(card.id)} data-discovery-source="featured">دیدن منو <ArrowLeft size={15} aria-hidden="true" /></Link>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {events.length > 0 && <section className={`container ${styles.section} ${styles.eventSection}`} aria-labelledby="home-events-title">
          <div className={styles.sectionHeading}><div><span className={styles.sectionKicker}>برنامه‌های واقعی کافه‌ها</span><h2 id="home-events-title">رویدادهای پیشِ رو</h2></div><Link href={paths.events} className={styles.textLink}>همهٔ رویدادها <ArrowLeft size={16} /></Link></div>
          <div className={styles.eventGrid}>{events.map(({ event, placeName }) => <Link href={paths.event(event.id)} key={event.id} className={styles.eventCard}><strong>{event.title}</strong><span>{placeName} · {new Date(`${event.startDate}T12:00:00Z`).toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' })}</span><ArrowLeft size={17} aria-hidden="true" /></Link>)}</div>
        </section>}

        <DiscountDiscovery />

        <section id="for-venues" className={styles.ownerSection} aria-labelledby="owner-title">
          <div className={`container ${styles.ownerGrid} ${styles.ownerGridCompact}`}>
            <div className={styles.ownerCopy}>
              <span className={styles.ownerBadge}><Store size={16} /> برای کافه‌دارها</span>
              <h2 id="owner-title">کافه‌دار هستی؟</h2>
              <p>اطلاعات و منوی شعبه‌ات را در پنل KuCafe مدیریت کن.</p>
              <div className={styles.ownerActions}>
                <Link href={`${paths.ownerLanding}?from=home`} className={styles.ownerPrimary}>دریافت پنل کافه <ArrowLeft size={16} /></Link>
                <Link href={authUrl(paths.ownerPanel)} className={styles.ownerSecondary}>ورود اعضا</Link>
              </div>
            </div>
          </div>
        </section>

        <div className={`container ${styles.homeAfterword}`}>
          <span>{faCount(stats.publishedPlaces)} مجموعه · {faCount(stats.menuItems)} آیتم منوی قابل جست‌وجو</span>
          <Link href={paths.methodology}>روش جمع‌آوری اطلاعات</Link>
          <InstallLink />
        </div>

        <section id="faq" className={`container ${styles.faqSection}`} aria-labelledby="faq-title">
          <div className={styles.faqIntro}>
            <span className={styles.sectionKicker}>اگر هنوز سؤالی مانده</span>
            <h2 id="faq-title">پاسخ‌های کوتاه و روشن</h2>
          </div>
          <div className={styles.faqList}>
            {FAQS.map((item, index) => (
              <details key={item.question} open={index === 0}>
                <summary>{item.question}<span aria-hidden="true">+</span></summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
