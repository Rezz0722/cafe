/**
 * نشانِ اپ‌های نقشه، برای فهرست انتخاب مسیریابی.
 *
 * ═══ چرا SVG درون‌خطی و نه فایل تصویر ═══
 *
 * سایت باید آفلاین کار کند (نقشه هم آفلاین است)، پس آوردن لوگو از CDN سرویس‌ها
 * منتفی است. ذخیره‌ی پنج PNG در `public/` هم پنج درخواست اضافه برای چیزی است
 * که چند صد بایت مسیر SVG است. درون‌خطی، بدون درخواست و بدون پرشِ چیدمان
 * رندر می‌شود.
 *
 * ═══ چرا شکل کاشیِ اپ ═══
 *
 * کاربر در فهرست انتخاب، «اپی که روی گوشی‌اش دارد» را با رنگ و شکل کاشی
 * می‌شناسد نه با خواندن اسم. این‌ها بازسازیِ ساده‌ی نشان هر سرویس‌اند تا در
 * ۲۶ پیکسل هم از هم قابل تفکیک باشند — نه لوگوی رسمی.
 */

interface Props {
  service: string
  size?: number
}

/** پینِ مشترک — بدنه‌ی اشک‌مانند با حفره‌ی وسط. */
const PIN = 'M12 5.2c-2.6 0-4.7 2.1-4.7 4.7 0 3.3 4.7 8.9 4.7 8.9s4.7-5.6 4.7-8.9c0-2.6-2.1-4.7-4.7-4.7Z'

export function MapServiceIcon({ service, size = 26 }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    'aria-hidden': true as const,
    focusable: 'false' as const,
    role: 'presentation',
  }

  switch (service) {
    case 'neshan':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="6" fill="#0f9d6b" />
          <path d={PIN} fill="#fff" />
          <circle cx="12" cy="9.9" r="1.7" fill="#0f9d6b" />
        </svg>
      )

    case 'balad':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="6" fill="#ef4056" />
          <path d={PIN} fill="#fff" />
          <circle cx="12" cy="9.9" r="1.7" fill="#ef4056" />
        </svg>
      )

    case 'google':
      // کاشیِ روشن با خطوط جاده و پینِ قرمز — همان چیزی که چشم «گوگل مپس»
      // می‌خواند.
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="6" fill="#f1f3f4" />
          <path d="M0 15.4h24v2.4H0z" fill="#4285f4" opacity="0.9" />
          <path d="M4.6 24V0h2.2v24z" fill="#34a853" opacity="0.85" />
          <path d="M24 4.4v3.2l-9 6.4-2-2.4z" fill="#fbbc04" opacity="0.9" />
          <path d={PIN} fill="#ea4335" />
          <circle cx="12" cy="9.9" r="1.6" fill="#f1f3f4" />
        </svg>
      )

    case 'waze':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="6" fill="#33ccff" />
          <path
            d="M12 5.4c-3.5 0-6.3 2.5-6.3 5.7 0 1.4.5 2.6 1.4 3.6-.2.9-.7 1.6-1.3 2.1h6.2c3.5 0 6.3-2.5 6.3-5.7S15.5 5.4 12 5.4Z"
            fill="#fff"
          />
          <circle cx="10.1" cy="10.6" r="1" fill="#33ccff" />
          <circle cx="14.2" cy="10.6" r="1" fill="#33ccff" />
          <path
            d="M9.9 13.2c.5.7 1.2 1.1 2.1 1.1s1.6-.4 2.1-1.1"
            stroke="#33ccff"
            strokeWidth="1.1"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      )

    case 'osm':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="6" fill="#7ebc6f" />
          <circle cx="12" cy="12" r="6.4" stroke="#fff" strokeWidth="1.4" fill="none" />
          <path
            d="M5.6 12h12.8M12 5.6c1.8 1.8 1.8 11 0 12.8-1.8-1.8-1.8-11 0-12.8Z"
            stroke="#fff"
            strokeWidth="1.2"
            fill="none"
          />
        </svg>
      )

    /* گزینه‌های غیرِ سرویس: اپِ پیش‌فرض گوشی، کپی مختصات، کپی آدرس. */
    case 'device':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="6" fill="var(--c-surface-4)" />
          <rect
            x="7.6"
            y="4.4"
            width="8.8"
            height="15.2"
            rx="2.2"
            stroke="var(--c-ink-2)"
            strokeWidth="1.3"
            fill="none"
          />
          <path
            d="M12 7.6c-1.5 0-2.7 1.2-2.7 2.7 0 1.9 2.7 5.1 2.7 5.1s2.7-3.2 2.7-5.1c0-1.5-1.2-2.7-2.7-2.7Z"
            fill="var(--c-ink-2)"
          />
          <circle cx="12" cy="10.2" r="0.95" fill="var(--c-surface-4)" />
        </svg>
      )

    case 'copy':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="6" fill="var(--c-surface-4)" />
          <rect
            x="5.6"
            y="5.6"
            width="9"
            height="9"
            rx="2"
            stroke="var(--c-ink-2)"
            strokeWidth="1.3"
            fill="none"
          />
          <rect
            x="9.4"
            y="9.4"
            width="9"
            height="9"
            rx="2"
            fill="var(--c-surface-4)"
            stroke="var(--c-ink-2)"
            strokeWidth="1.3"
          />
        </svg>
      )

    default:
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="6" fill="var(--c-surface-4)" />
          <path d={PIN} fill="var(--c-ink-2)" />
          <circle cx="12" cy="9.9" r="1.7" fill="var(--c-surface-4)" />
        </svg>
      )
  }
}

export default MapServiceIcon
