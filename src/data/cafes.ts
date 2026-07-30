import type { Cafe, CafeDetail, MenuCategory, OpeningHour, Review } from '@/types'

/**
 * The venue catalogue. The five design mockups each carried their own partial
 * copy of this list; consolidating it here is what keeps the home page, the
 * result list and the detail page from disagreeing about a venue's rating.
 */
export const CAFES: Cafe[] = [
  {
    id: 'roof',
    name: 'کافه رُف',
    hood: 'سجاد',
    type: 'کافه‌رستوران',
    rating: 4.8,
    reviewCount: 142,
    priceKey: 'mid',
    distanceKm: 1.2,
    isOpen: true,
    tags: ['مناسب کار با لپ‌تاپ', 'دنج', 'مناسب قرار', 'فضای باز'],
    ribbon: 'منتخب سردبیر',
  },
  {
    id: 'hezartu',
    name: 'کافه‌کتاب هزارتو',
    hood: 'احمدآباد',
    type: 'کافه',
    rating: 4.7,
    reviewCount: 98,
    priceKey: 'cheap',
    distanceKm: 2.4,
    isOpen: true,
    tags: ['مناسب مطالعه', 'دنج', 'مناسب کار با لپ‌تاپ'],
  },
  {
    id: 'bamesabz',
    name: 'کافه بام سبز',
    hood: 'کوهسنگی',
    type: 'کافه‌رستوران',
    rating: 4.9,
    reviewCount: 210,
    priceKey: 'high',
    distanceKm: 3.1,
    isOpen: false,
    tags: ['فضای باز', 'مناسب قرار'],
    ribbon: 'محبوب محلی‌ها',
  },
  {
    id: 'note',
    name: 'اسپرسوخانهٔ نُت',
    hood: 'وکیل‌آباد',
    type: 'کافه',
    rating: 4.6,
    reviewCount: 76,
    priceKey: 'mid',
    distanceKm: 4.0,
    isOpen: true,
    tags: ['بهترین اسپرسو', 'مناسب کار با لپ‌تاپ'],
  },
  {
    id: 'hayat',
    name: 'کافه حیاط',
    hood: 'راهنمایی',
    type: 'کافه‌رستوران',
    rating: 4.8,
    reviewCount: 120,
    priceKey: 'mid',
    distanceKm: 2.0,
    isOpen: false,
    tags: ['دنج', 'دورهمی', 'فضای باز'],
  },
  {
    id: 'shabtab',
    name: 'کافه شب‌تاب',
    hood: 'قاسم‌آباد',
    type: 'کافه',
    rating: 4.5,
    reviewCount: 63,
    priceKey: 'cheap',
    distanceKm: 0.8,
    isOpen: true,
    tags: ['باز تا نیمه‌شب', 'مناسب کار با لپ‌تاپ', 'دنج'],
    ribbon: 'تازه‌وارد',
  },
  {
    id: 'nghte',
    name: 'کافه نقطه',
    hood: 'قاسم‌آباد',
    type: 'کافه',
    rating: 4.4,
    reviewCount: 41,
    priceKey: 'cheap',
    distanceKm: 1.5,
    isOpen: true,
    tags: ['مناسب کار با لپ‌تاپ', 'دنج', 'مناسب مطالعه'],
  },
  {
    id: 'renesans',
    name: 'کافه رنسانس',
    hood: 'سجاد',
    type: 'کافه‌رستوران',
    rating: 4.3,
    reviewCount: 55,
    priceKey: 'high',
    distanceKm: 1.9,
    isOpen: true,
    tags: ['مناسب قرار', 'صبحانه'],
  },
]

/** The six venues featured on the home page, in display order. */
export const FEATURED_IDS = ['roof', 'hezartu', 'bamesabz', 'note', 'hayat', 'shabtab']

export function getCafe(id: string): Cafe | undefined {
  return CAFES.find((c) => c.id === id)
}

export function getFeatured(): Cafe[] {
  return FEATURED_IDS.map(getCafe).filter((c): c is Cafe => Boolean(c))
}

/* -------------------------------------------------------------------------- */
/*  Detail-page content                                                       */
/* -------------------------------------------------------------------------- */

const DEFAULT_MENU: MenuCategory[] = [
  {
    id: 'coffee',
    name: 'قهوه',
    items: [
      { id: 'c1', name: 'اسپرسو', en: 'Espresso', desc: 'تک‌شات، دان مخصوص', price: 45000 },
      {
        id: 'c2',
        name: 'کاپوچینو',
        en: 'Cappuccino',
        desc: 'با شیر تازه و کف مخملی',
        price: 68000,
        discount: 20,
      },
      { id: 'c3', name: 'لاته', en: 'Latte', desc: 'با شیر بخارداده و کف نرم', price: 72000 },
    ],
  },
  {
    id: 'tea',
    name: 'دمنوش',
    items: [
      { id: 't1', name: 'چای ماسالا', en: 'Masala Tea', desc: 'ادویهٔ گرم هندی', price: 55000 },
      { id: 't2', name: 'دمنوش به‌لیمو', en: 'Lemon Verbena', desc: 'خنک و آرام‌بخش', price: 48000 },
    ],
  },
  {
    id: 'breakfast',
    name: 'صبحانه',
    items: [
      {
        id: 'b1',
        name: 'املت مخصوص',
        en: 'Special Omelette',
        desc: 'با نان تست و کره',
        price: 120000,
      },
      {
        id: 'b2',
        name: 'پنکیک',
        en: 'Pancake',
        desc: 'با سیروپ افرا و کره',
        price: 135000,
        discount: 15,
      },
    ],
  },
  {
    id: 'food',
    name: 'غذا',
    items: [
      { id: 'f1', name: 'پاستا آلفردو', en: 'Alfredo Pasta', desc: 'سس خامه و قارچ', price: 210000 },
      {
        id: 'f2',
        name: 'برگر مخصوص',
        en: 'Signature Burger',
        desc: 'گوشت دست‌ساز، سیب‌زمینی',
        price: 245000,
      },
    ],
  },
]

const DEFAULT_HOURS: OpeningHour[] = [
  { day: 'شنبه', from: '۰۹:۰۰', to: '۲۴:۰۰', closed: false },
  { day: 'یک‌شنبه', from: '۰۹:۰۰', to: '۲۴:۰۰', closed: false },
  { day: 'دوشنبه', from: '۰۹:۰۰', to: '۲۴:۰۰', closed: false },
  { day: 'سه‌شنبه', from: '۰۹:۰۰', to: '۲۴:۰۰', closed: false },
  { day: 'چهارشنبه', from: '۰۹:۰۰', to: '۲۴:۰۰', closed: false },
  { day: 'پنج‌شنبه', from: '۱۰:۰۰', to: '۰۱:۰۰', closed: false, afterMidnight: true },
  { day: 'جمعه', from: '۱۰:۰۰', to: '۲۳:۰۰', closed: false },
]

const DEFAULT_REVIEWS: Review[] = [
  {
    id: 'r1',
    author: 'سارا م.',
    stars: 5,
    date: '۳ روز پیش',
    text: 'فضاش برای کار با لپ‌تاپ عالیه، پریز کنار همهٔ میزها و وای‌فای قوی. قهوه‌شون هم حرف نداره.',
    badge: 'کاشف حرفه‌ای',
  },
  {
    id: 'r2',
    author: 'امیر ک.',
    stars: 4,
    date: '۱ هفته پیش',
    text: 'دنج و آروم، برای قرار خوبه. فقط آخر هفته‌ها یه‌کم شلوغ می‌شه.',
  },
  {
    id: 'r3',
    author: 'نگار الف.',
    stars: 5,
    date: '۲ هفته پیش',
    text: 'پنکیکشون فوق‌العاده بود! برخورد کارکنا هم خیلی گرم بود.',
    badge: 'کاشف تازه‌کار',
  },
]

/** Street addresses, keyed by venue. Falls back to the neighbourhood alone. */
const ADDRESSES: Record<string, string> = {
  roof: 'مشهد، بلوار سجاد، نبش سجاد ۱۲، طبقهٔ همکف',
  hezartu: 'مشهد، احمدآباد، خیابان عارف، پلاک ۲۴',
  bamesabz: 'مشهد، کوهسنگی، انتهای بلوار، بام سبز',
  note: 'مشهد، بلوار وکیل‌آباد، نبش وکیل‌آباد ۳۰',
  hayat: 'مشهد، خیابان راهنمایی، کوچهٔ باغ، پلاک ۷',
  shabtab: 'مشهد، قاسم‌آباد، بلوار اندیشه، نبش اندیشه ۴۵',
  nghte: 'مشهد، قاسم‌آباد، بلوار شاهد، پلاک ۱۱',
  renesans: 'مشهد، بلوار سجاد، نبش بزرگمهر شمالی',
}

/**
 * Full detail record for a venue. Every venue currently shares one menu, hours
 * table and review set — the mockups did the same — but the shape is per-venue
 * so real data can be dropped in one venue at a time.
 */
export function getCafeDetail(id: string): CafeDetail | undefined {
  const cafe = getCafe(id)
  if (!cafe) return undefined

  const similar = CAFES.filter((c) => c.id !== id)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 3)
    .map((c) => c.id)

  return {
    ...cafe,
    address: ADDRESSES[id] ?? `مشهد، ${cafe.hood}`,
    openText: 'الان بازه',
    openSub: 'تا ۲۴ باز است',
    menu: DEFAULT_MENU,
    hours: DEFAULT_HOURS,
    reviews: DEFAULT_REVIEWS,
    similar,
  }
}
