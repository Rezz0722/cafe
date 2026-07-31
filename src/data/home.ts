import { paths, searchByIntents } from '@/routes'

/** نمونه‌های چرخشی داخل فیلد جست‌وجوی hero. */
export const SEARCH_PLACEHOLDERS = [
  'مثلاً: کافه‌ای برای کار با لپ‌تاپ توی قاسم‌آباد',
  'مثلاً: جایی دنج برای قرار توی احمدآباد',
  'مثلاً: کافه‌ای با پریز کنار میز',
  'مثلاً: کافه‌ای که تا نیمه‌شب باز باشه',
]

/**
 * پیشنهادهای یک‌ضربه‌ای.
 *
 * حالا شناسه‌محورند نه رشته‌ی فارسی. در نسخه‌ی قبلی این‌ها متن آزاد بودند و
 * مستقیم داخل فیلد جست‌وجو ریخته می‌شدند، که یعنی از همان مسیر تطبیق
 * پیشوندی رد می‌شدند که باگ داشت — «مناسب کار» سه نیت را با هم روشن می‌کرد
 * و نتیجه صفر می‌شد.
 */
export const QUICK_SUGGESTIONS: { label: string; intentId: string }[] = [
  { label: 'مناسب کار', intentId: 'laptop_friendly' },
  { label: 'مناسب قرار', intentId: 'good_for_date' },
  { label: 'فضای باز', intentId: 'outdoor' },
  { label: 'صبحانه', intentId: 'breakfast' },
  { label: 'دنج', intentId: 'cozy' },
  { label: 'پریز کنار میز', intentId: 'power_outlets' },
]

/** نوار فیلتر پاستلی زیر hero — هرکدام به یک نتیجه‌ی از پیش فیلترشده می‌رود. */
export const POPULAR_FILTERS: { label: string; to: string }[] = [
  { label: 'باز الان', to: `${paths.search}?open=1` },
  { label: 'نزدیک من', to: `${paths.search}?sort=near` },
  { label: 'قیمت مناسب', to: `${paths.search}?price=1` },
  { label: 'کافه', to: `${paths.search}?kind=cafe` },
  { label: 'کافه‌رستوران', to: `${paths.search}?kind=cafe_restaurant` },
  { label: 'هر دو', to: paths.search },
]

export interface IntentCard {
  emoji: string
  title: string
  text: string
  intentId: string
  to: string
  bg: string
  textColor: string
  countColor: string
}

/**
 * کارت‌های نیت روی صفحه‌ی اصلی.
 *
 * تعداد کافه‌ها دیگر متنِ ثابت نیست («۲۱۰ کافه» در ماکاپ) — در صفحه از روی
 * کاتالوگ واقعی شمرده می‌شود. عددِ ساختگی روی صفحه‌ی اول، اولین چیزی است که
 * اعتماد کاربر را می‌شکند وقتی کلیک می‌کند و ۴ نتیجه می‌بیند.
 */
export const INTENT_CARDS: IntentCard[] = [
  {
    emoji: '💻',
    title: 'می‌خوای کار کنی؟',
    text: 'کافه‌های آروم با وای‌فای خوب و پریز کنار میز.',
    intentId: 'laptop_friendly',
    to: searchByIntents(['laptop_friendly']),
    bg: 'var(--c-pastel-blue)',
    textColor: 'var(--c-pastel-blue-text)',
    countColor: 'var(--c-primary-strong)',
  },
  {
    emoji: '🌙',
    title: 'قرار داری؟',
    text: 'جاهای دنج و باحال، با نور ملایم و موسیقی درست.',
    intentId: 'good_for_date',
    to: searchByIntents(['good_for_date']),
    bg: 'var(--c-pastel-pink)',
    textColor: 'var(--c-pastel-pink-text)',
    countColor: 'var(--c-pastel-pink-strong)',
  },
  {
    emoji: '🎉',
    title: 'با دوستات بیرونی؟',
    text: 'فضاهای بزرگ و پرانرژی برای دورهمی‌های شلوغ.',
    intentId: 'outdoor',
    to: searchByIntents(['outdoor']),
    bg: 'var(--c-pastel-lime)',
    textColor: 'var(--c-pastel-lime-text)',
    countColor: 'var(--c-pastel-lime-strong)',
  },
  {
    emoji: '📖',
    title: 'تنها می‌خوای مطالعه کنی؟',
    text: 'گوشه‌های ساکت و دنج برای تمرکز و کتاب خوندن.',
    intentId: 'good_for_study',
    to: searchByIntents(['good_for_study']),
    bg: 'var(--c-pastel-green)',
    textColor: 'var(--c-pastel-green-text)',
    countColor: 'var(--c-pastel-green-strong)',
  },
]
