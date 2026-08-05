/**
 * مسیر و شناسه‌ی فایل‌های رسانه‌ی لوکال.
 *
 * ═══ چرا تصاویر لوکال می‌شوند ═══
 *
 * فایل منبع ۱۴٬۵۵۸ آدرس روی `cdn.topmenumarket.com` دارد. تکیه بر آن CDN سه
 * مشکل قطعی دارد: روزی که آن سرویس آدرس‌هایش را عوض کند کل منوی سایت بی‌عکس
 * می‌شود، سرعت بارگذاری به سرور شخص ثالث گره می‌خورد، و هر بازدید کاربر ما
 * یک رکورد در لاگ آن‌ها می‌سازد. پس همه لوکال می‌شوند.
 *
 * ═══ ساخت مسیر ═══
 *
 *   public/media/<kind>/<ab>/<sha1-of-url>.<ext>
 *
 * دو کاراکتر اول hash به‌عنوان پوشه‌ی میانی می‌آید (sharding). بدون آن، ۱۱هزار
 * فایل در یک پوشه می‌ریزد؛ روی NTFS این هنوز کار می‌کند ولی هر `readdir` و
 * هر backup کند می‌شود و ابزارهای گرافیکی عملاً باز نمی‌شوند.
 *
 * نام فایل از **hash آدرس** می‌آید نه از نام اصلی: نام‌های CDN تضمین یکتایی
 * ندارند و بعضی‌شان کاراکتر غیرمجاز ویندوز دارند.
 */

import { createHash } from 'node:crypto'

export const MEDIA_ROOT = 'public/media'

export type MediaKind = 'logo' | 'menu_item' | 'menu_section' | 'place_photo' | 'avatar' | 'upload'

/** پوشه‌ی هر نوع — کوتاه، چون در مسیر ۱۴هزار فایل تکرار می‌شود. */
const KIND_DIR: Record<MediaKind, string> = {
  logo: 'logo',
  menu_item: 'item',
  menu_section: 'section',
  place_photo: 'photo',
  avatar: 'avatar',
  upload: 'upload',
}

/** شناسه‌ی یکتای آدرس — کلید جدول `media`. */
export function hashUrl(url: string): string {
  return createHash('sha1').update(url.trim()).digest('hex')
}

export function hashContent(bytes: Buffer | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** پسوند مجاز. هر چیز دیگری به `bin` می‌افتد تا مسیر قابل حدس بماند. */
const ALLOWED_EXT = new Set(['webp', 'jpg', 'jpeg', 'png', 'gif', 'avif', 'svg'])

export function extFromUrl(url: string, fallback = 'jpg'): string {
  try {
    const path = new URL(url).pathname
    const raw = path.split('.').pop()?.toLowerCase() ?? ''
    if (ALLOWED_EXT.has(raw)) return raw === 'jpeg' ? 'jpg' : raw
  } catch {
    // آدرس نامعتبر — پسوند پیش‌فرض
  }
  return fallback
}

export function extFromContentType(contentType: string | null): string | null {
  if (!contentType) return null
  const type = contentType.split(';')[0]!.trim().toLowerCase()
  const map: Record<string, string> = {
    'image/webp': 'webp',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/avif': 'avif',
    'image/svg+xml': 'svg',
  }
  return map[type] ?? null
}

/** مسیر نسبی زیر `public/` — همان چیزی که در `media.local_path` می‌نشیند. */
export function mediaRelativePath(kind: MediaKind, urlHash: string, ext = 'webp'): string {
  return `media/${KIND_DIR[kind]}/${urlHash.slice(0, 2)}/${urlHash}.${ext}`
}

/**
 * مسیر نسخه‌ی بزرگ، از روی مسیر نسخه‌ی کارت.
 *
 * دو نسخه با **قرارداد نام‌گذاری** به هم وصل می‌شوند نه با ستون دوم در
 * دیتابیس: `x.webp` نسخه‌ی کارت و `x.full.webp` نسخه‌ی بزرگ. یک ستون کمتر،
 * و هیچ حالتی وجود ندارد که یکی از دو مسیر ثبت شده باشد و دیگری نه.
 */
export function mediaFullPath(localPath: string): string {
  return localPath.replace(/\.([a-z0-9]+)$/i, '.full.$1')
}

/** آدرسی که در `src` تگ تصویر می‌رود. */
export function mediaPublicUrl(localPath: string | null | undefined): string | null {
  if (!localPath) return null
  return `/${localPath.replace(/^\/+/, '')}`
}

/** آدرس نسخه‌ی بزرگ برای lightbox. */
export function mediaFullUrl(localPath: string | null | undefined): string | null {
  if (!localPath) return null
  return `/${mediaFullPath(localPath).replace(/^\/+/, '')}`
}

// ── خواندن ابعاد از هدر فایل ─────────────────────────────────────────

export interface ImageSize {
  width: number
  height: number
  format: string
}

/**
 * ابعاد تصویر را از چند بایت اول فایل می‌خواند.
 *
 * ═══ چرا دستی و نه با کتابخانه ═══
 *
 * `sharp` وابستگی بومی (native) است: چند صد مگابایت باینری per-platform و
 * روی ویندوز سرور بدون ابزار build نصبش شکننده است. ما به تغییر اندازه یا
 * تبدیل فرمت نیازی نداریم — تصاویر منبع از قبل thumbnail هستند. تنها چیزی
 * که لازم داریم `width`/`height` است تا در تگ `img` بنویسیم.
 *
 * ═══ چرا width/height لازم است ═══
 *
 * بدون آن‌ها مرورگر ارتفاع تصویر را قبل از دانلود نمی‌داند و صفحه‌ی منو با
 * هر تصویری که می‌رسد می‌پرد (layout shift). در صفحه‌ای با ۲۸۷ آیتم منو،
 * این «پریدن» صفحه را غیرقابل استفاده می‌کند.
 *
 * سه فرمتِ موجود در داده پوشش داده شده: webp (۶٬۱۲۳)، jpeg (۲٬۴۴۶)،
 * png (۲٬۴۴۲). برای فرمت ناشناس `null` برمی‌گردد و اپ به aspect-ratio
 * پیش‌فرض CSS تکیه می‌کند.
 */
export function readImageSize(buf: Buffer): ImageSize | null {
  if (buf.length < 16) return null

  // ── PNG: امضا ۸ بایت، بعد چانک IHDR با عرض/ارتفاع big-endian
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf.length >= 24
  ) {
    return {
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
      format: 'png',
    }
  }

  // ── GIF: "GIF87a"/"GIF89a" بعد عرض/ارتفاع little-endian
  if (buf.toString('ascii', 0, 3) === 'GIF' && buf.length >= 10) {
    return {
      width: buf.readUInt16LE(6),
      height: buf.readUInt16LE(8),
      format: 'gif',
    }
  }

  // ── WebP: RIFF....WEBP، سه نوع chunk با چیدمان متفاوت
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16)

    // VP8L (lossless): ۱۴ بیت عرض و ۱۴ بیت ارتفاع، منهای یک، بیت‌پکد
    if (chunk === 'VP8L' && buf.length >= 25) {
      const bits = buf.readUInt32LE(21)
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
        format: 'webp',
      }
    }

    // VP8X (extended): عرض و ارتفاع ۲۴ بیتی منهای یک
    if (chunk === 'VP8X' && buf.length >= 30) {
      const width = 1 + (buf[24]! | (buf[25]! << 8) | (buf[26]! << 16))
      const height = 1 + (buf[27]! | (buf[28]! << 8) | (buf[29]! << 16))
      return { width, height, format: 'webp' }
    }

    // VP8 (lossy): بعد از start-code سه‌بایتی، دو عدد ۱۴ بیتی
    if (chunk === 'VP8 ' && buf.length >= 30) {
      return {
        width: buf.readUInt16LE(26) & 0x3fff,
        height: buf.readUInt16LE(28) & 0x3fff,
        format: 'webp',
      }
    }
    return null
  }

  // ── JPEG: پیمایش نشانگرها تا SOFn
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset++ // بایت پرکننده — جلو برو
        continue
      }
      const marker = buf[offset + 1]!
      // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15 — نه DHT/DAC/RST
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      if (isSof) {
        return {
          height: buf.readUInt16BE(offset + 5),
          width: buf.readUInt16BE(offset + 7),
          format: 'jpg',
        }
      }
      // نشانگرهای بی‌طول
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2
        continue
      }
      const segmentLength = buf.readUInt16BE(offset + 2)
      if (segmentLength < 2) return null // طولِ خراب — حلقه‌ی بی‌پایان نشود
      offset += 2 + segmentLength
    }
    return null
  }

  return null
}
