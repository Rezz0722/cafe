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
  district: (districtSlug: string) => `/mashhad/${districtSlug}`,
  districtIntent: (districtSlug: string, intentId: string) =>
    `/mashhad/${districtSlug}/${intentId}`,
  auth: '/auth',
  profile: '/profile',
  admin: '/admin',
} as const

/** `/search?q=…` — با حذف پارامتر وقتی خالی است. */
export function searchUrl(query?: string): string {
  const q = (query ?? '').trim()
  return q ? `${paths.search}?q=${encodeURIComponent(q)}` : paths.search
}

/** `/search?intents=id1,id2` — شناسه‌محور، نه برچسب فارسی. */
export function searchByIntents(intentIds: string[]): string {
  if (!intentIds.length) return paths.search
  return `${paths.search}?intents=${intentIds.join(',')}`
}

export function authUrl(redirectTo?: string): string {
  return redirectTo ? `${paths.auth}?redirect=${encodeURIComponent(redirectTo)}` : paths.auth
}

/** آخرین گام ثبت‌نام، که «ویرایش نام» هم هست. */
export function editProfileUrl(): string {
  return `${paths.auth}?edit=1&redirect=${encodeURIComponent(paths.profile)}`
}

/** صفحه‌ی نام‌کاربری/رمز حساب‌های دمو. */
export function devLoginUrl(redirectTo?: string): string {
  const base = `${paths.auth}?login=1`
  return redirectTo ? `${base}&redirect=${encodeURIComponent(redirectTo)}` : base
}

/** آدرس کانونی سایت — برای متادیتا، sitemap و JSON-LD. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cafegard.ir'

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString()
}
