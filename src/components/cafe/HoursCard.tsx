import { fa } from '@/lib/format'
import type { DayGroup } from '@/core/hours/openNow'
import styles from './HoursCard.module.css'
import { ChevronDown, Clock } from 'lucide-react'

/**
 * ساعت کاری، فشرده.
 *
 * ═══ چرا جدولِ هفت‌سطری رفت ═══
 *
 * داده‌ی واقعی این کافه‌ها تقریباً همیشه دو یا سه واقعیت است: «شنبه تا چهارشنبه
 * ۰۹–۲۳»، «پنجشنبه ۱۰–۰۰:۳۰»، «جمعه تعطیل». جدول هفت‌سطری همان دو سه واقعیت
 * را هفت بار تکرار می‌کرد و نیم صفحه‌ی موبایل را می‌گرفت، و کاربر باید هفت سطر
 * را با هم مقایسه می‌کرد تا بفهمد فرقی ندارند. گروه‌بندی این کار را از او
 * می‌گیرد.
 *
 * ═══ چرا بسته باز می‌شود ═══
 *
 * سؤال ۹۰٪ کاربرها «الان چطور؟» است و جوابش در سرصفحه هست. «کلِ هفته» سؤال
 * کسی است که برای فردا برنامه می‌ریزد — پس یک سطر جمع‌شده که با یک لمس باز
 * می‌شود. `details` بومی است: بدون JS کار می‌کند و در HTML اولیه برای گوگل
 * قابل خواندن است.
 */

interface Props {
  groups: DayGroup[]
}

/** سطرِ خلاصه — همان چیزی که بسته دیده می‌شود. */
function summaryFor(groups: DayGroup[]): string {
  const today = groups.find((group) => group.containsToday)
  if (!today) return 'ساعت کاری ثبت نشده'
  if (today.unknown) return 'ساعت امروز نامشخص'
  if (today.closed) return 'امروز تعطیل'
  return `امروز ${fa(today.ranges.join('، '))}`
}

export function HoursCard({ groups }: Props) {
  if (groups.length === 0) return null

  // همه‌ی هفته نامشخص است — سطرِ «ساعت کاری ثبت نشده» چیزی به سرصفحه اضافه
  // نمی‌کند، چون نشانِ وضعیت همان را گفته.
  if (groups.every((group) => group.unknown)) return null

  return (
    <details className={styles.hours}>
      <summary className={styles.summary}>
        <span className={styles.icon} aria-hidden="true">
          <Clock size={16} />
        </span>
        <span className={styles.today}>{summaryFor(groups)}</span>
        <span className={styles.more}>ساعت کاری هفته</span>
        <ChevronDown size={15} aria-hidden="true" className={styles.caret} />
      </summary>

      <ul className={styles.list}>
        {groups.map((group) => (
          <li
            key={group.dows.join('-')}
            className={group.containsToday ? styles.rowToday : styles.row}
          >
            <span className={styles.days}>{group.label}</span>
            <span className={styles.ranges}>
              {group.unknown ? (
                <span className={styles.unknown}>نامشخص</span>
              ) : group.closed ? (
                <span className={styles.closed}>تعطیل</span>
              ) : (
                group.ranges.map((range) => (
                  <span key={range} className={styles.range}>
                    {fa(range)}
                  </span>
                ))
              )}
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}

export default HoursCard
