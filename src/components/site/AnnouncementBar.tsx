import styles from './AnnouncementBar.module.css'

/**
 * نوار اعلان بالای سایت — متنش از تنظیمات پنل ادمین می‌آید.
 *
 * ═══ چرا متن ساده و بدون HTML ═══
 *
 * وسوسه‌ی «بگذار ادمین HTML بنویسد تا لینک هم بتواند بگذارد» یعنی
 * `dangerouslySetInnerHTML` روی متنی که از فرم آمده — یک XSS آماده که با هر
 * حساب ادمینِ لو‌رفته قابل بهره‌برداری است. متنِ ساده کافی است.
 */
export function AnnouncementBar({ text }: { text: string }) {
  const trimmed = text.trim()
  if (!trimmed) return null
  return (
    <div className={styles.bar} role="status">
      {trimmed}
    </div>
  )
}

export default AnnouncementBar
