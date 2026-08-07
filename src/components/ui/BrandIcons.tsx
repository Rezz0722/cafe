/**
 * نشانِ برندهای شبکه‌های اجتماعی.
 *
 * ═══ چرا اینجا و نه از `lucide-react` ═══
 *
 * lucide آیکون‌های برند را حذف کرده (نسخه‌ی ۱: `Instagram` و بقیه دیگر export
 * نمی‌شوند) چون لوگوی شرکت‌ها مالکیت فکری دارند و در یک کتابخانه‌ی آیکونِ عمومی
 * جایشان نیست. نصبِ یک پکیج دومِ آیکون برای دو گلیف، هزینه‌ی بی‌دلیلی است.
 *
 * پس همان دو تا را اینجا می‌کشیم، با **همان قرارداد lucide**: کادر ۲۴×۲۴،
 * `stroke="currentColor"`، ضخامت ۲، انتهای گرد. یعنی کنار بقیه‌ی آیکون‌ها
 * یکدست دیده می‌شوند و رنگشان از متنِ والد می‌آید.
 */

interface IconProps {
  size?: number
  className?: string
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
})

export function InstagramIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect width="16" height="16" x="4" y="4" rx="4.5" />
      <circle cx="12" cy="12" r="3.6" />
      <circle cx="16.9" cy="7.1" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function TelegramIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20.8 4.3 3.6 10.9c-.7.3-.7 1.2 0 1.4l3.9 1.3 1.5 4.6c.2.6 1 .8 1.4.3l2.1-2.3 4 3c.6.4 1.4.1 1.6-.6l3.3-13.2c.2-.8-.6-1.4-1.3-1.1Z" />
      <path d="m7.5 13.6 10-6.6-6.1 7.2" />
    </svg>
  )
}

export function WhatsappIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20.5 11.6a8.4 8.4 0 0 1-12.4 7.4L3.5 20.5l1.5-4.6a8.4 8.4 0 1 1 15.5-4.3Z" />
      <path d="M8.9 9c0 3 2.1 5.1 5.1 5.1l1-1.3 1.7.8c-.3 1-1.2 1.4-2.2 1.3-2.9-.3-5.2-2.6-5.5-5.5-.1-1 .3-1.9 1.3-2.2l.8 1.7z" />
    </svg>
  )
}
