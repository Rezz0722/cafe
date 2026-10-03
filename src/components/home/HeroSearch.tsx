import Link from 'next/link'
import { ArrowLeft, Search } from 'lucide-react'
import { QUICK_SUGGESTIONS } from '@/data/home'
import { paths } from '@/routes'
import styles from './Home.module.css'

/**
 * جست‌وجوی اصلی عمداً یک فرم HTML معمولی است، نه کامپوننت کلاینتی.
 * در نتیجه بدون جاوااسکریپت هم کار می‌کند، به bundle صفحه چیزی اضافه نمی‌کند
 * و کاربر از روی label و مثال ثابت دقیقاً می‌فهمد چه چیزهایی قابل جست‌وجویند.
 */
export function HeroSearch() {
  return (
    <div className={styles.searchBlock}>
      <div className={styles.searchIntro}>
        <span className={styles.searchIntroIcon} aria-hidden="true"><Search size={17} /></span>
        <span><b>دنبال چی می‌گردی؟</b><small>کافه، غذا یا محله را همین‌جا پیدا کن</small></span>
        <ArrowLeft size={16} aria-hidden="true" />
      </div>
      <form className={styles.searchForm} action={paths.search} method="get" role="search">
        <span className={styles.searchOrbitDot} aria-hidden="true" />
        <label htmlFor="home-search" className={styles.searchLabel}>
          جست‌وجوی کافه، منو و محله
        </label>
        <div className={styles.searchControl}>
          <Search className={styles.searchIcon} size={21} aria-hidden="true" />
          <input
            id="home-search"
            className={styles.searchInput}
            type="search"
            name="q"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="مثلاً پاستا، قهوه دمی، راموز یا احمدآباد"
            aria-describedby="home-search-help"
          />
          <button type="submit" className={styles.searchSubmit}>
            پیدا کن
          </button>
        </div>
      </form>

      <div id="home-search-help" className={styles.suggestions}>
        <span className={styles.suggestionsLabel}>یا مستقیم انتخاب کن:</span>
        <div className={styles.suggestionLinks}>
          {QUICK_SUGGESTIONS.slice(0, 5).map((suggestion) => (
            <Link key={suggestion.label} href={suggestion.href}>
              {suggestion.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

export default HeroSearch
