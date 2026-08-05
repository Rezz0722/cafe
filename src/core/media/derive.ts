/**
 * ساخت نسخه‌های بهینه‌ی تصویر.
 *
 * ═══ چرا اصلاً لازم است ═══
 *
 * تصاویر منبع «thumbnail» نام دارند ولی نیستند: میانگین PNGها **۱٫۲ مگابایت**
 * در ابعاد ۱۰۰۰×۱۰۰۰ است. یک صفحه‌ی منو با ۶۰ آیتم یعنی ۷۰ مگابایت دانلود —
 * روی اینترنت موبایل ایران عملاً باز نمی‌شود. کل مجموعه هم حدود ۴٫۷ گیگابایت
 * می‌شد.
 *
 * دو اندازه تولید می‌شود، هر دو WebP:
 *
 *   card   ۴۰۰px  — شبکه‌ی منو و کارت‌ها (اندازه‌ی واقعیِ نمایش)
 *   full   ۱۰۰۰px — نمای بزرگ‌شده وقتی کاربر روی تصویر می‌زند
 *
 * ═══ چرا اصلِ فایل نگه داشته نمی‌شود ═══
 *
 * چون هیچ‌جای سایت به آن نیاز ندارد و ۴٫۷ گیگابایت فایلِ بی‌استفاده، backup و
 * جابه‌جایی پروژه را سخت می‌کند. آدرس منبع در `media.source_url` می‌ماند، پس
 * اگر روزی نسخه‌ی اصل لازم شد دوباره قابل دانلود است.
 *
 * ═══ چرا WebP و نه AVIF ═══
 *
 * AVIF حدود ۲۰٪ کوچک‌تر است ولی زمان encode آن روی ۱۴هزار تصویر چند ساعت
 * می‌شود. WebP در همه‌ی مرورگرهای امروزی پشتیبانی می‌شود و منبع هم اکثراً
 * از قبل WebP است.
 */

import sharp from 'sharp'

export interface DerivedImage {
  /** نسخه‌ی کارت — همان چیزی که در شبکه‌ی منو نشان داده می‌شود. */
  card: { buffer: Buffer; width: number; height: number }
  /** نسخه‌ی بزرگ — برای lightbox. */
  full: { buffer: Buffer; width: number; height: number }
  /** ابعاد اصلِ فایل، برای ثبت در دیتابیس. */
  source: { width: number; height: number; format: string }
}

export const CARD_WIDTH = 400
export const FULL_WIDTH = 1000

/**
 * دو نسخه‌ی بهینه می‌سازد. اگر تصویر از اندازه‌ی هدف کوچک‌تر باشد بزرگ‌نمایی
 * نمی‌شود (`withoutEnlargement`) — بزرگ‌کردن فقط حجم را زیاد می‌کند بدون
 * اینکه کیفیت اضافه کند.
 *
 * `null` برمی‌گرداند اگر فایل قابل decode نباشد؛ صدازننده باید آن را
 * به‌عنوان شکستِ همان تصویر ثبت کند، نه خطای کل فرآیند.
 */
export async function deriveImage(input: Buffer): Promise<DerivedImage | null> {
  try {
    const image = sharp(input, { failOn: 'none' })
    const meta = await image.metadata()
    if (!meta.width || !meta.height) return null

    const [card, full] = await Promise.all([
      sharp(input, { failOn: 'none' })
        .rotate() // اعمال EXIF orientation — بدون این، عکس‌های موبایل چرخیده می‌مانند
        .resize({ width: CARD_WIDTH, withoutEnlargement: true })
        .webp({ quality: 78, effort: 4 })
        .toBuffer({ resolveWithObject: true }),
      sharp(input, { failOn: 'none' })
        .rotate()
        .resize({ width: FULL_WIDTH, withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toBuffer({ resolveWithObject: true }),
    ])

    return {
      card: { buffer: card.data, width: card.info.width, height: card.info.height },
      full: { buffer: full.data, width: full.info.width, height: full.info.height },
      source: { width: meta.width, height: meta.height, format: meta.format ?? 'unknown' },
    }
  } catch {
    return null
  }
}
