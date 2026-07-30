import { WEEKDAYS } from '@/data/taxonomy'
import type { MenuCategory, OpeningHour, Promotion } from '@/types'

/** Contact block the owner edits on the «اطلاعات و برچسب‌ها» tab. */
export interface AdminContact {
  phone: string
  address: string
  instagram: string
}

/**
 * What the venue owner's panel starts with. The admin mockup carried this in its
 * constructor; there is no backend yet, so the panel edits a copy of it in state.
 */
export const SEED_CATEGORIES: MenuCategory[] = [
  {
    id: 'coffee',
    name: 'قهوه',
    items: [
      {
        id: 'c1',
        name: 'اسپرسو',
        en: 'Espresso',
        desc: 'تک‌شات، دان مخصوص',
        price: 45000,
        active: true,
        discount: null,
      },
      {
        id: 'c2',
        name: 'کاپوچینو',
        en: 'Cappuccino',
        desc: 'با شیر تازه',
        price: 68000,
        active: true,
        discount: 20,
      },
      {
        id: 'c3',
        name: 'لاته',
        en: 'Latte',
        desc: 'با شیر بخارداده و کف نرم',
        price: 72000,
        active: true,
        discount: null,
      },
    ],
  },
  {
    id: 'tea',
    name: 'دمنوش',
    items: [
      { id: 't1', name: 'چای ماسالا', desc: 'ادویه‌ٔ گرم', price: 55000, active: true },
      {
        id: 't2',
        name: 'دمنوش به‌لیمو',
        desc: 'دمنوش خنک و آرام‌بخش',
        price: 48000,
        active: false,
      },
    ],
  },
  {
    id: 'breakfast',
    name: 'صبحانه',
    items: [
      { id: 'b1', name: 'املت مخصوص', desc: 'با نان تست', price: 120000, active: true },
      { id: 'b2', name: 'پنکیک', desc: 'با سیروپ و کره', price: 135000, active: true },
    ],
  },
]

export const SEED_HOURS: OpeningHour[] = [
  { day: WEEKDAYS[0], from: '۰۹:۰۰', to: '۲۳:۰۰', closed: false, afterMidnight: false },
  { day: WEEKDAYS[1], from: '۰۹:۰۰', to: '۲۳:۰۰', closed: false, afterMidnight: false },
  { day: WEEKDAYS[2], from: '۰۹:۰۰', to: '۲۳:۰۰', closed: false, afterMidnight: false },
  { day: WEEKDAYS[3], from: '۰۹:۰۰', to: '۲۳:۰۰', closed: false, afterMidnight: false },
  { day: WEEKDAYS[4], from: '۰۹:۰۰', to: '۲۴:۰۰', closed: false, afterMidnight: true },
  { day: WEEKDAYS[5], from: '۱۰:۰۰', to: '۰۱:۰۰', closed: false, afterMidnight: true },
  { day: WEEKDAYS[6], from: '۱۰:۰۰', to: '۲۳:۰۰', closed: true, afterMidnight: false },
]

export const SEED_PROMOTIONS: Promotion[] = [
  {
    id: 'd1',
    title: '۲۰٪ تخفیف صبحانه',
    desc: 'روی همهٔ آیتم‌های صبحانه',
    range: 'تا پایان تیر',
    active: true,
  },
  {
    id: 'd2',
    title: 'قهوهٔ دوم نصف قیمت',
    desc: 'برای خرید دو نفره',
    range: 'شنبه تا چهارشنبه',
    active: false,
  },
]

export const SEED_CONTACT: AdminContact = {
  phone: '۰۵۱ ۳۸۴۴ ۲۲۱۰',
  address: 'مشهد، بلوار سجاد، نبش سجاد ۱۲',
  instagram: 'cafe.roof@',
}

/** Owner tags that start switched on — a subset of `OWNER_TAGS`. */
export const SEED_TAGS: string[] = ['مناسب کار', 'دنج', 'مناسب مطالعه', 'صبحانه']

/** Copy for a promotion the owner has just created and not yet renamed. */
export const NEW_PROMOTION = {
  title: 'تخفیف جدید',
  desc: 'توضیح تخفیف را بنویس',
  range: 'بدون محدودیت',
} as const

let sequence = 0

/**
 * Id for a record created during this session. The mockup used `Date.now()`,
 * which makes two records added in the same tick collide and makes snapshots
 * untestable; a counter is stable.
 */
export function nextId(prefix: string): string {
  sequence += 1
  return `${prefix}${sequence}`
}
