import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowLeft,
  BookOpen,
  Coffee,
  Laptop,
  type LucideIcon,
  MapPinned,
  Moon,
  PenLine,
  Sparkles,
  Sprout,
  Star,
  Trees,
} from 'lucide-react'
import { CafeCard } from '@/components/cafe/CafeCard'
import { HeroSearch } from '@/components/home/HeroSearch'
import { MaintenanceScreen } from '@/components/site/MaintenanceScreen'
import { ChipLink } from '@/components/ui/Chip'
import { INTENT_CARDS, POPULAR_FILTERS, type IntentIcon } from '@/data/home'
import {
  getSiteStats,
  listAttributeCounts,
  listDistricts,
  listFilterFacets,
  listPlaceCards,
} from '@/core/places/queries'
import { searchPath } from '@/core/search/filters'
import { maintenanceState } from '@/core/settings/maintenance'
import { getDiscoveryPolicy, getLocalePolicy } from '@/core/settings/policies'
import { getSettings } from '@/core/settings/store'
import { fa, faCount } from '@/lib/format'
import { paths } from '@/routes'
import styles from '@/components/home/Home.module.css'

/**
 * صفحه‌ی اصلی — server component.
 *
 * ═══ ساختار و چرایی‌اش ═══
 *
 * صفحه‌ی اول یک راهنمای شهری باید به یک سؤال جواب بدهد: «امروز کجا بریم؟» پس
 * از عام به خاص می‌رود:
 *
 *   hero + جست‌وجو      کاربری که می‌داند چه می‌خواهد
 *   نوار فیلتر          میان‌برهای پرمصرف، یک کلیک
 *   کافه‌های منتخب       کاربری که می‌خواهد ببیند
 *   کارت‌های نیت         کاربری که حالش را می‌داند نه جا را
 *   محله‌ها              صفحات محلی، پایه‌ی رشد ارگانیک
 *
 * ═══ هیچ عددی دستی نیست ═══
 *
 * هر شماری که روی صفحه دیده می‌شود از دیتابیس می‌آید، و هرچه داده ندارد
 * **اصلاً نشان داده نمی‌شود** — نه با صفر، نه با عددِ گردشده. کارت‌های نیت
 * فعلاً بی‌عددند چون `place_attribute` خالی است؛ به‌محض برچسب‌خوردن مکان‌ها از
 * پنل، خودشان عدد می‌گیرند بدون تغییر این فایل.
 *
 * فقط `HeroSearch` سمت کلاینت است.
 */

/** نگاشتِ شناسه‌ی آیکونِ کارت نیت به کامپوننت — داده‌ی `home.ts` خالص می‌ماند. */
const INTENT_ICONS: Record<IntentIcon, LucideIcon> = {
  laptop: Laptop,
  moon: Moon,
  leaf: Trees,
  book: BookOpen,
}

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings()
  return {
    title: s.siteTagline ? `${s.siteName} — ${s.siteTagline}` : s.siteName,
    description: s.siteDescription,
    alternates: { canonical: '/' },
  }
}

export default async function HomePage() {
  const gate = await maintenanceState()
  if (gate.closed) {
    return <MaintenanceScreen siteName={gate.siteName} message={gate.message} />
  }

  const [discovery, locale] = await Promise.all([getDiscoveryPolicy(), getLocalePolicy()])

  const [stats, featured, facets, districts, attributeCounts] = await Promise.all([
    getSiteStats(),
    listPlaceCards({ limit: discovery.homeCardCount, sort: 'rating' }),
    listFilterFacets(),
    listDistricts(),
    listAttributeCounts(),
  ])

  // برچسب facetها یک‌بار خوانده و به همه‌ی کارت‌ها داده می‌شود — نگاشت دستیِ
  // دومی در پروژه نمی‌ماند و کارت‌ها پرس‌وجوی خودشان را نمی‌زنند.
  const facetLabels: Record<string, string> = {}
  for (const facet of facets) facetLabels[facet.id] = facet.labelFa

  const activeDistricts = districts.filter((district) => district.placeCount > 0)

  return (
    <div className="page">
      <main>
        {/* ===== hero ===== */}
        <section className={`container ${styles.hero}`}>
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <div className={styles.badge}>
                راهنمای کافه‌های {locale.cityName}
                <Sparkles size={14} aria-hidden="true" />
              </div>
              <h1 className={styles.title}>
                امروز کجا بریم؟
                <br />
                <span className={styles.titleAccent}>کافهٔ خودت</span> رو پیدا کن.
              </h1>
              <p className={styles.lede}>
                اسم جایی رو نگو، <b>حالت رو بگو</b>. بگو دنبال چی می‌گردی تا بهترین کافه و
                رستوران {locale.cityName} رو برات پیدا کنیم.
              </p>

              <HeroSearch />
            </div>

            <div className={styles.heroArt}>
              <div className={styles.heroFrame}>
                <img
                  src="/cafe-photo.webp"
                  alt={`فضای گرم و پرگیاه یک کافه در ${locale.cityName}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  width={1200}
                  height={800}
                />
              </div>
              <div className={styles.statCard}>
                <div className={styles.statIcon} aria-hidden="true">
                  <Coffee size={19} />
                </div>
                <div>
                  <div className={styles.statLabel}>تا حالا معرفی‌شده</div>
                  {/* شمارش واقعی، نه عدد تبلیغاتی */}
                  <div className={styles.statValue}>
                    {faCount(stats.publishedPlaces)} مجموعه در {locale.cityName}
                  </div>
                </div>
              </div>
              <div className={styles.ratingTag}>
                {faCount(stats.menuItems)} قیمت واقعی منو
                <Star size={13} aria-hidden="true" />
              </div>
            </div>
          </div>
        </section>

        {/* ===== popular filters ===== */}
        <section className={styles.filterBar} aria-label="فیلترهای پرکاربرد">
          <div className={`container ${styles.filterBarInner}`}>
            <div className={styles.filterBarTitle}>فیلترهای پرکاربرد:</div>
            <div className={styles.filterChips}>
              {POPULAR_FILTERS.map((filter) => (
                <ChipLink key={filter.label} label={filter.label} href={filter.to} variant="solid" />
              ))}
            </div>
            <div className={styles.priceNote}>قیمت‌ها به تومان</div>
          </div>
        </section>

        {/* ===== featured ===== */}
        <section className={`container ${styles.section}`}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionHeadCopy}>
              <h2 className={styles.h2}>کافه‌های منتخب</h2>
              <p className={styles.sectionSub}>
                دست‌چین‌شده توسط آدم‌هایی که واقعاً این‌جا زندگی می‌کنن.
              </p>
              <div className={styles.editorNote}>
                <PenLine size={13} aria-hidden="true" />
                نه تبلیغاتی، نه اسپانسری
              </div>
            </div>
            <Link href={paths.search} className={styles.seeAll}>
              دیدن همه <ArrowLeft size={15} aria-hidden="true" />
            </Link>
          </div>

          <div className={styles.featuredGrid}>
            {featured.map((card) => (
              <CafeCard key={card.id} card={card} facetLabels={facetLabels} />
            ))}
          </div>
        </section>

        {/* ===== intents ===== */}
        <section className={`container ${styles.intentSection}`}>
          <div className={styles.intentHead}>
            <h2 className={styles.h2}>بگو حالت چطوره، جاشو پیدا می‌کنیم</h2>
            <p className={styles.intentHeadSub}>
              هر موقعیتی، یک کافهٔ درست دارد. تو فقط انتخاب کن.
            </p>
          </div>

          <div className={styles.intentGrid}>
            {INTENT_CARDS.map((card) => {
              const count = attributeCounts[card.attributeId] ?? 0
              const Icon = INTENT_ICONS[card.icon]
              return (
                <Link
                  key={card.title}
                  href={card.to}
                  className={styles.intentCard}
                  style={{ background: card.bg }}
                >
                  <div className={styles.intentEmoji} aria-hidden="true">
                    <Icon size={26} strokeWidth={1.9} />
                  </div>
                  <div className={styles.intentTitle}>{card.title}</div>
                  <p className={styles.intentText} style={{ color: card.textColor }}>
                    {card.text}
                  </p>
                  {/* عدد فقط وقتی واقعاً چیزی برای شمردن هست. */}
                  <span className={styles.intentCount} style={{ color: card.countColor }}>
                    {count > 0 ? `${fa(count)} مجموعه` : 'ببین'}
                    <ArrowLeft size={13} aria-hidden="true" />
                  </span>
                </Link>
              )
            })}
          </div>
        </section>

        {/* ===== districts — صفحات محلی، پایه‌ی رشد ارگانیک ===== */}
        <section className={`container ${styles.section}`}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionHeadCopy}>
              <h2 className={styles.h2}>محله‌های {locale.cityName}</h2>
              <p className={styles.sectionSub}>کافه‌های هر محله را جداگانه ببین.</p>
            </div>
            {/* چیپ‌های زیر فقط پرکاربردترین محله‌هایند؛ فهرست کامل و نقشه در
                لندینگِ محله‌هاست. */}
            <Link href={paths.districtHub} className={styles.seeAll}>
              همه‌ی محله‌ها روی نقشه <ArrowLeft size={15} aria-hidden="true" />
            </Link>
          </div>
          <div className={styles.filterChips}>
            {activeDistricts.map((district) => (
              <ChipLink
                key={district.id}
                label={`${district.name} (${fa(district.placeCount)})`}
                href={paths.district(district.slug)}
                variant="outline"
                size="lg"
              />
            ))}
          </div>
        </section>

        {/* ===== map invite ===== */}
        <section className={`container ${styles.mapSection}`}>
          <div className={styles.mapCard}>
            <div className={styles.mapCopy}>
              <div className={styles.mapIcon} aria-hidden="true">
                <MapPinned size={20} />
              </div>
              <div>
                <div className={styles.mapTitle}>ترجیح می‌دی روی نقشه ببینی؟</div>
                <div className={styles.mapSub}>
                  {faCount(stats.mappablePlaces)} مجموعه با مختصات ثبت‌شده، روی نقشهٔ آفلاین.
                </div>
              </div>
            </div>
            <Link href={searchPath({ view: 'map' })} className={styles.mapButton}>
              نمایش روی نقشه
            </Link>
          </div>
        </section>

        {/* ===== participation ===== */}
        <section className={styles.partSection}>
          <div className={`container ${styles.partGrid}`}>
            <div>
              <div className={styles.partBadge}>
                یک پروژهٔ مردمی
                <Sprout size={14} aria-hidden="true" />
              </div>
              <h2 className={styles.partTitle}>
                این‌جا رو <span className={styles.partTitleAccent}>جوون‌های {locale.cityName}</span>{' '}
                با هم می‌سازن
              </h2>
              <p className={styles.partText}>
                یک کافهٔ خوب پیدا کردی که هنوز این‌جا نیست؟ معرفی‌اش کن تا بقیه هم پیداش کنن.
                بدون تبلیغ، بدون اسپانسر — فقط پیشنهاد آدم‌های واقعی.
              </p>
              <div className={styles.partActions}>
                {/* مقصد درست حالا فرم ثبت کاربر است، نه پنل ادمین. */}
                <Link href={paths.submitPlace} className={styles.partPrimary}>
                  کافه‌ات رو معرفی کن
                </Link>
                <Link href={paths.home} className={styles.partSecondary}>
                  دربارهٔ پروژه
                </Link>
              </div>
            </div>

            <div className={styles.partArt}>
              <div className={styles.partFrame}>
                <img
                  className={styles.partMascot}
                  src="/logo.png"
                  alt=""
                  width={280}
                  height={280}
                />
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
