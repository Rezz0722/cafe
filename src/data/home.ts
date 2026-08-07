/**
 * محتوای ثابتِ صفحه‌ی اصلی.
 *
 * ═══ چرا اینجا و نه در دیتابیس ═══
 *
 * این‌ها متنِ تحریریه‌اند، نه داده: کدام شش پیشنهاد در hero نشان داده شود و
 * نوار فیلتر چه میان‌برهایی داشته باشد، یک تصمیم طراحی است. عددها اما هیچ‌کدام
 * اینجا نیستند — هر شماری که روی صفحه دیده می‌شود از دیتابیس می‌آید.
 *
 * ═══ قاعده‌ی مقصدها ═══
 *
 * همه‌ی لینک‌ها با `searchPath` ساخته می‌شوند نه با رشته‌ی دستی، تا اگر شکل
 * پارامترهای جست‌وجو عوض شد یک‌جا اصلاح شود. و هر مقصد به فیلتری می‌رود که
 * **واقعاً نتیجه دارد**: میان‌بری که همیشه صفر نتیجه می‌دهد، بدتر از نبودنش
 * است.
 */

import { searchPath } from '@/core/search/filters'

/**
 * نمونه‌های چرخشی داخل فیلد جست‌وجوی hero.
 *
 * عمداً نامِ کافه و محله را مثال می‌زنند و نه حالت («جایی دنج برای قرار»):
 * جست‌وجوی متنی روی نام مکان کار می‌کند، پس مثالی که کاربر عیناً تایپ کند و
 * صفر نتیجه بگیرد، فیلد را در نظرش خراب می‌کند. حالت‌ها کار چیپ‌های زیر
 * فیلدند.
 */
export const SEARCH_PLACEHOLDERS = [
  'مثلاً: اسم کافه‌ای که شنیده‌ای',
  'مثلاً: کافه‌ای در احمدآباد',
  'مثلاً: جایی که صبحانه بدهد',
  'مثلاً: کافه‌ای با قهوهٔ دمی',
]

/**
 * پیشنهادهای یک‌ضربه‌ای زیر فیلد جست‌وجو.
 *
 * هرکدام به یک facet واقعی وصل است و مستقیم به نتیجه‌ی فیلترشده می‌رود — نه
 * اینکه متن را داخل فیلد بریزد. ریختن متن، از مسیر تطبیقِ متنی رد می‌شد و
 * نتیجه‌اش با آنچه چیپ وعده داده بود یکی نبود.
 */
export const QUICK_SUGGESTIONS: { label: string; href: string }[] = [
  { label: 'قهوه دمی', href: searchPath({ facets: ['brewed_coffee'] }) },
  { label: 'صبحانه', href: searchPath({ facets: ['breakfast'] }) },
  { label: 'پاستا', href: searchPath({ facets: ['pasta'] }) },
  { label: 'ماچا', href: searchPath({ facets: ['matcha'] }) },
  { label: 'رژیمی', href: searchPath({ facets: ['healthy'] }) },
  { label: 'قلیان', href: searchPath({ facets: ['hookah'] }) },
]

/**
 * نوار فیلتر پاستلی زیر hero.
 *
 * نسخه‌ی قبلی این فهرست `?kind=cafe` و `?kind=cafe_restaurant` داشت؛ فیلتر
 * `kind` در `SearchFilters` وجود ندارد، پس آن دو میان‌بر به یک URL بی‌اثر
 * می‌رفتند و کاربر همان فهرست کامل را می‌دید. جایشان مرتب‌سازی‌ها و سقف قیمت
 * آمده که هر شش‌تا واقعاً اعمال می‌شوند — همان‌هایی که فوتر هم استفاده می‌کند.
 */
export const POPULAR_FILTERS: { label: string; to: string }[] = [
  { label: 'الان باز است', to: searchPath({ openNow: true }) },
  { label: 'نزدیک من', to: searchPath({ nearMe: true, sort: 'distance' }) },
  { label: 'ارزان‌ترین', to: searchPath({ sort: 'price_asc' }) },
  { label: 'تا ۲۰۰ هزار', to: searchPath({ maxPrice: 200_000 }) },
  { label: 'کامل‌ترین اطلاعات', to: searchPath({ sort: 'quality' }) },
  { label: 'روی نقشه', to: searchPath({ view: 'map' }) },
]

/**
 * شناسه‌ی آیکون، نه خودِ آیکون.
 *
 * این ماژول داده است و نباید کامپوننت React ایمپورت کند — وگرنه هر جایی که
 * `POPULAR_FILTERS` را می‌خواهد، کل `lucide-react` را هم با خودش می‌کشد.
 * نگاشتِ شناسه به کامپوننت در خودِ صفحه است.
 */
export type IntentIcon = 'laptop' | 'moon' | 'leaf' | 'book'

export interface IntentCard {
  icon: IntentIcon
  title: string
  text: string
  /** شناسه‌ی ویژگی در `ATTRIBUTES` — صفحه با آن تعداد واقعی را می‌شمارد. */
  attributeId: string
  to: string
  bg: string
  textColor: string
  countColor: string
}

/**
 * کارت‌های نیت روی صفحه‌ی اصلی.
 *
 * ═══ عددها ═══
 *
 * تعداد کافه‌ها متنِ ثابت نیست («۲۱۰ کافه» در ماکاپ). صفحه از
 * `listAttributeCounts()` می‌شمارد، و **وقتی صفر است هیچ عددی نشان نمی‌دهد**.
 *
 * الان صفر است: جدول `place_attribute` خالی است چون ویژگی از منو استخراج
 * نمی‌شود و داده‌ی منبع فیلدی برای فضا و امکانات ندارد. به‌محض اینکه مالک‌ها و
 * ادمین از پنل برچسب بزنند، همین عددها خودشان واقعی می‌شوند — بدون تغییر کد.
 *
 * عددِ ساختگی روی صفحه‌ی اول، اولین چیزی است که اعتماد کاربر را می‌شکند وقتی
 * کلیک می‌کند و ۴ نتیجه می‌بیند.
 */
export const INTENT_CARDS: IntentCard[] = [
  {
    icon: 'laptop',
    title: 'می‌خوای کار کنی؟',
    text: 'کافه‌های آروم با وای‌فای خوب و پریز کنار میز.',
    attributeId: 'laptop_friendly',
    to: searchPath({ attributes: ['laptop_friendly'] }),
    bg: 'var(--c-pastel-blue)',
    textColor: 'var(--c-pastel-blue-text)',
    countColor: 'var(--c-primary-strong)',
  },
  {
    icon: 'moon',
    title: 'قرار داری؟',
    text: 'جاهای دنج و باحال، با نور ملایم و موسیقی درست.',
    attributeId: 'good_for_date',
    to: searchPath({ attributes: ['good_for_date'] }),
    bg: 'var(--c-pastel-pink)',
    textColor: 'var(--c-pastel-pink-text)',
    countColor: 'var(--c-pastel-pink-strong)',
  },
  {
    icon: 'leaf',
    title: 'فضای باز می‌خوای؟',
    text: 'حیاط و تراس و روف، برای وقتی هوا خوب است.',
    attributeId: 'outdoor',
    to: searchPath({ attributes: ['outdoor'] }),
    bg: 'var(--c-pastel-lime)',
    textColor: 'var(--c-pastel-lime-text)',
    countColor: 'var(--c-pastel-lime-strong)',
  },
  {
    icon: 'book',
    title: 'تنها می‌خوای مطالعه کنی؟',
    text: 'گوشه‌های ساکت و دنج برای تمرکز و کتاب خوندن.',
    attributeId: 'good_for_study',
    to: searchPath({ attributes: ['good_for_study'] }),
    bg: 'var(--c-pastel-green)',
    textColor: 'var(--c-pastel-green-text)',
    countColor: 'var(--c-pastel-green-strong)',
  },
]
