'use client'

/**
 * تصویر آیتم منو، با جایگزینِ لوگو.
 *
 * ═══ مسئله ═══
 *
 * از ۱۹۳۸۶ آیتم منو، بخش قابل‌توجهی عکس اختصاصی ندارند. نسخه‌ی قبلی برایشان یک
 * `<span>` خالی با پس‌زمینه‌ی گرادیان می‌گذاشت — یعنی یک مربعِ تقریباً سفید کنار
 * نام آیتم. در فهرستی که نصفِ آیتم‌هایش عکس دارند، آن مربع‌های خالی صفحه را
 * شبیه چیزی می‌کنند که خراب بارگذاری شده.
 *
 * ═══ چرا لوگوی کافه و نه یک آیکون ═══
 *
 * لوگو در همان کادر، هم فضا را پر می‌کند و هم چیزی *می‌گوید*: این آیتم مالِ
 * این مجموعه است. ولی نباید ادای عکسِ غذا را دربیاورد، وگرنه کاربر فکر می‌کند
 * لاته این کافه شکلِ لوگوست. پس با شفافیت و پس‌زمینه‌ی تینت نمایش می‌شود —
 * خواندنی، ولی صریحاً «عکسِ خودِ آیتم نیست».
 *
 * ═══ چرا کلاینت ═══
 *
 * `onError` لازم است. آدرسِ تصویری که در دیتابیس هست ولی فایلش نیست (۱۵ ردیف
 * در `media` وضعیت خطا دارند) وگرنه به همان مربعِ شکسته‌ی مرورگر تبدیل می‌شود —
 * دقیقاً چیزی که قرار بود حذف شود.
 */

import { useState } from 'react'
import { Coffee } from 'lucide-react'
import styles from './MenuItemImage.module.css'

interface Props {
  /** عکس اختصاصی آیتم، اگر دارد. */
  src: string | null
  /** لوگوی مجموعه — جایگزینِ درجه‌دوم. */
  fallbackSrc: string | null
  alt: string
  /** ابعاد ثابت تا رسیدنِ تصویر، چیدمان را نپراند. */
  size?: number
  width?: number | null
  height?: number | null
}

export function MenuItemImage({
  src,
  fallbackSrc,
  alt,
  size = 96,
  width,
  height,
}: Props) {
  /** کدام منبع شکسته — تا با هر رندر دوباره امتحانش نکنیم. */
  const [failed, setFailed] = useState<Set<string>>(new Set())

  const own = src && !failed.has(src) ? src : null
  const logo = fallbackSrc && !failed.has(fallbackSrc) ? fallbackSrc : null

  const markFailed = (url: string) =>
    setFailed((previous) => {
      const next = new Set(previous)
      next.add(url)
      return next
    })

  if (own) {
    return (
      <img
        src={own}
        alt={alt}
        width={width ?? size}
        height={height ?? size}
        loading="lazy"
        decoding="async"
        className={styles.photo}
        onError={() => markFailed(own)}
      />
    )
  }

  if (logo) {
    return (
      <span className={styles.logoWrap} aria-hidden="true">
        <img
          src={logo}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className={styles.logo}
          onError={() => markFailed(logo)}
        />
      </span>
    )
  }

  // نه عکس آیتم، نه لوگو — باز هم باکس خالی نه.
  return (
    <span className={styles.iconWrap} aria-hidden="true">
      <Coffee size={Math.round(size * 0.3)} strokeWidth={1.6} />
    </span>
  )
}

export default MenuItemImage
