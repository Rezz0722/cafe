import 'server-only'

/**
 * وضعیتِ نقشه‌ی **منتشرشده** — جای `isMapReady()` قدیمی.
 *
 * ═══ چه چیزی عوض شد ═══
 *
 * `isMapReady()` قبلی وجودِ `src/data/map/meta.json` را چک می‌کرد، یعنی وجودِ
 * *منبعِ خام*. ولی چیزی که مرورگر می‌خواند `public/map/*.geojson` است که
 * `scripts/map-publish.mjs` می‌سازد. اگر منبع بود و انتشار انجام نشده بود،
 * پنل ادمین «نقشه سالم است» می‌گفت و کاربر نقشه‌ی خالی می‌دید — دقیقاً همان
 * سکوتی که نباید باشد.
 *
 * حالا مانیفستِ انتشار سنجیده می‌شود: همان چیزی که کلاینت مصرف می‌کند.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MANIFEST_PATH = resolve(process.cwd(), 'public', 'map', 'manifest.json')

export interface PublishedLayer {
  features: number
  bytes: number
  gzip: number
  /** فقط با زوم بارگذاری می‌شود (ساختمان‌ها). */
  lazy: boolean
}

export interface PublishedMap {
  layers: Record<string, PublishedLayer>
  precision: number
  /** مجموع حجمِ gzip لایه‌هایی که در بارِ اول می‌آیند. */
  eagerGzip: number
  lazyGzip: number
  totalFeatures: number
}

/**
 * کشِ فرآیندی.
 *
 * فایل فقط با اجرای `map:publish` عوض می‌شود، پس خواندنِ دوباره در هر
 * درخواست بی‌فایده است. روی `globalThis` می‌نشیند تا در dev که ماژول‌ها
 * hot-reload می‌شوند، کش نپرد.
 */
const cache = globalThis as unknown as { __kucafePublishedMap?: PublishedMap | null }

export function getPublishedMap(): PublishedMap | null {
  if (cache.__kucafePublishedMap !== undefined) return cache.__kucafePublishedMap

  if (!existsSync(MANIFEST_PATH)) {
    cache.__kucafePublishedMap = null
    return null
  }

  try {
    const raw = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
      layers: Record<string, PublishedLayer>
      precision: number
    }
    const entries = Object.values(raw.layers ?? {})
    const value: PublishedMap = {
      layers: raw.layers ?? {},
      precision: raw.precision ?? 5,
      eagerGzip: entries.filter((l) => !l.lazy).reduce((sum, l) => sum + l.gzip, 0),
      lazyGzip: entries.filter((l) => l.lazy).reduce((sum, l) => sum + l.gzip, 0),
      totalFeatures: entries.reduce((sum, l) => sum + l.features, 0),
    }
    cache.__kucafePublishedMap = value
    return value
  } catch {
    // مانیفستِ خراب = منتشرنشده. خطا پرت‌کردن اینجا کل صفحه را می‌خواباند.
    cache.__kucafePublishedMap = null
    return null
  }
}

/** آیا نقشه منتشر شده؟ برای نمایش وضعیت در پنل ادمین و گاردِ استایل. */
export function isMapPublished(): boolean {
  return getPublishedMap() !== null
}

/** بعد از اجرای `map:publish` در همان فرآیند — عمدتاً برای تست. */
export function invalidatePublishedMap(): void {
  delete cache.__kucafePublishedMap
}
