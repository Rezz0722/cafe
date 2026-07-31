import Link from 'next/link'
import { CafeCard } from '@/components/cafe/CafeCard'
import { HeroSearch } from '@/components/home/HeroSearch'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { ChipLink } from '@/components/ui/Chip'
import { INTENT_CARDS, POPULAR_FILTERS } from '@/data/home'
import { loadDistricts, loadPublishedViews } from '@/core/places/repository'
import { fa } from '@/lib/format'
import { paths } from '@/routes'
import styles from '@/components/home/Home.module.css'

/**
 * صفحه‌ی اصلی — server component.
 *
 * کافه‌های منتخب و شمارش نیت‌ها روی سرور محاسبه و داخل HTML رندر می‌شوند.
 * فقط `HeroSearch` سمت کلاینت است.
 */

const FEATURED_COUNT = 6

export default async function HomePage() {
  const [places, districts] = await Promise.all([loadPublishedViews(), loadDistricts()])

  const districtName = (id: string) => districts.find((d) => d.id === id)?.name ?? ''

  // منتخب‌ها: امتیاز بیزی، نه میانگین خام — تا کافه‌ی ۴٫۹ با ۳ نظر بالای
  // کافه‌ی ۴٫۶ با ۵۰۰ نظر ننشیند.
  const featured = [...places].sort((a, b) => b.rating - a.rating).slice(0, FEATURED_COUNT)

  /**
   * شمارش واقعی برای هر نیت. در ماکاپ این‌ها متن ثابت بودند («۲۱۰ کافه») —
   * عدد ساختگی روی صفحه‌ی اول، اولین چیزی است که وقتی کاربر کلیک می‌کند و
   * ۴ نتیجه می‌بیند اعتمادش را می‌شکند.
   */
  const intentCount = (intentId: string) =>
    places.filter((p) => p.activeAttributeIds.includes(intentId)).length

  return (
    <div className="page">
      <SiteHeader />

      <main>
        {/* ===== hero ===== */}
        <section className={`container ${styles.hero}`}>
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <div className={styles.badge}>راهنمای کافه‌های مشهد ✦</div>
              <h1 className={styles.title}>
                امروز کجا بریم؟
                <br />
                <span className={styles.titleAccent}>کافهٔ خودت</span> رو پیدا کن.
              </h1>
              <p className={styles.lede}>
                اسم جایی رو نگو، <b>حالت رو بگو</b>. بگو دنبال چی می‌گردی تا بهترین کافه و
                رستوران مشهد رو برات پیدا کنیم.
              </p>

              <HeroSearch />
            </div>

            <div className={styles.heroArt}>
              <div className={styles.heroFrame}>
                <img
                  src="/cafe-photo.webp"
                  alt="فضای گرم و پرگیاه یک کافه در مشهد"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  width={1200}
                  height={800}
                />
              </div>
              <div className={styles.statCard}>
                <div className={styles.statIcon} aria-hidden="true">
                  ☕
                </div>
                <div>
                  <div className={styles.statLabel}>تا حالا معرفی‌شده</div>
                  {/* شمارش واقعی، نه عدد تبلیغاتی */}
                  <div className={styles.statValue}>{fa(places.length)} کافه در مشهد</div>
                </div>
              </div>
              <div className={styles.ratingTag}>امتیاز واقعی محلی‌ها ★</div>
            </div>
          </div>
        </section>

        {/* ===== popular filters ===== */}
        <section className={styles.filterBar} aria-label="فیلترهای پرکاربرد">
          <div className={`container ${styles.filterBarInner}`}>
            <div className={styles.filterBarTitle}>فیلترهای پرکاربرد:</div>
            <div className={styles.filterChips}>
              {POPULAR_FILTERS.map((filter) => (
                <ChipLink
                  key={filter.label}
                  label={filter.label}
                  href={filter.to}
                  variant="solid"
                />
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
              <div className={styles.editorNote}>✎ نه تبلیغاتی، نه اسپانسری</div>
            </div>
            <Link href={paths.search} className={styles.seeAll}>
              دیدن همه ←
            </Link>
          </div>

          <div className={styles.featuredGrid}>
            {featured.map((place) => (
              <CafeCard
                key={place.id}
                place={place}
                districtName={districtName(place.districtId)}
              />
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
            {INTENT_CARDS.map((card) => (
              <Link
                key={card.title}
                href={card.to}
                className={styles.intentCard}
                style={{ background: card.bg }}
              >
                <div className={styles.intentEmoji} aria-hidden="true">
                  {card.emoji}
                </div>
                <div className={styles.intentTitle}>{card.title}</div>
                <p className={styles.intentText} style={{ color: card.textColor }}>
                  {card.text}
                </p>
                <span className={styles.intentCount} style={{ color: card.countColor }}>
                  {fa(intentCount(card.intentId))} کافه ←
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* ===== districts — صفحات محلی، پایه‌ی رشد ارگانیک ===== */}
        <section className={`container ${styles.section}`}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionHeadCopy}>
              <h2 className={styles.h2}>محله‌های مشهد</h2>
              <p className={styles.sectionSub}>کافه‌های هر محله را جداگانه ببین.</p>
            </div>
          </div>
          <div className={styles.filterChips}>
            {districts.map((d) => {
              const count = places.filter((p) => p.districtId === d.id).length
              return (
                <ChipLink
                  key={d.id}
                  label={`${d.name} (${fa(count)})`}
                  href={paths.district(d.slug)}
                  variant="outline"
                  size="lg"
                />
              )
            })}
          </div>
        </section>

        {/* ===== map invite ===== */}
        <section className={`container ${styles.mapSection}`}>
          <div className={styles.mapCard}>
            <div className={styles.mapCopy}>
              <div className={styles.mapIcon} aria-hidden="true">
                ◍
              </div>
              <div>
                <div className={styles.mapTitle}>ترجیح می‌دی روی نقشه ببینی؟</div>
                <div className={styles.mapSub}>
                  همهٔ کافه‌های مشهد را روی نقشه کنار هم ببین.
                </div>
              </div>
            </div>
            <Link href={`${paths.search}?view=map`} className={styles.mapButton}>
              نمایش روی نقشه
            </Link>
          </div>
        </section>

        {/* ===== participation ===== */}
        <section className={styles.partSection}>
          <div className={`container ${styles.partGrid}`}>
            <div>
              <div className={styles.partBadge}>یک پروژهٔ مردمی 🌿</div>
              <h2 className={styles.partTitle}>
                این‌جا رو <span className={styles.partTitleAccent}>جوون‌های مشهد</span> با هم
                می‌سازن
              </h2>
              <p className={styles.partText}>
                یک کافهٔ خوب پیدا کردی که هنوز این‌جا نیست؟ معرفی‌اش کن تا بقیه هم پیداش کنن.
                بدون تبلیغ، بدون اسپانسر — فقط پیشنهاد آدم‌های واقعی.
              </p>
              <div className={styles.partActions}>
                <Link href={paths.admin} className={styles.partPrimary}>
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

      <SiteFooter />
    </div>
  )
}
