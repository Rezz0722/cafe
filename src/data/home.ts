import { paths, searchUrl } from '@/routes'

/** Rotating examples shown in the hero search field. */
export const SEARCH_PLACEHOLDERS = [
  'مثلاً: کافه‌ای برای کار با لپ‌تاپ توی قاسم‌آباد',
  'مثلاً: جایی دنج برای قرار توی احمدآباد',
  'مثلاً: بهترین پاستا نزدیک بلوار سجاد',
  'مثلاً: کافه‌ای که تا نیمه‌شب باز باشه',
]

/** One-tap queries that drop straight into the search field. */
export const QUICK_SUGGESTIONS = [
  'مناسب کار',
  'مناسب قرار',
  'فضای باز',
  'صبحانه',
  'دنج',
  'ارزان',
]

/**
 * The pastel filter bar under the hero. Each entry links to a pre-filtered
 * result list rather than toggling local state, so the destination is shareable.
 */
export const POPULAR_FILTERS: { label: string; to: string }[] = [
  { label: 'باز الان', to: `${paths.search}?open=1` },
  { label: 'نزدیک من', to: `${paths.search}?sort=near` },
  { label: 'قیمت مناسب', to: `${paths.search}?price=cheap` },
  { label: 'کافه', to: `${paths.search}?type=${encodeURIComponent('کافه')}` },
  { label: 'رستوران', to: `${paths.search}?type=${encodeURIComponent('کافه‌رستوران')}` },
  { label: 'هر دو', to: paths.search },
]

export interface IntentCard {
  emoji: string
  title: string
  text: string
  /** Persian-digit count, shown as copy rather than derived from the catalogue. */
  count: string
  to: string
  /** Token names for the card's pastel palette. */
  bg: string
  textColor: string
  countColor: string
}

export const INTENT_CARDS: IntentCard[] = [
  {
    emoji: '💻',
    title: 'می‌خوای کار کنی؟',
    text: 'کافه‌های آروم با وای‌فای خوب و پریز کنار میز.',
    count: '۲۱۰ کافه',
    to: searchUrl('مناسب کار با لپ‌تاپ'),
    bg: 'var(--c-pastel-blue)',
    textColor: 'var(--c-pastel-blue-text)',
    countColor: 'var(--c-primary-strong)',
  },
  {
    emoji: '🌙',
    title: 'قرار داری؟',
    text: 'جاهای دنج و باحال، با نور ملایم و موسیقی درست.',
    count: '۱۴۵ کافه',
    to: searchUrl('مناسب قرار'),
    bg: 'var(--c-pastel-pink)',
    textColor: 'var(--c-pastel-pink-text)',
    countColor: 'var(--c-pastel-pink-strong)',
  },
  {
    emoji: '🎉',
    title: 'با دوستات بیرونی؟',
    text: 'فضاهای بزرگ و پرانرژی برای دورهمی‌های شلوغ.',
    count: '۱۸۸ کافه',
    to: searchUrl('فضای باز'),
    bg: 'var(--c-pastel-lime)',
    textColor: 'var(--c-pastel-lime-text)',
    countColor: 'var(--c-pastel-lime-strong)',
  },
  {
    emoji: '📖',
    title: 'تنها می‌خوای مطالعه کنی؟',
    text: 'گوشه‌های ساکت و دنج برای تمرکز و کتاب خوندن.',
    count: '۹۷ کافه',
    to: searchUrl('مناسب مطالعه'),
    bg: 'var(--c-pastel-green)',
    textColor: 'var(--c-pastel-green-text)',
    countColor: 'var(--c-pastel-green-strong)',
  },
]
