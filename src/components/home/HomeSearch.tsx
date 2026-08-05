'use client'

/**
 * جست‌وجوی صفحه‌ی اول.
 *
 * ═══ چرا کلاینت ═══
 *
 * برای اینکه `Enter` بدون بارگذاری کامل صفحه به `/search` برود و پیشنهادهای
 * سریع را نشان بدهد. خودِ جست‌وجو سمت سرور انجام می‌شود؛ این فقط ورودی است.
 *
 * ═══ پیشنهادها از دیتابیس نمی‌آیند ═══
 *
 * عمدی: یک درخواست autocomplete برای هر کاراکترِ تایپ‌شده، فشار بی‌دلیلی است
 * وقتی هدف فقط «به کاربر نشان بده چه چیزهایی می‌تواند بجوید» است. این‌ها
 * نمونه‌های ثابتِ الهام‌بخش‌اند و همه‌شان به فیلترِ واقعی وصل‌اند.
 */

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { searchPath } from '@/core/search/filters'
import styles from './HomeSearch.module.css'

/** نمونه‌های الهام‌بخش — هرکدام به یک فیلترِ واقعی وصل است. */
const HINTS: { label: string; href: string }[] = [
  { label: 'قهوه دمی', href: searchPath({ facets: ['brewed_coffee'] }) },
  { label: 'صبحانه', href: searchPath({ facets: ['breakfast'] }) },
  { label: 'پاستا', href: searchPath({ facets: ['pasta'] }) },
  { label: 'ماچا', href: searchPath({ facets: ['matcha'] }) },
  { label: 'رژیمی', href: searchPath({ facets: ['healthy'] }) },
  { label: 'قلیان', href: searchPath({ facets: ['hookah'] }) },
]

export function HomeSearch() {
  const router = useRouter()
  const [value, setValue] = useState('')

  return (
    <div className={styles.wrap}>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault()
          router.push(searchPath({ q: value }))
        }}
      >
        <input
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="نام کافه یا محله را بنویس"
          aria-label="جست‌وجوی کافه"
        />
        <button type="submit">بگرد</button>
      </form>

      <div className={styles.hints}>
        {HINTS.map((hint) => (
          <a key={hint.label} href={hint.href} className={styles.hint}>
            {hint.label}
          </a>
        ))}
      </div>
    </div>
  )
}

export default HomeSearch
