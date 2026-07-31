/**
 * واژگان کنترل‌شده‌ی ویژگی‌ها.
 *
 * ═══ چرا این فایل وجود دارد ═══
 *
 * نسخه‌ی قبلی، تگ‌ها را به‌صورت رشته‌ی آزاد فارسی نگه می‌داشت و در
 * `lib/search.ts` با پیشوند شش‌کاراکتری تطبیق می‌داد. سه نیت پیشوند یکسان
 * داشتند («مناسب ») و چون فیلتر با AND اعمال می‌شد، جست‌وجوی «مناسب قرار»
 * صفر نتیجه می‌داد — یعنی شعار محصول «حالت رو بگو» از کار افتاده بود.
 *
 * ریشه‌ی باگ، الگوریتم تطبیق نبود؛ این بود که «شناسه» و «برچسب نمایشی» یک
 * چیز فرض شده بودند. اینجا از هم جدا می‌شوند:
 *
 *   id       — پایدار، انگلیسی، هرگز عوض نمی‌شود، در URL و DB و ایندکس
 *   labelFa  — فقط نمایش؛ می‌شود فردا عوضش کرد بدون اینکه چیزی بشکند
 *   synonyms — چیزهایی که کاربر ممکن است تایپ کند
 *
 * با این جدایی، آن کلاس از باگ دیگر ممکن نیست: تطابق روی متن آزاد فقط برای
 * *حدس زدن* نیت است، و همیشه به یک id قطعی می‌رسد.
 */

export type AttributeKind = 'intent' | 'amenity' | 'vibe'

export interface AttributeDef {
  /** شناسه‌ی پایدار — کلید همه‌جا. */
  id: string
  /** برچسب فارسی برای نمایش. */
  labelFa: string
  kind: AttributeKind
  /** روی نوار فیلتر بیاید؟ */
  isFilter: boolean
  /** ترتیب نمایش در نوار فیلتر. */
  sortOrder: number
  /** چیزهایی که کاربر ممکن است به‌جای برچسب رسمی تایپ کند. */
  synonyms: string[]
  /** توضیح کوتاه برای پنل ادمین و tooltip. */
  hint?: string
}

export const ATTRIBUTES: AttributeDef[] = [
  {
    id: 'laptop_friendly',
    labelFa: 'مناسب کار با لپ‌تاپ',
    kind: 'intent',
    isFilter: true,
    sortOrder: 1,
    synonyms: ['مناسب کار', 'کار با لپ تاپ', 'لپ تاپ', 'لپتاپ', 'ورک', 'کار کردن', 'کار', 'laptop', 'work'],
    hint: 'پریز در دسترس، وای‌فای پایدار، میز مناسب کار',
  },
  {
    id: 'good_for_date',
    labelFa: 'مناسب قرار',
    kind: 'intent',
    isFilter: true,
    sortOrder: 2,
    synonyms: ['قرار', 'دیت', 'رمانتیک', 'دو نفره', 'date'],
  },
  {
    id: 'outdoor',
    labelFa: 'فضای باز',
    kind: 'amenity',
    isFilter: true,
    sortOrder: 3,
    synonyms: ['حیاط', 'تراس', 'بالکن', 'روف', 'روف گاردن', 'فضای بیرون', 'outdoor', 'terrace'],
  },
  {
    id: 'cozy',
    labelFa: 'دنج',
    kind: 'vibe',
    isFilter: true,
    sortOrder: 4,
    synonyms: ['نقلی', 'صمیمی', 'گرم', 'کوچیک و دنج', 'cozy'],
  },
  {
    id: 'good_for_study',
    labelFa: 'مناسب مطالعه',
    kind: 'intent',
    isFilter: true,
    sortOrder: 5,
    synonyms: ['مطالعه', 'درس خواندن', 'درس', 'کتاب', 'ساکت', 'study'],
  },
  {
    id: 'breakfast',
    labelFa: 'صبحانه',
    kind: 'intent',
    isFilter: true,
    sortOrder: 6,
    synonyms: ['صبحونه', 'برانچ', 'breakfast', 'brunch'],
  },
  {
    id: 'family_friendly',
    labelFa: 'مناسب خانواده',
    kind: 'intent',
    isFilter: true,
    sortOrder: 7,
    synonyms: ['خانوادگی', 'خانواده', 'بچه', 'family'],
  },
  {
    id: 'open_late',
    labelFa: 'باز تا نیمه‌شب',
    kind: 'amenity',
    isFilter: true,
    sortOrder: 8,
    synonyms: ['نیمه شب', 'تا دیروقت', 'شبانه', 'late'],
  },

  // ── ویژگی‌های متمایزکننده ──────────────────────────────────────────
  // این‌ها همان چیزهایی‌اند که گوگل‌مپ ندارد و خندق محصول‌اند (بخش ۰ سند
  // معماری). فقط با بازدید میدانی جمع می‌شوند، نه با اسکرپ.
  {
    id: 'power_outlets',
    labelFa: 'پریز کنار میز',
    kind: 'amenity',
    isFilter: true,
    sortOrder: 9,
    synonyms: ['پریز', 'شارژ', 'برق', 'outlet', 'plug'],
    hint: '۰ ندارد · ۱ چندتایی هست · ۲ سر بیشتر میزها',
  },
  {
    id: 'quiet',
    labelFa: 'کم‌سروصدا',
    kind: 'vibe',
    isFilter: true,
    sortOrder: 10,
    synonyms: ['آروم', 'آرام', 'بی سر و صدا', 'سوت و کور', 'quiet'],
  },
  {
    id: 'fast_wifi',
    labelFa: 'وای‌فای سریع',
    kind: 'amenity',
    isFilter: true,
    sortOrder: 11,
    synonyms: ['وای فای', 'وایفای', 'اینترنت', 'wifi'],
    hint: 'تست‌شده توسط تیم، نه ادعای کافه',
  },
  {
    id: 'long_stay_ok',
    labelFa: 'نشستن طولانی آزاد',
    kind: 'amenity',
    isFilter: true,
    sortOrder: 12,
    synonyms: ['موندن طولانی', 'ساعت ها نشستن', 'فشار نمیارن'],
    hint: 'برای ماندن بیش از دو ساعت فشار نمی‌آورند',
  },
  {
    id: 'parking',
    labelFa: 'پارکینگ',
    kind: 'amenity',
    isFilter: true,
    sortOrder: 13,
    synonyms: ['پارک', 'جای پارک', 'parking'],
  },
  {
    id: 'non_smoking',
    labelFa: 'فضای غیرسیگاری',
    kind: 'amenity',
    isFilter: true,
    sortOrder: 14,
    synonyms: ['غیر سیگاری', 'بدون دود', 'non smoking'],
  },
  {
    id: 'natural_light',
    labelFa: 'نور طبیعی',
    kind: 'vibe',
    isFilter: false,
    sortOrder: 15,
    synonyms: ['نور روز', 'پنجره بزرگ', 'روشن'],
  },
  {
    id: 'specialty_coffee',
    labelFa: 'قهوه تخصصی',
    kind: 'amenity',
    isFilter: true,
    sortOrder: 16,
    synonyms: ['اسپرسو', 'قهوه خوب', 'بهترین اسپرسو', 'بریو', 'specialty', 'espresso'],
  },

  // ── ویژگی‌هایی که داده‌ی واقعی اضافه کرد ─────────────────────────────
  // این‌ها بعد از import صد کافه‌ی مشهد اضافه شدند: در فایل ورودی به‌اندازه‌ی
  // کافی تکرار شده بودند که ارزش فیلترشدن داشته باشند. taxonomy باید از روی
  // داده‌ی واقعی رشد کند، نه از روی حدس.
  {
    id: 'vip_room',
    labelFa: 'سالن خصوصی / VIP',
    kind: 'amenity',
    isFilter: true,
    sortOrder: 17,
    synonyms: ['وی آی پی', 'سالن خصوصی', 'تشریفات', 'پذیرایی تشریفاتی', 'vip'],
  },
  {
    id: 'live_music',
    labelFa: 'موسیقی زنده',
    kind: 'amenity',
    isFilter: true,
    sortOrder: 18,
    synonyms: ['موسیقی زنده', 'اجرای زنده', 'کنسرت', 'live music'],
  },
  {
    id: 'boardgames',
    labelFa: 'بردگیم',
    kind: 'amenity',
    isFilter: true,
    sortOrder: 19,
    synonyms: ['بردگیم', 'بازی رومیزی', 'مافیا', 'boardgame'],
  },
  {
    id: 'takeaway',
    labelFa: 'بیرون‌بر',
    kind: 'amenity',
    isFilter: true,
    sortOrder: 20,
    synonyms: ['بیرون بر', 'تیک اوی', 'بیرون‌بر express', 'takeaway'],
  },
  {
    id: 'sports_screening',
    labelFa: 'پخش مسابقات ورزشی',
    kind: 'amenity',
    isFilter: true,
    sortOrder: 21,
    synonyms: ['پخش مسابقات', 'فوتبال', 'مسابقات ورزشی'],
  },
  {
    id: 'lively',
    labelFa: 'فضای پرانرژی',
    kind: 'vibe',
    isFilter: true,
    sortOrder: 22,
    synonyms: ['پرانرژی', 'شلوغ', 'جوانانه', 'پرجنب و جوش'],
  },
  {
    id: 'quick_service',
    labelFa: 'سرو سریع',
    kind: 'amenity',
    isFilter: true,
    sortOrder: 23,
    synonyms: ['سرو سریع', 'سریع', 'فوری'],
  },
  {
    id: 'scenic_view',
    labelFa: 'منظره و دید',
    kind: 'amenity',
    isFilter: true,
    sortOrder: 24,
    synonyms: ['دید به شهر', 'پانوراما', 'منظره', 'ویو', 'دید باز'],
  },
  {
    id: 'upscale',
    labelFa: 'شیک و لوکس',
    kind: 'vibe',
    isFilter: true,
    sortOrder: 25,
    synonyms: ['لوکس', 'شیک', 'مجلل', 'خاص'],
  },
  {
    id: 'photogenic',
    labelFa: 'مناسب عکاسی',
    kind: 'vibe',
    isFilter: true,
    sortOrder: 26,
    synonyms: ['عکاسی', 'دکور خاص', 'دیوارنگاری', 'مینیمال', 'اینستاگرامی'],
  },
  {
    id: 'desserts',
    labelFa: 'دسر و شیرینی',
    kind: 'amenity',
    isFilter: true,
    sortOrder: 27,
    synonyms: ['کیک', 'دسر', 'شیرینی', 'تارت', 'چیزکیک', 'پاستری', 'وافل', 'بستنی'],
  },
  {
    id: 'healthy_options',
    labelFa: 'گزینه‌های گیاهی و سالم',
    kind: 'amenity',
    isFilter: true,
    sortOrder: 28,
    synonyms: ['گیاهی', 'ارگانیک', 'رژیمی', 'وگان', 'سالم'],
  },
]

// ── ایندکس‌های مشتق ─────────────────────────────────────────────────

export const ATTRIBUTE_BY_ID = new Map(ATTRIBUTES.map((a) => [a.id, a]))

export const FILTER_ATTRIBUTES = ATTRIBUTES.filter((a) => a.isFilter).sort(
  (a, b) => a.sortOrder - b.sortOrder,
)

/** نیت‌هایی که روی صفحه‌ی اول و chipهای فیلتر نشان داده می‌شوند. */
export const INTENT_ATTRIBUTES = ATTRIBUTES.filter(
  (a) => a.kind === 'intent' && a.isFilter,
).sort((a, b) => a.sortOrder - b.sortOrder)

export function attributeLabel(id: string): string {
  return ATTRIBUTE_BY_ID.get(id)?.labelFa ?? id
}

export function isKnownAttribute(id: string): boolean {
  return ATTRIBUTE_BY_ID.has(id)
}

/** فقط شناسه‌های معتبر را نگه می‌دارد — ورودی از URL هرگز قابل اعتماد نیست. */
export function keepKnownAttributes(ids: string[]): string[] {
  return ids.filter((id) => ATTRIBUTE_BY_ID.has(id))
}
