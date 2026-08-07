/**
 * ساخت همه‌ی URLهای داخلی — یک‌جا، تا تغییر مسیر فقط یک نقطه داشته باشد.
 *
 * ═══ چرا ساختار عوض شد ═══
 *
 * `/cafe/:id` جای خود را به `/cafe/[slug]` داد، و صفحات محله × نیت اضافه شدند.
 * دلیلش SEO است (بخش ۶ سند معماری): صفحات تقاطع «نیت در محله» جست‌وجوی واقعی
 * دارند و گوگل‌مپ برایشان رتبه‌ی خوبی نمی‌گیرد. این‌ها صفحات پول‌ساز محصول‌اند.
 *
 * slug پایدار است و از `name` جدا ذخیره می‌شود — اگر کافه اسمش را عوض کند،
 * آدرس صفحه نباید بشکند، وگرنه اعتبار SEO می‌سوزد.
 */

export const paths = {
  home: '/',
  search: '/search',
  cafe: (slug: string) => `/cafe/${slug}`,
  /**
   * لندینگ محله‌ها — بالای سرِ صفحات `/mashhad/[district]`.
   *
   * تا امروز این صفحه وجود نداشت و دکمه‌ی «محله‌ها» در هدر به صفحه‌ی اصلی
   * می‌رفت، یعنی عملاً کار نمی‌کرد.
   */
  districtHub: '/mashhad',
  district: (districtSlug: string) => `/mashhad/${districtSlug}`,
  auth: '/auth',
  /**
   * «مشارکت» — صفحه‌ای که می‌گوید کاربر چطور می‌تواند داده را بهتر کند.
   *
   * قبلاً این آیتمِ منو به صفحه‌ی اصلی می‌رفت، یعنی عملاً کار نمی‌کرد. هدفش
   * از اول این بود که کاربر بتواند اطلاعات غلطِ کافه‌ها را برای ما اصلاح کند.
   */
  contribute: '/contribute',
  profile: '/profile',
  /** تغییر رمز — مقصد اجباریِ کسی که رمز موقت گرفته. */
  changePassword: '/profile/password',
  /** سلیقه‌سنجی کاربر. */
  taste: '/profile/taste',
  /** ثبت کافه‌ی جدید توسط کاربر. */
  submitPlace: '/profile/submit',
  /** نظرهای کاربر. */
  myReviews: '/profile/reviews',
  admin: '/admin',
  /** پنل مالک کافه — جدا از پنل مدیر. */
  ownerPanel: '/admin/venue',
} as const

/** `/search?q=…` — با حذف پارامتر وقتی خالی است. */
export function searchUrl(query?: string): string {
  const q = (query ?? '').trim()
  return q ? `${paths.search}?q=${encodeURIComponent(q)}` : paths.search
}


export function authUrl(redirectTo?: string): string {
  return redirectTo ? `${paths.auth}?redirect=${encodeURIComponent(redirectTo)}` : paths.auth
}

/** آدرس کانونی سایت — برای متادیتا، sitemap و JSON-LD. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kucafe.ir'

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString()
}
