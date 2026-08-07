import { Star } from 'lucide-react'
import { fa } from '@/lib/format'
import styles from './Stars.module.css'

interface StarsProps {
  /** ستاره‌های پُر، ۰ تا ۵. */
  count: number
  /** اندازه‌ی هر ستاره بر حسب پیکسل. */
  size?: number
  /** نمایش ستاره‌های خالی — در ردیف نظر آری، در برچسبِ فشرده نه. */
  showEmpty?: boolean
}

/**
 * ردیف ستاره‌ی امتیاز.
 *
 * ═══ چرا کامپوننت مشترک و نه `'★'.repeat(n)` ═══
 *
 * همین `repeat` در شش جای پروژه تکرار شده بود — صفحه‌ی کافه، نظرهای من، پنل
 * ادمین، پنل کافه‌دار و دو کارت — هر کدام با اندازه و رنگ خودش. یعنی شش ظاهر
 * متفاوت برای یک چیز، و شش جا برای اصلاحِ هر تغییر.
 *
 * ═══ چرا آیکون برداری و نه نویسه‌ی «★» ═══
 *
 * `★` را هر سیستم‌عامل با فونت خودش می‌کشد: روی اندروید توپُر و بزرگ، روی iOS
 * باریک، روی ویندوز با ارتفاعِ متفاوت. یعنی ردیفِ ستاره روی هر دستگاه اندازه‌ی
 * دیگری داشت و با متنِ کنارش هم‌تراز نمی‌شد. SVG همه‌جا یک شکل است.
 *
 * برچسبِ دسترسی عدد را می‌گوید، پس خودِ ستاره‌ها از فناوری کمکی پنهان‌اند و
 * پنج بار «ستاره» خوانده نمی‌شود.
 */
export function Stars({ count, size = 14, showEmpty = false }: StarsProps) {
  const filled = Math.max(0, Math.min(5, Math.round(count)))

  return (
    <span className={styles.row}>
      <span className={styles.icons} aria-hidden="true">
        {Array.from({ length: filled }, (_, index) => (
          <Star key={`on-${index}`} size={size} className={styles.on} />
        ))}
        {showEmpty &&
          Array.from({ length: 5 - filled }, (_, index) => (
            <Star key={`off-${index}`} size={size} className={styles.off} />
          ))}
      </span>
      <span className="visually-hidden">{fa(filled)} از ۵</span>
    </span>
  )
}

export default Stars
