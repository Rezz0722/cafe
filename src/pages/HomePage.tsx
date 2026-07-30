import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import logo from '@/assets/logo.png'
import heroPhoto from '@/assets/cafe-photo.webp'
import { CafeCard } from '@/components/cafe/CafeCard'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { Chip, ChipLink } from '@/components/ui/Chip'
import { getFeatured } from '@/data/cafes'
import { INTENT_CARDS, POPULAR_FILTERS, QUICK_SUGGESTIONS, SEARCH_PLACEHOLDERS } from '@/data/home'
import { useInterval } from '@/hooks/useInterval'
import { paths, searchUrl } from '@/routes'
import styles from './HomePage.module.css'

const PLACEHOLDER_INTERVAL_MS = 3400

export function HomePage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const featured = getFeatured()

  useInterval(
    () => setPlaceholderIndex((i) => (i + 1) % SEARCH_PLACEHOLDERS.length),
    PLACEHOLDER_INTERVAL_MS,
  )

  function handleSearch(event: FormEvent) {
    event.preventDefault()
    navigate(searchUrl(query))
  }

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
                اسم جایی رو نگو، <b>حالت رو بگو</b>. بگو دنبال چی می‌گردی تا بهترین کافه و رستوران
                مشهد رو برات پیدا کنیم.
              </p>

              <form className={styles.searchForm} onSubmit={handleSearch} role="search">
                <div className={styles.searchField}>
                  <span className={styles.searchIcon} aria-hidden="true">
                    ⌕
                  </span>
                  <input
                    className={styles.searchInput}
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={SEARCH_PLACEHOLDERS[placeholderIndex]}
                    aria-label="جستجوی کافه"
                  />
                </div>
                <button type="submit" className={styles.searchSubmit}>
                  جستجو
                </button>
              </form>

              <div className={styles.suggestions}>
                <span className={styles.suggestionsLabel}>پیشنهاد سریع:</span>
                {QUICK_SUGGESTIONS.map((suggestion) => (
                  <Chip
                    key={suggestion}
                    label={suggestion}
                    variant="suggest"
                    onClick={() => setQuery(suggestion)}
                  />
                ))}
              </div>
            </div>

            <div className={styles.heroArt}>
              <div className={styles.heroFrame}>
                <img
                  src={heroPhoto}
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
                  <div className={styles.statValue}>۱٬۲۴۰ کافه در مشهد</div>
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
                <ChipLink key={filter.label} label={filter.label} to={filter.to} variant="solid" />
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
            <Link to={paths.search} className={styles.seeAll}>
              دیدن همه ←
            </Link>
          </div>

          <div className={styles.featuredGrid}>
            {featured.map((cafe) => (
              <CafeCard key={cafe.id} cafe={cafe} />
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
                to={card.to}
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
                  {card.count} ←
                </span>
              </Link>
            ))}
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
                <div className={styles.mapSub}>همهٔ کافه‌های مشهد را روی نقشه کنار هم ببین.</div>
              </div>
            </div>
            <Link to={`${paths.search}?view=map`} className={styles.mapButton}>
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
                این‌جا رو <span className={styles.partTitleAccent}>جوون‌های مشهد</span> با هم می‌سازن
              </h2>
              <p className={styles.partText}>
                یک کافهٔ خوب پیدا کردی که هنوز این‌جا نیست؟ معرفی‌اش کن تا بقیه هم پیداش کنن. بدون
                تبلیغ، بدون اسپانسر — فقط پیشنهاد آدم‌های واقعی.
              </p>
              <div className={styles.partActions}>
                <Link to={paths.admin} className={styles.partPrimary}>
                  کافه‌ات رو معرفی کن
                </Link>
                <Link to={paths.home} className={styles.partSecondary}>
                  دربارهٔ پروژه
                </Link>
              </div>
            </div>

            <div className={styles.partArt}>
              <div className={styles.partFrame}>
                <img className={styles.partMascot} src={logo} alt="" width={280} height={280} />
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
