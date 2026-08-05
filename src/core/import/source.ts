/**
 * خواندن و تایپ‌کردن فایل منبع `all-cafe-data/cafes_full_latest.json`.
 *
 * کلیدهای فایل منبع **فارسی** هستند («نام مجموعه»، «قیمت (تومان)»). این تنها
 * فایلی در پروژه است که آن کلیدها را می‌شناسد؛ بقیه‌ی کد با مدل دامنه‌ی
 * انگلیسی کار می‌کند. اگر فردا منبع عوض شد، فقط همین فایل تغییر می‌کند.
 *
 * هیچ نرمال‌سازی‌ای اینجا انجام نمی‌شود — این لایه فقط «خواندن با تایپ» است.
 * نرمال‌سازی (ساعت، قیمت، تلفن) در `normalize.ts` است تا جداگانه قابل تست
 * باشد.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const SOURCE_PATH = 'all-cafe-data/cafes_full_latest.json'

// ── شکل خام ──────────────────────────────────────────────────────────

/**
 * توضیحات آیتم در منبع دو شکل دارد: رشته‌ی خالی، یا آبجکتی با کلید
 * `description`. هر دو باید پذیرفته شوند.
 */
export type RawItemDescription = { description?: string | null } | string | null

export interface RawMenuItem {
  'نام'?: string | null
  'نام انگلیسی'?: string | null
  'توضیحات'?: RawItemDescription
  'قیمت (تومان)'?: number | null
  'موجود است'?: boolean | null
  'ویژه است'?: boolean | null
  'تصویر'?: string | null
  'شناسه'?: number | null
}

export interface RawMenuSection {
  'دسته‌بندی'?: string | null
  'توضیحات'?: string | null
  'تصویر'?: string | null
  'آیتم‌ها'?: RawMenuItem[] | null
}

export interface RawCafe {
  'شناسه': number
  'نام مجموعه': string
  'نام انگلیسی'?: string | null
  'یوزرنیم'?: string | null
  'لینک منو'?: string | null
  'شماره تماس‌ها'?: string | null
  'اینستاگرام'?: string | null
  'سایر شبکه‌های اجتماعی'?: string | null
  'آدرس متنی'?: string | null
  'عرض جغرافیایی (lat)'?: number | null
  'طول جغرافیایی (lng)'?: number | null
  'ساعات کاری'?: string | null
  'درباره'?: string | null
  'لوگو'?: string | null
  'منو'?: RawMenuSection[] | null
}

// ── خواندن ───────────────────────────────────────────────────────────

let cached: RawCafe[] | null = null

/**
 * فایل ۲۱ مگابایتی را یک‌بار می‌خواند و کش می‌کند.
 *
 * کش لازم است چون چند اسکریپت (ایمپورت، دانلود تصویر، تحلیل) در یک فرآیند
 * ممکن است چندبار صدایش بزنند و هر بار parse کردن ۲۱ مگابایت JSON چند صد
 * میلی‌ثانیه است.
 */
export function readSourceCafes(sourcePath = SOURCE_PATH): RawCafe[] {
  if (cached) return cached
  const full = resolve(process.cwd(), sourcePath)
  const raw = readFileSync(full, 'utf8')
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    throw new Error(`فایل منبع آرایه نیست: ${sourcePath}`)
  }
  cached = parsed as RawCafe[]
  return cached
}

/** توضیحات آیتم را از دو شکل ممکن بیرون می‌کشد. */
export function rawItemDescription(value: RawItemDescription): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value.description ?? ''
}

// ── استخراج تصاویر ───────────────────────────────────────────────────

export type MediaKind = 'logo' | 'menu_item' | 'menu_section'

export interface SourceImage {
  url: string
  kind: MediaKind
}

/**
 * همه‌ی آدرس‌های تصویرِ **یکتا** در منبع، با نوعشان.
 *
 * یکتاسازی روی URL انجام می‌شود نه روی (URL، نوع): یک تصویر ممکن است هم
 * لوگو باشد هم تصویر دسته، و دو بار دانلودش تلف کردن پهنای باند است. اولین
 * نوعی که دیده شود می‌ماند — نوع فقط برای مسیر پوشه است، نه معنای داده.
 */
export function extractSourceImages(cafes = readSourceCafes()): SourceImage[] {
  const seen = new Map<string, MediaKind>()

  const add = (url: string | null | undefined, kind: MediaKind) => {
    const trimmed = url?.trim()
    if (!trimmed || !/^https?:\/\//i.test(trimmed)) return
    if (!seen.has(trimmed)) seen.set(trimmed, kind)
  }

  for (const cafe of cafes) {
    add(cafe['لوگو'], 'logo')
    for (const section of cafe['منو'] ?? []) {
      add(section['تصویر'], 'menu_section')
      for (const item of section['آیتم‌ها'] ?? []) {
        add(item['تصویر'], 'menu_item')
      }
    }
  }

  return [...seen].map(([url, kind]) => ({ url, kind }))
}
