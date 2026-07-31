import { WEEKDAY_LABELS } from '@/core/hours/weekdays'

/**
 * داده‌ی ساختگی پنل مالک کافه.
 *
 * ⚠️  این فایل عمداً از مدل دامنه (`core/places/types`) استفاده نمی‌کند.
 * پنل مالک هنوز بک‌اند ندارد و فقط یک کپی از این داده را در state ویرایش
 * می‌کند؛ شکل‌های زیر همان چیزی‌اند که فرم‌ها می‌خواهند — ساعت به‌صورت رشته‌ی
 * فارسی، دسته‌بندی به‌جای بخش منو، و بدون فیلدهای منشأ و تازگی داده.
 * وقتی سرور واقعی آمد، این فایل و تایپ‌هایش با هم حذف می‌شوند.
 */

/** آیتم منو، آن‌طور که فرم پنل ویرایشش می‌کند. */
export interface AdminMenuItem {
  id: string
  name: string
  /** نام لاتین، زیر نام فارسی نمایش داده می‌شود. */
  en?: string
  desc?: string
  /** تومان */
  price: number
  /** درصد تخفیف، وقتی کافه تخفیف گذاشته باشد. */
  discount?: number | null
  /** خاموش که باشد، آیتم در منوی عمومی دیده نمی‌شود. */
  active?: boolean
}

export interface AdminMenuCategory {
  id: string
  name: string
  items: AdminMenuItem[]
}

/** یک روز از ساعت کاری، با متن فارسی — نه شکل «HH:MM» دامنه. */
export interface AdminOpeningHour {
  /** نام روز هفته، از شنبه. */
  day: string
  from: string
  to: string
  closed: boolean
  /** وقتی `to` بعد از نیمه‌شب باشد. */
  afterMidnight?: boolean
}

export interface AdminPromotion {
  id: string
  title: string
  desc: string
  /** بازه‌ی اعتبار به‌صورت متن آزاد، مثلاً «تا پایان تیر». */
  range: string
  active: boolean
}

/** Contact block the owner edits on the «اطلاعات و برچسب‌ها» tab. */
export interface AdminContact {
  phone: string
  address: string
  instagram: string
}

/**
 * گزینه‌های ساعت برای ویرایشگر ساعت کاری: ۰۶:۰۰ تا ۰۲:۰۰ با گام نیم‌ساعته.
 * قبلاً در `data/taxonomy.ts` بود؛ آن فایل حذف شد و این تنها مصرف‌کننده‌اش بود.
 */
export const TIME_OPTIONS: string[] = (() => {
  const faDigit = (s: string) => s.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
  const out: string[] = []
  for (let h = 6; h <= 24; h += 1) {
    out.push(`${faDigit(String(h).padStart(2, '0'))}:۰۰`)
    if (h < 24) out.push(`${faDigit(String(h).padStart(2, '0'))}:۳۰`)
  }
  out.push('۰۱:۰۰', '۰۲:۰۰')
  return out
})()

/** Tags a venue owner can apply to their own listing from the admin panel. */
export const OWNER_TAGS = [
  'مناسب کار',
  'مناسب قرار',
  'فضای باز',
  'دنج',
  'مناسب مطالعه',
  'صبحانه',
  'باز تا نیمه‌شب',
  'مناسب خانواده',
] as const

/**
 * What the venue owner's panel starts with. The admin mockup carried this in its
 * constructor; there is no backend yet, so the panel edits a copy of it in state.
 */
export const SEED_CATEGORIES: AdminMenuCategory[] = [
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

export const SEED_HOURS: AdminOpeningHour[] = [
  { day: WEEKDAY_LABELS[0], from: '۰۹:۰۰', to: '۲۳:۰۰', closed: false, afterMidnight: false },
  { day: WEEKDAY_LABELS[1], from: '۰۹:۰۰', to: '۲۳:۰۰', closed: false, afterMidnight: false },
  { day: WEEKDAY_LABELS[2], from: '۰۹:۰۰', to: '۲۳:۰۰', closed: false, afterMidnight: false },
  { day: WEEKDAY_LABELS[3], from: '۰۹:۰۰', to: '۲۳:۰۰', closed: false, afterMidnight: false },
  { day: WEEKDAY_LABELS[4], from: '۰۹:۰۰', to: '۲۴:۰۰', closed: false, afterMidnight: true },
  { day: WEEKDAY_LABELS[5], from: '۱۰:۰۰', to: '۰۱:۰۰', closed: false, afterMidnight: true },
  { day: WEEKDAY_LABELS[6], from: '۱۰:۰۰', to: '۲۳:۰۰', closed: true, afterMidnight: false },
]

export const SEED_PROMOTIONS: AdminPromotion[] = [
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
