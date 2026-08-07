'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ChipLink } from '@/components/ui/Chip'
import { useInterval } from '@/hooks/useInterval'
import { QUICK_SUGGESTIONS, SEARCH_PLACEHOLDERS } from '@/data/home'
import { searchPath } from '@/core/search/filters'
import styles from './Home.module.css'
import { Search } from 'lucide-react'

const PLACEHOLDER_INTERVAL_MS = 3400

/**
 * فیلد جست‌وجوی hero — تنها بخش تعاملی صفحه‌ی اصلی.
 *
 * جدا نگه داشته شده تا بقیه‌ی صفحه server component بماند و به بسته‌ی
 * جاوااسکریپت کلاینت فرستاده نشود.
 *
 * placeholder چرخشی عمداً `suppressHydrationWarning` ندارد: مقدار اولیه در
 * سرور و کلاینت یکی است (اندیس ۰) و چرخش فقط بعد از mount شروع می‌شود.
 *
 * چیپ‌ها `ChipLink`اند نه `Chip` با `onClick`: چیپی که جایی می‌رود باید لنگر
 * باشد، وگرنه کلیکِ وسط و «باز کردن در تب جدید» کار نمی‌کند.
 */
export function HeroSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)

  useInterval(
    () => setPlaceholderIndex((i) => (i + 1) % SEARCH_PLACEHOLDERS.length),
    PLACEHOLDER_INTERVAL_MS,
  )

  function handleSearch(event: FormEvent) {
    event.preventDefault()
    router.push(searchPath({ q: query }))
  }

  return (
    <>
      <form className={styles.searchForm} onSubmit={handleSearch} role="search">
        <div className={styles.searchField}>
          <span className={styles.searchIcon} aria-hidden="true">
            <Search size={19} aria-hidden="true" />
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
          <ChipLink
            key={suggestion.label}
            label={suggestion.label}
            href={suggestion.href}
            variant="suggest"
          />
        ))}
      </div>
    </>
  )
}

export default HeroSearch
