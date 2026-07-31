'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Chip } from '@/components/ui/Chip'
import { useInterval } from '@/hooks/useInterval'
import { QUICK_SUGGESTIONS, SEARCH_PLACEHOLDERS } from '@/data/home'
import { searchByIntents, searchUrl } from '@/routes'
import styles from './Home.module.css'

const PLACEHOLDER_INTERVAL_MS = 3400

/**
 * فیلد جست‌وجوی hero — تنها بخش تعاملی صفحه‌ی اصلی.
 *
 * جدا نگه داشته شده تا بقیه‌ی صفحه server component بماند و به بسته‌ی
 * جاوااسکریپت کلاینت فرستاده نشود.
 *
 * placeholder چرخشی عمداً با `suppressHydrationWarning` نیست: مقدار اولیه در
 * سرور و کلاینت یکی است (اندیس ۰) و چرخش فقط بعد از mount شروع می‌شود.
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
    router.push(searchUrl(query))
  }

  return (
    <>
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
            key={suggestion.intentId}
            label={suggestion.label}
            variant="suggest"
            /*
              مستقیم به نتیجه‌ی فیلترشده می‌رود، نه اینکه متن را داخل فیلد
              بریزد. قبلاً متن ریخته می‌شد و از همان مسیر تطبیق پیشوندیِ
              باگ‌دار رد می‌شد.
            */
            onClick={() => router.push(searchByIntents([suggestion.intentId]))}
          />
        ))}
      </div>
    </>
  )
}
