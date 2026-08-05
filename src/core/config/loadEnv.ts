/**
 * بارگذاری `.env.local` وقتی Next.js وجود ندارد.
 *
 * ═══ چرا لازم است ═══
 *
 * Next.js خودش `.env.local` را قبل از هر کدی بار می‌کند، ولی اسکریپت‌های CLI
 * (ایمپورت، ساخت کاربر، تست‌ها) با `tsx` مستقیم اجرا می‌شوند و کسی این کار
 * را برایشان نمی‌کند.
 *
 * نتیجه‌ی نبودش یک باگ خیلی بی‌صدا بود: `SESSION_SECRET` در اسکریپت خالی
 * می‌ماند، پس توکن نشستی که اسکریپت می‌ساخت **با کلید خالی امضا می‌شد** و
 * سرور Next آن را رد می‌کرد — بدون هیچ خطایی، فقط «وارد نشده‌اید».
 *
 * این ماژول باید **قبل از خواندن هر متغیر محیطی** اجرا شود، پس در بالای
 * `env.ts` و `db/connection.ts` صدا زده می‌شود.
 */

import { existsSync } from 'node:fs'

let loaded = false

export function ensureEnvLoaded(): void {
  if (loaded) return
  loaded = true

  // در محیط Next.js (که خودش env را بار کرده) این تابع بی‌اثر است.
  if (process.env.NEXT_RUNTIME) return

  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue
    try {
      process.loadEnvFile(file)
    } catch {
      // فایل خراب نباید اسکریپت را با خطای مبهم بکشد؛ متغیرِ خالی
      // پیام واضح خودش را در `checkConfig` می‌دهد.
    }
  }
}
