/**
 * نرمال‌سازی متن فارسی.
 *
 * بدون این لایه، هم dedupe و هم جست‌وجو خراب می‌شوند: «کافه‌گرد» و «کافه گرد» و
 * «كافه‌گرد» (با کافِ عربی) سه رشته‌ی متفاوت‌اند ولی یک چیزند. این ماژول هم موقع
 * ایندکس و هم موقع query اجرا می‌شود — اگر فقط یکی از دو طرف نرمال شود،
 * تطابق‌ها بی‌صدا از دست می‌روند.
 */

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'

/** نویسه‌های عربی که باید به معادل فارسی تبدیل شوند. */
const CHAR_MAP: Record<string, string> = {
  'ك': 'ک', // ك عربی → ک فارسی
  'ي': 'ی', // ي عربی → ی فارسی
  'ى': 'ی', // ى (الف مقصوره) → ی
  'ة': 'ه', // ة → ه
  'أ': 'ا', // أ → ا
  'إ': 'ا', // إ → ا
  'آ': 'ا', // آ → ا  (فقط در حالت جست‌وجو، نه در نمایش)
  'ؤ': 'و', // ؤ → و
  'ئ': 'ی', // ئ → ی
}

/** اعراب و علائم کشیدگی که در جست‌وجو باید نادیده گرفته شوند. */
const DIACRITICS = /[ً-ْٰـ]/g

/** نیم‌فاصله و انواع فاصله‌ی غیرمعمول. */
const ZWNJ = /‌/g
const ODD_SPACES = /[  -​  　]/g

/** پیشوند/پسوندهای عمومی که برای تشخیص تکراری بی‌ارزش‌اند. */
const GENERIC_WORDS = [
  'کافه رستوران',
  'کافی شاپ',
  'کافیشاپ',
  'کافه',
  'کافی',
  'رستوران',
  'سفره خانه',
  'سفرهخانه',
  'چایخانه',
  'قهوه خانه',
  'شعبه',
]

/** ارقام فارسی و عربی را به ASCII تبدیل می‌کند. */
export function toAsciiDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (d) => {
    const fa = FA_DIGITS.indexOf(d)
    if (fa > -1) return String(fa)
    const ar = AR_DIGITS.indexOf(d)
    return ar > -1 ? String(ar) : d
  })
}

/**
 * نرمال‌سازی پایه برای *جست‌وجو*: یکدست‌سازی نویسه‌ها، حذف اعراب، تبدیل
 * نیم‌فاصله به فاصله، و فشرده‌کردن فاصله‌ها.
 *
 * خروجی این تابع برای نمایش مناسب نیست — «آ» به «ا» تبدیل می‌شود که در متن
 * دیده‌شدنی زشت است. فقط برای تطابق استفاده کنید.
 */
export function normalizeFa(input: string): string {
  if (!input) return ''

  let out = input.normalize('NFKC')

  out = out.replace(/[كيىةأإآؤئ]/g, (c) => CHAR_MAP[c] ?? c)
  out = out.replace(DIACRITICS, '')
  out = out.replace(ZWNJ, ' ')
  out = out.replace(ODD_SPACES, ' ')
  out = toAsciiDigits(out)
  out = out.toLowerCase()
  out = out.replace(/[^\p{L}\p{N}\s]/gu, ' ')
  out = out.replace(/\s+/g, ' ').trim()

  return out
}

/**
 * نرمال‌سازی نام کسب‌وکار برای تشخیص تکراری: علاوه بر نرمال‌سازی پایه،
 * واژه‌های عمومی («کافه»، «رستوران»، …) را حذف می‌کند تا «کافه رُف» و «رُف»
 * یکی شمرده شوند.
 *
 * اگر حذف واژه‌های عمومی چیزی باقی نگذارد (مثلاً نامِ کسب‌وکار خودش «کافه»
 * باشد) نتیجه‌ی نرمال‌شده‌ی کامل برگردانده می‌شود، نه رشته‌ی خالی.
 */
export function normalizePlaceName(input: string): string {
  const base = normalizeFa(input)
  if (!base) return ''

  let out = base
  for (const word of GENERIC_WORDS) {
    out = out.replace(new RegExp(`(^|\\s)${normalizeFa(word)}(\\s|$)`, 'g'), ' ')
  }
  out = out.replace(/\s+/g, ' ').trim()

  return out || base
}

/**
 * تولید slug پایدار برای URL.
 *
 * slug عمداً *از روی نام ذخیره می‌شود، نه محاسبه*: اگر کافه اسمش را عوض کند،
 * آدرس صفحه نباید بشکند (بخش SEO سند معماری). این تابع فقط برای ساخت
 * پیشنهاد اولیه است.
 */
export function slugifyFa(input: string, fallback = 'place'): string {
  const base = normalizeFa(input).replace(/\s+/g, '-')
  return base || fallback
}

/**
 * تبدیل فینگلیش به فارسی برای جست‌وجو.
 *
 * بخش قابل‌توجهی از کاربران ایرانی با کیبورد انگلیسی تایپ می‌کنند («cafe roof»
 * به‌جای «کافه رُف»). این نگاشت کامل نیست و قرار هم نیست باشد — هدف این است که
 * یک فیلد کمکی برای ایندکس تولید شود تا موتور جست‌وجو با تحمل غلط املایی
 * بتواند تطابق بدهد.
 */
const TRANSLIT: [RegExp, string][] = [
  [/kh/g, 'خ'], [/gh/g, 'ق'], [/ch/g, 'چ'], [/sh/g, 'ش'], [/zh/g, 'ژ'],
  [/aa/g, 'ا'], [/ou/g, 'و'], [/oo/g, 'و'], [/ee/g, 'ی'],
  [/a/g, 'ا'], [/b/g, 'ب'], [/p/g, 'پ'], [/t/g, 'ت'], [/s/g, 'س'],
  [/j/g, 'ج'], [/h/g, 'ه'], [/d/g, 'د'], [/r/g, 'ر'], [/z/g, 'ز'],
  [/f/g, 'ف'], [/k/g, 'ک'], [/g/g, 'گ'], [/l/g, 'ل'], [/m/g, 'م'],
  [/n/g, 'ن'], [/v/g, 'و'], [/w/g, 'و'], [/y/g, 'ی'], [/i/g, 'ی'],
  [/e/g, ''], [/o/g, ''], [/u/g, 'و'], [/c/g, 'ک'], [/q/g, 'ق'], [/x/g, 'کس'],
]

export function finglishToFa(input: string): string {
  let out = input.toLowerCase().replace(/[^a-z\s]/g, ' ')
  for (const [pattern, replacement] of TRANSLIT) out = out.replace(pattern, replacement)
  return out.replace(/\s+/g, ' ').trim()
}

/** آیا رشته حاوی حروف لاتین است؟ (یعنی احتمالاً فینگلیش تایپ شده) */
export function isLatin(input: string): boolean {
  return /[a-z]/i.test(input)
}
