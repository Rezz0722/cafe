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
 *
 * ═══ دو موتور، و چرا ═══
 *
 * `sharp` سریع‌ترین است و روی ماشین توسعه استفاده می‌شود. ولی روی سرور تولید
 * **اصلاً بار نمی‌شود**:
 *
 *     Unsupported CPU: Prebuilt binaries for Linux x64 require v2 microarchitecture
 *
 * آن سرور یک `QEMU Virtual CPU version 2.5+` است بدون SSE4.2، POPCNT، SSSE3 و
 * AVX — یعنی x86-64 پایه، قبل از x86-64-v2. باینری‌های آماده‌ی sharp روی چنین
 * CPUای فیزیکاً اجرا نمی‌شوند، و ساخت از منبع هم ممکن نبود: sharp ۰٫۳۵
 * `libvips >= 8.18.3` می‌خواهد و اوبونتو ۲۲.۰۴ فقط ۸٫۱۲٫۱ دارد.
 *
 * پس موتور دوم: **ImageMagick از طریق CLI**. کندتر است (چند برابر) ولی روی هر
 * CPUای کار می‌کند و در مخزن هر توزیعی هست. برای یک خط لوله‌ی یک‌باره‌ی
 * ۱۴هزار تصویر، کندیِ چندبرابر قابل قبول است؛ نبودِ تصویر نه.
 *
 * انتخاب موتور **در زمان اجرا** انجام می‌شود، نه با متغیر محیطی: هر ماشین
 * خودش بهترین چیزی که دارد را استفاده می‌کند و کسی لازم نیست چیزی تنظیم کند.
 */

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

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

const CARD_QUALITY = 78
const FULL_QUALITY = 82
export const MAX_SOURCE_DIMENSION = 12_000
export const MAX_SOURCE_PIXELS = 40_000_000

export function sourceDimensionsAllowed(width: number, height: number): boolean {
  return width > 0 && height > 0 &&
    width <= MAX_SOURCE_DIMENSION && height <= MAX_SOURCE_DIMENSION &&
    width * height <= MAX_SOURCE_PIXELS
}

// ═══════════════════════════════════════════════════════════════════════
// انتخاب موتور
// ═══════════════════════════════════════════════════════════════════════

type Engine = 'sharp' | 'imagemagick' | 'none'

interface SharpModule {
  default: (input: Buffer, options?: unknown) => SharpInstance
}
interface SharpInstance {
  metadata: () => Promise<{ width?: number; height?: number; format?: string }>
  rotate: () => SharpInstance
  resize: (options: unknown) => SharpInstance
  webp: (options: unknown) => SharpInstance
  toBuffer: (options: {
    resolveWithObject: true
  }) => Promise<{ data: Buffer; info: { width: number; height: number } }>
}

let engine: Engine | null = null
let sharpModule: SharpModule['default'] | null = null

/**
 * یک‌بار تشخیص می‌دهد کدام موتور در دسترس است.
 *
 * `sharp` با `import()` داینامیک بار می‌شود چون روی CPUهای قدیمی **در لحظه‌ی
 * import** می‌ترکد، نه در استفاده. با import ثابت، همین ماژول کل اسکریپت را
 * می‌خواباند.
 */
async function detectEngine(): Promise<Engine> {
  if (engine) return engine

  try {
    const mod = (await import('sharp')) as unknown as SharpModule
    // یک عملیات واقعیِ کوچک: بارشدنِ ماژول تضمین نمی‌کند باینری کار کند.
    const probe = mod.default(
      Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64',
      ),
      { failOn: 'none' },
    )
    await probe.metadata()
    sharpModule = mod.default
    engine = 'sharp'
    return engine
  } catch {
    // به ImageMagick می‌رویم — پیامش را صدازننده چاپ می‌کند.
  }

  try {
    await run('convert', ['--version'])
    engine = 'imagemagick'
    return engine
  } catch {
    engine = 'none'
    return engine
  }
}

/** برای چاپ در اسکریپت‌ها: با چه موتوری کار می‌کنیم. */
export async function imageEngineName(): Promise<Engine> {
  return detectEngine()
}

// ═══════════════════════════════════════════════════════════════════════
// موتور sharp
// ═══════════════════════════════════════════════════════════════════════

async function deriveWithSharp(input: Buffer): Promise<DerivedImage | null> {
  const sharp = sharpModule!
  const inputOptions = { failOn: 'error', limitInputPixels: MAX_SOURCE_PIXELS }
  const meta = await sharp(input, inputOptions).metadata()
  if (!meta.width || !meta.height) return null
  if (!sourceDimensionsAllowed(meta.width, meta.height)) return null

  const [card, full] = await Promise.all([
    sharp(input, inputOptions)
      .rotate() // اعمال EXIF orientation — بدون این، عکس‌های موبایل چرخیده می‌مانند
      .resize({ width: CARD_WIDTH, withoutEnlargement: true })
      .webp({ quality: CARD_QUALITY, effort: 4 })
      .toBuffer({ resolveWithObject: true }),
    sharp(input, inputOptions)
      .rotate()
      .resize({ width: FULL_WIDTH, withoutEnlargement: true })
      .webp({ quality: FULL_QUALITY, effort: 4 })
      .toBuffer({ resolveWithObject: true }),
  ])

  return {
    card: { buffer: card.data, width: card.info.width, height: card.info.height },
    full: { buffer: full.data, width: full.info.width, height: full.info.height },
    source: { width: meta.width, height: meta.height, format: meta.format ?? 'unknown' },
  }
}

// ═══════════════════════════════════════════════════════════════════════
// موتور ImageMagick
// ═══════════════════════════════════════════════════════════════════════

/** `identify` روی فایل چندفریمی چند خط می‌دهد؛ فقط فریم اول مهم است. */
async function identify(path: string): Promise<{ width: number; height: number; format: string }> {
  const { stdout } = await run('identify', ['-format', '%w %h %m\n', path])
  const [line] = stdout.trim().split('\n')
  const [w, h, format] = (line ?? '').trim().split(/\s+/)
  return { width: Number(w) || 0, height: Number(h) || 0, format: (format ?? 'unknown').toLowerCase() }
}

async function deriveWithImageMagick(input: Buffer): Promise<DerivedImage | null> {
  const dir = await mkdtemp(join(tmpdir(), 'kucafe-img-'))
  try {
    const src = join(dir, 'src')
    await writeFile(src, input)

    const meta = await identify(src)
    if (!meta.width || !meta.height) return null
    if (!sourceDimensionsAllowed(meta.width, meta.height)) return null

    const variants = [
      { name: 'card', width: CARD_WIDTH, quality: CARD_QUALITY },
      { name: 'full', width: FULL_WIDTH, quality: FULL_QUALITY },
    ] as const

    const out: Record<string, { buffer: Buffer; width: number; height: number }> = {}
    for (const variant of variants) {
      const dest = join(dir, `${variant.name}.webp`)
      /*
        `WIDTHx>` یعنی «فقط اگر بزرگ‌تر است کوچک کن» — معادلِ دقیقِ
        `withoutEnlargement` در sharp. بدون `>`، تصویرِ کوچک بزرگ‌نمایی
        می‌شود و فقط حجم اضافه می‌کند.

        `[0]` فریم اول را می‌گیرد: GIF متحرک و PNG چندلایه وگرنه چند فایل
        خروجی می‌سازند و `readFile` روی نامِ ساده شکست می‌خورد.
      */
      await run(
        'convert',
        [
          `${src}[0]`,
          '-auto-orient',
          '-resize',
          `${variant.width}x>`,
          '-strip',
          '-quality',
          String(variant.quality),
          `webp:${dest}`,
        ],
        { maxBuffer: 64 * 1024 * 1024 },
      )
      const buffer = await readFile(dest)
      const dims = await identify(dest)
      out[variant.name] = { buffer, width: dims.width, height: dims.height }
    }

    return {
      card: out.card!,
      full: out.full!,
      source: { width: meta.width, height: meta.height, format: meta.format },
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

// ═══════════════════════════════════════════════════════════════════════

/**
 * دو نسخه‌ی بهینه می‌سازد. اگر تصویر از اندازه‌ی هدف کوچک‌تر باشد بزرگ‌نمایی
 * نمی‌شود — بزرگ‌کردن فقط حجم را زیاد می‌کند بدون اینکه کیفیت اضافه کند.
 *
 * `null` برمی‌گرداند اگر فایل قابل decode نباشد؛ صدازننده باید آن را
 * به‌عنوان شکستِ همان تصویر ثبت کند، نه خطای کل فرآیند.
 */
export async function deriveImage(input: Buffer): Promise<DerivedImage | null> {
  try {
    const which = await detectEngine()
    if (which === 'sharp') return await deriveWithSharp(input)
    if (which === 'imagemagick') return await deriveWithImageMagick(input)
    return null
  } catch {
    return null
  }
}
