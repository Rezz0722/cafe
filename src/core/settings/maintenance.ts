import 'server-only'

/**
 * دروازه‌ی «حالت تعمیر».
 *
 * ═══ چرا middleware نیست ═══
 *
 * middleware در Next روی edge runtime اجرا می‌شود و `mysql2` آنجا کار نمی‌کند،
 * پس خواندن تنظیمات از دیتابیس در middleware ممکن نیست. راه‌های دورزدنش
 * (کوکی، فایل، متغیر محیطی) یعنی یک منبعِ دومِ حقیقت که با جدول `setting` از
 * هم می‌افتد.
 *
 * ═══ پس کجا اعمال می‌شود ═══
 *
 * صفحه‌های **عمومی** (خانه، جست‌وجو، کافه، محله) این تابع را صدا می‌زنند.
 * `/auth`، `/admin`، `/profile` و پنل کافه صدا نمی‌زنند — عمداً: اگر حالت
 * تعمیر پنل‌ها را هم ببندد، مدیری که آن را روشن کرده راهی برای خاموش‌کردنش
 * ندارد. این دقیقاً همان تله‌ای است که تنظیمِ خودقفل‌کننده می‌سازد.
 */

import { getCurrentUser } from '@/core/auth/currentUser'
import { getSettings } from './store'

export interface MaintenanceState {
  /** سایت برای این بازدیدکننده بسته است؟ */
  closed: boolean
  /** متنی که به بازدیدکننده نشان داده می‌شود. */
  message: string
  siteName: string
  /** مدیر است و محتوا را می‌بیند، ولی باید بداند سایت برای بقیه بسته است. */
  adminBypass: boolean
}

export async function maintenanceState(): Promise<MaintenanceState> {
  const settings = await getSettings()
  if (!settings.maintenanceMode) {
    return { closed: false, message: '', siteName: settings.siteName, adminBypass: false }
  }

  const user = await getCurrentUser()
  const isAdmin = user?.role === 'admin'

  return {
    closed: !isAdmin,
    message:
      settings.announcement.trim() ||
      'سایت موقتاً برای به‌روزرسانی بسته است. کمی بعد دوباره سر بزنید.',
    siteName: settings.siteName,
    adminBypass: isAdmin,
  }
}
