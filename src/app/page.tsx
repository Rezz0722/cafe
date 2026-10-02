import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  BadgeCheck,
  Book,
  BookOpenText,
  CakeSlice,
  Building2,
  Camera,
  Check,
  ChevronLeft,
  Clock3,
  Coffee,
  Heart,
  Laptop,
  Leaf,
  LocateFixed,
  MapPinned,
  Moon,
  Navigation,
  Salad,
  ShieldCheck,
  Store,
  Sunrise,
  Trees,
  Tags,
  UtensilsCrossed,
  Users,
  WalletCards,
} from 'lucide-react'
import { CafeCard } from '@/components/cafe/CafeCard'
import { DiscountDiscovery } from '@/components/cafe/DiscountDiscovery'
import { ExperienceClickTracker } from '@/components/experience/ExperienceClickTracker'
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
      'قیمت هر آیتم آخرین مقدار ثبت‌شده در منوی همان شعبه است. زمان به‌روزرسانی و وضعیت اعتبار داده در صفحهٔ مجموعه نمایش داده می‌شود و قیمت‌های قدیمی به‌عنوان قطعی معرفی نمی‌شوند.',
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
  const [stats, featured, facets, districts, popularDishes] = await Promise.all([
    getSiteStats(),
    listPlaceCards({ limit: discovery.homeCardCount, sort: 'rating' }),
    listFilterFacets(),
    listDistricts(),
    listPopularDishes(8),
  ])
  const experienceSummaries = await listExperienceSummaries()

  const facetLabels = Object.fromEntries(facets.map((facet) => [facet.id, facet.labelFa]))
  const popularFacets = facets.filter((facet) => facet.kind !== 'service').slice(0, 8)
  const activeDistricts = districts.filter((district) => district.placeCount > 0).slice(0, 10)
  const siteDescription = `راهنمای منو، قیمت و انتخاب کافه‌ها و رستوران‌های ${locale.cityName}`
  const availableExperiences = experienceSummaries.filter((item) => item.candidateCount > 0)
  const experienceIcons = { work: Laptop, date: Heart, gathering: Users, birthday: CakeSlice, desserts: CakeSlice, healthy: Salad, breakfast: Sunrise, study: Book, outdoor: Trees, 'late-night': Moon, photogenic: Camera, calm: Leaf, 'specialty-coffee': Coffee }
  const heroExperiences = availableExperiences.slice(0, 3)

  return (
    <div className={styles.home}>
      <ExperienceClickTracker />
      <HomeJsonLd
        siteName={settings.siteName}
        description={siteDescription}
        cityName={locale.cityName}
        featured={featured}
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
                کافه‌ای پیدا کن که
                <span> به حالِ امروزت</span> بخورد.
              </h1>
              <p className={styles.lede}>
                برای کار، قرار، یک فنجان قهوه یا غذای مشخص؛ نیازت را بگو و قبل از راه
                افتادن، منو، قیمت، ساعت کاری و مسیر همان شعبه را ببین.
              </p>

              <HeroSearch />

              <div className={styles.heroShortcuts} aria-label="شروع سریع">
                <Link href={searchPath({ nearMe: true, sort: 'distance' })}>
                  <LocateFixed size={18} aria-hidden="true" /> نزدیک من
                </Link>
                <Link href={searchPath({ openNow: true })}>
                  <Clock3 size={18} aria-hidden="true" /> الان باز است
                </Link>
                <Link href={paths.districtHub}>
                  <Building2 size={18} aria-hidden="true" /> انتخاب محله
                </Link>
              </div>
              <InstallLink />
            </div>

            {heroExperiences.length > 0 && (
              <div className={styles.heroVisual} aria-label="راه‌های انتخاب کافه بر اساس نیاز">
                {heroExperiences.map(({ experience, candidateCount }, index) => {
                  const Icon = experienceIcons[experience.slug]
                  return (
                    <Link
                      href={paths.experience(experience.slug)}
                      className={styles.heroMomentCard}
                      data-featured={index === 0 ? 'true' : undefined}
                      data-experience-track="card_click"
                      data-experience-slug={experience.slug}
                      data-experience-count={candidateCount}
                      key={experience.slug}
                    >
                      <img src={experience.image} alt={experience.imageAlt} width={1536} height={1024} />
                      <span className={styles.heroMomentBody}>
                        <i style={{ color: experience.accent } as CSSProperties}><Icon size={18} /></i>
                        <span><b>{experience.shortTitle}</b><small>{faCount(candidateCount)}</small></span>
                        <ChevronLeft size={17} aria-hidden="true" />
                      </span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          <div className={`container ${styles.proofBar}`} aria-label="پوشش واقعی اطلاعات کو کافه">
            <div><strong>{faCount(stats.publishedPlaces)}</strong><span>کافه و رستوران</span></div>
            <div><strong>{faCount(stats.menuItems)}</strong><span>آیتم منوی قابل جست‌وجو</span></div>
            <div><strong>{faCount(stats.districts)}</strong><span>محلهٔ {locale.cityName}</span></div>
          </div>
        </section>

        <DiscountDiscovery />
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
              <span className={styles.sectionKicker}>بدون دانستن اسم کافه</span>
              <h2 id="discovery-title">اول غذا را انتخاب کن، بعد کافه را</h2>
              <p>دستهٔ دلخواهت را باز کن یا قیمت یک انتخاب محبوب را بین چند منو مقایسه کن.</p>
            </div>
            <Link href={searchPath({ scope: 'items' })} className={styles.textLink}>
              همهٔ منوها <ArrowLeft size={16} />
            </Link>
          </div>

          <div className={styles.discoveryGrid}>
            <div className={styles.categoryGrid} aria-label="دسته‌های محبوب منو">
              {popularFacets.map((facet) => (
                <Link href={paths.menuCategory(facet.id)} className={styles.categoryCard} key={facet.id}>
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
                  <span><b>قبل از سفارش مقایسه کن</b><small>کمترین قیمت ثبت‌شده در منوها</small></span>
                </div>
                <div className={styles.dishList}>
                  {popularDishes.slice(0, 5).map((dish) => (
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

        {featured.length > 0 && (
          <section className={styles.featuredBand} aria-labelledby="featured-title">
            <div className={`container ${styles.section}`}>
              <div className={styles.sectionHeading}>
                <div>
                  <span className={styles.sectionKicker}>اطلاعات کامل‌تر برای تصمیم مطمئن‌تر</span>
                  <h2 id="featured-title">پیشنهادهایی برای شروع</h2>
                  <p>منو، ساعت، محله و اطلاعات ثبت‌شدهٔ هر شعبه را یک‌جا بررسی کن.</p>
                </div>
                <Link href={searchPath({ sort: 'quality' })} className={styles.textLink}>
                  همهٔ کافه‌ها <ArrowLeft size={16} />
                </Link>
              </div>
              <div className={styles.featuredGrid}>
                {featured.map((card) => <CafeCard key={card.id} card={card} facetLabels={facetLabels} />)}
              </div>
            </div>
          </section>
        )}

        <section id="how-it-works" className={styles.decisionBand} aria-labelledby="decision-title">
          <div className={`container ${styles.decisionGrid}`}>
            <div className={styles.decisionCopy}>
              <span>پیشنهاد قابل توضیح</span>
              <h2 id="decision-title">هر انتخاب، با اطلاعاتی که لازم داری</h2>
              <p>کو کافه فقط یک فهرست اسم نیست؛ قبل از انتخاب، سه سؤال اصلی را روشن می‌کند.</p>
              <Link href={paths.methodology}>روش جمع‌آوری و اعتبار داده‌ها <ArrowLeft size={16} /></Link>
            </div>
            <div className={styles.decisionSteps}>
              <div><BookOpenText size={23} /><span><b>چی دارد؟</b><small>منوی دسته‌بندی‌شده و قابل جست‌وجوی همان شعبه</small></span></div>
              <div><Clock3 size={23} /><span><b>الان می‌شود رفت؟</b><small>ساعت کاری، وضعیت بازبودن و آخرین به‌روزرسانی</small></span></div>
              <div><Navigation size={23} /><span><b>کجاست؟</b><small>آدرس، فاصله و مسیریابی مستقیم روی موبایل</small></span></div>
            </div>
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
                <Link href={paths.district(district.slug)} key={district.id}>
                  <MapPinned size={19} aria-hidden="true" />
                  <span><b>{district.name}</b><small>{faCount(district.placeCount)} مجموعه</small></span>
                  <ChevronLeft size={16} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
        )}

        <section id="for-venues" className={styles.ownerSection} aria-labelledby="owner-title">
          <div className={`container ${styles.ownerGrid}`}>
            <div className={styles.ownerCopy}>
              <span className={styles.ownerBadge}><Store size={16} /> برای کافه‌دارها</span>
              <h2 id="owner-title">منوی دیجیتال، فقط یک QR نیست.</h2>
              <p>صفحهٔ اختصاصی هر شعبه، منوی قابل جست‌وجو، قیمت، ساعت، تصویر و QR؛ همه در یک پنل ساده و مناسب موبایل.</p>
              <div className={styles.ownerChecks}>
                <span><Check size={17} /> مدیریت منو و موجودی</span>
                <span><Check size={17} /> صفحه و QR اختصاصی شعبه</span>
                <span><Check size={17} /> حضور در جست‌وجوی خوراکی و محله</span>
              </div>
              <div className={styles.ownerActions}>
                <Link href={paths.ownerLanding} className={styles.ownerPrimary}>دریافت پنل کافه <ArrowLeft size={16} /></Link>
                <Link href={authUrl(paths.ownerPanel)} className={styles.ownerSecondary}>ورود اعضا</Link>
              </div>
            </div>

            <div className={styles.ownerPreview} aria-label="امکانات پنل کافه">
              <div className={styles.previewHead}>
                <span><img src="/brand/app-icon-192.png" alt="" width={192} height={192} /></span>
                <div><small>صفحهٔ اختصاصی شعبه</small><b>منوی مرتب، همیشه در دسترس</b></div>
                <BadgeCheck size={22} aria-label="قابل تأیید" />
              </div>
              <div className={styles.previewRows}>
                <div><Tags size={20} /><span><b>دسته‌بندی و آیتم</b><small>ویرایش سریع قیمت و موجودی</small></span><strong>مدیریت</strong></div>
                <div><UtensilsCrossed size={20} /><span><b>منوی قابل جست‌وجو</b><small>برای مشتری و موتور جست‌وجو</small></span><strong>منتشر</strong></div>
                <div><ShieldCheck size={20} /><span><b>دسترسی امن شعبه</b><small>فقط برای مدیران مجاز</small></span><strong>فعال</strong></div>
              </div>
            </div>
          </div>
        </section>

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
