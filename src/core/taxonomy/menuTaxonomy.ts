/**
 * واژگان منو: facet و دیش.
 *
 * ═══ مسئله ═══
 *
 * فایل منبع **۱٬۹۴۵ نام دسته‌ی یکتا** و **۱۱٬۳۶۱ نام آیتم یکتا** دارد. روی
 * هیچ‌کدام نمی‌شود فیلتر ساخت:
 *
 *   «پاستا» · «پاستا / Pasta» · «پاستا/pastas» · «پاستا و لازانیا» · «Pasta»
 *
 * پنج رشته، یک مفهوم. اگر فیلتر روی رشته‌ی خام باشد، کاربری که «پاستا» را
 * انتخاب می‌کند فقط کافه‌هایی را می‌بیند که *دقیقاً* همان املا را نوشته‌اند.
 *
 * ═══ راه‌حل: دو سطح ═══
 *
 *   facet  دسته‌ی بزرگ — «پاستا»، «قهوه»، «صبحانه». روی نوار فیلتر می‌آید.
 *   dish   غذای مشخص — «پاستا آلفردو»، «آیس لاته». پشت «بهترین X نزدیک من».
 *
 * facet از **نام دسته‌ی منو** استخراج می‌شود و dish از **نام آیتم**. هر دو
 * قابل اثبات‌اند: «۱۲ آیتم پاستا دارد» یک واقعیت است، نه سلیقه. به همین دلیل
 * از `attribute` («دنج است») جدا نگه داشته شده‌اند.
 *
 * ═══ قاعده‌ی تطبیق: اولین قاعده‌ی منطبق برنده است ═══
 *
 * قواعد **مرتب‌شده از خاص به عام** هستند. این ترتیب لازم است چون
 * «نوشیدنی گرم بدون قهوه» هم شامل «قهوه» است هم شامل «نوشیدنی گرم»؛ اگر
 * قاعده‌ی قهوه اول بیاید، اشتباه دسته‌بندی می‌شود. برای همین هر قاعده
 * `exclude` هم دارد.
 */

import { normalizeFa, squashFa } from '@/core/text/normalize'

/**
 * تطبیق یک الگو با یک نام.
 *
 * ═══ چرا دو حالت لازم است ═══
 *
 * الگوهای **فارسی** با زیررشته تطبیق می‌خورند، چون `squashFa` فاصله‌ها را
 * حذف می‌کند تا «کوه‌سنگی» و «کوه سنگی» یکی شوند؛ همین‌جا مرز واژه از دست
 * می‌رود و برای فارسی مشکلی نمی‌سازد.
 *
 * ولی برای **لاتین** زیررشته فاجعه است: `tea` زیررشته‌ی `steak` است، پس
 * «استیک / Steak» به‌عنوان «چای» دسته‌بندی می‌شد. این باگ واقعی بود و تست
 * گرفتش.
 *
 * راه‌حل: الگوی لاتین باید از **ابتدای یک واژه** شروع شود. انتهای واژه آزاد
 * می‌ماند تا جمع‌ها هم بخورند (`burger` ← `Burgers`, `drink` ← `Drinks`).
 */
interface CompiledPattern {
  /** الگوی فارسی — زیررشته روی متنِ بی‌فاصله. */
  squashed?: string
  /** الگوی لاتین — از ابتدای واژه روی متنِ فاصله‌دار. */
  latin?: RegExp
}

const LATIN_ONLY = /^[a-z0-9 ]+$/

function compilePattern(pattern: string): CompiledPattern | null {
  const lower = pattern.trim().toLowerCase()
  if (!lower) return null
  if (LATIN_ONLY.test(lower)) {
    const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return { latin: new RegExp(`(?:^|\\s)${escaped}`) }
  }
  const squashed = squashFa(pattern)
  return squashed ? { squashed } : null
}

function patternHits(compiled: CompiledPattern, squashed: string, spaced: string): boolean {
  if (compiled.latin) return compiled.latin.test(spaced)
  if (compiled.squashed) return squashed.includes(compiled.squashed)
  return false
}

export type FacetKind = 'drink' | 'menu' | 'cuisine' | 'service'

export interface FacetDef {
  id: string
  labelFa: string
  labelEn: string
  kind: FacetKind
  /** روی نوار فیلتر بیاید؟ «افزودنی» و «سرویس» نه — فیلترِ بی‌معنی‌اند. */
  isFilter: boolean
  sortOrder: number
  icon: string
  hint?: string
}

export interface DishMatchContext {
  /** قیمت تومان؛ فقط برای رفع ابهام آیتم‌های عمومی مثل «لیموناد» استفاده می‌شود. */
  price?: number | null
  /** نام خام دسته برای تشخیص دسته‌های یخچالی/شرکتی. */
  sectionName?: string | null
}

/**
 * قاعده‌ی تطبیق نام دسته به facet.
 *
 * `patterns` و `exclude` قبل از مقایسه با `squashFa` نرمال می‌شوند، پس
 * «کوه‌سنگی» و «کوه سنگی» و «کوهسنگی» یکی می‌شوند و نیازی به نوشتن همه‌ی
 * املاها نیست.
 */
interface FacetRule {
  facetId: string
  patterns: string[]
  exclude?: string[]
}

// ── فهرست facetها ────────────────────────────────────────────────────

export const FACETS: FacetDef[] = [
  // نوشیدنی
  { id: 'coffee', labelFa: 'قهوه', labelEn: 'Coffee', kind: 'drink', isFilter: true, sortOrder: 1, icon: '☕', hint: 'اسپرسو، لاته، دمی' },
  { id: 'cold_coffee', labelFa: 'قهوه سرد', labelEn: 'Cold coffee', kind: 'drink', isFilter: true, sortOrder: 2, icon: '🧋' },
  { id: 'brewed_coffee', labelFa: 'قهوه دمی', labelEn: 'Brewed coffee', kind: 'drink', isFilter: true, sortOrder: 3, icon: '🫖', hint: 'V60، کمکس، ایروپرس' },
  { id: 'matcha', labelFa: 'ماچا', labelEn: 'Matcha', kind: 'drink', isFilter: true, sortOrder: 4, icon: '🍵' },
  { id: 'tea', labelFa: 'چای و دمنوش', labelEn: 'Tea & herbal', kind: 'drink', isFilter: true, sortOrder: 5, icon: '🫖' },
  { id: 'hot_drinks', labelFa: 'نوشیدنی گرم', labelEn: 'Hot drinks', kind: 'drink', isFilter: true, sortOrder: 6, icon: '🍫', hint: 'هات چاکلت، شیر عسل' },
  { id: 'mocktail', labelFa: 'ماکتیل', labelEn: 'Mocktail', kind: 'drink', isFilter: true, sortOrder: 7, icon: '🍹' },
  { id: 'shake', labelFa: 'شیک', labelEn: 'Shake', kind: 'drink', isFilter: true, sortOrder: 8, icon: '🥤' },
  { id: 'smoothie', labelFa: 'اسموتی', labelEn: 'Smoothie', kind: 'drink', isFilter: true, sortOrder: 9, icon: '🥝' },
  { id: 'juice', labelFa: 'آبمیوه طبیعی', labelEn: 'Fresh juice', kind: 'drink', isFilter: true, sortOrder: 10, icon: '🍊' },
  { id: 'soft_drinks', labelFa: 'نوشیدنی سرد', labelEn: 'Cold drinks', kind: 'drink', isFilter: false, sortOrder: 11, icon: '🥫' },

  // خوراکی
  { id: 'breakfast', labelFa: 'صبحانه', labelEn: 'Breakfast', kind: 'menu', isFilter: true, sortOrder: 20, icon: '🍳' },
  { id: 'bakery', labelFa: 'بیکری و پیستری', labelEn: 'Bakery', kind: 'menu', isFilter: true, sortOrder: 21, icon: '🥐' },
  { id: 'cake_dessert', labelFa: 'کیک و دسر', labelEn: 'Cake & dessert', kind: 'menu', isFilter: true, sortOrder: 22, icon: '🍰' },
  { id: 'ice_cream', labelFa: 'بستنی', labelEn: 'Ice cream', kind: 'menu', isFilter: true, sortOrder: 23, icon: '🍨' },
  { id: 'pasta', labelFa: 'پاستا', labelEn: 'Pasta', kind: 'menu', isFilter: true, sortOrder: 24, icon: '🍝' },
  { id: 'pizza', labelFa: 'پیتزا', labelEn: 'Pizza', kind: 'menu', isFilter: true, sortOrder: 25, icon: '🍕' },
  { id: 'burger', labelFa: 'برگر', labelEn: 'Burger', kind: 'menu', isFilter: true, sortOrder: 26, icon: '🍔' },
  { id: 'sandwich', labelFa: 'ساندویچ', labelEn: 'Sandwich', kind: 'menu', isFilter: true, sortOrder: 27, icon: '🥪' },
  { id: 'steak', labelFa: 'استیک', labelEn: 'Steak', kind: 'menu', isFilter: true, sortOrder: 28, icon: '🥩' },
  { id: 'fried', labelFa: 'سوخاری', labelEn: 'Fried chicken', kind: 'menu', isFilter: true, sortOrder: 29, icon: '🍗' },
  { id: 'salad', labelFa: 'سالاد', labelEn: 'Salad', kind: 'menu', isFilter: true, sortOrder: 30, icon: '🥗' },
  { id: 'appetizer', labelFa: 'پیش غذا', labelEn: 'Appetizer', kind: 'menu', isFilter: true, sortOrder: 31, icon: '🍟' },
  { id: 'soup', labelFa: 'سوپ', labelEn: 'Soup', kind: 'menu', isFilter: false, sortOrder: 32, icon: '🍲' },
  { id: 'sushi', labelFa: 'سوشی', labelEn: 'Sushi', kind: 'menu', isFilter: true, sortOrder: 33, icon: '🍣' },
  /**
   * از داده آمد، نه از حدس: در دسته‌های نگاشت‌نشده «رژیمی»، «سلامت محور»،
   * «Healthy / سالم»، «فیتنس بار» و «ویژه گیاهخواران» تکرار شده بودند.
   * این یکی از کم‌عرضه‌ترین و پرتقاضاترین فیلترهاست.
   */
  { id: 'healthy', labelFa: 'رژیمی و گیاهی', labelEn: 'Healthy & vegan', kind: 'menu', isFilter: true, sortOrder: 34, icon: '🥬', hint: 'رژیمی، گیاهخواری، وگان' },

  // آشپزی
  { id: 'persian_food', labelFa: 'غذای ایرانی', labelEn: 'Persian food', kind: 'cuisine', isFilter: true, sortOrder: 40, icon: '🍚' },
  { id: 'kebab', labelFa: 'کباب', labelEn: 'Kebab', kind: 'cuisine', isFilter: true, sortOrder: 41, icon: '🍢' },
  { id: 'seafood', labelFa: 'غذای دریایی', labelEn: 'Seafood', kind: 'cuisine', isFilter: true, sortOrder: 42, icon: '🦐' },
  { id: 'main_dish', labelFa: 'غذای اصلی', labelEn: 'Main dish', kind: 'cuisine', isFilter: true, sortOrder: 43, icon: '🍽️' },
  { id: 'fast_food', labelFa: 'فست فود', labelEn: 'Fast food', kind: 'cuisine', isFilter: true, sortOrder: 44, icon: '🌭' },

  // سرویس
  { id: 'hookah', labelFa: 'قلیان', labelEn: 'Hookah', kind: 'service', isFilter: true, sortOrder: 50, icon: '💨' },
  { id: 'addons', labelFa: 'افزودنی', labelEn: 'Add-ons', kind: 'service', isFilter: false, sortOrder: 51, icon: '➕' },
  { id: 'service', labelFa: 'سرویس و پکیج', labelEn: 'Service', kind: 'service', isFilter: false, sortOrder: 52, icon: '🎁' },
  { id: 'other', labelFa: 'سایر', labelEn: 'Other', kind: 'menu', isFilter: false, sortOrder: 99, icon: '•' },
]

export const FACET_BY_ID = new Map(FACETS.map((facet) => [facet.id, facet]))

/**
 * قواعد تطبیق — **ترتیب مهم است، اولین منطبق برنده**.
 *
 * چند تصمیم که از داده آمده‌اند:
 *   • «قلیان» قبل از «سرویس» می‌آید، چون «سرویس قلیان» قلیان است نه سرویس.
 *   • «بدون قهوه» و «بدون کافئین» از قاعده‌ی قهوه بیرون گذاشته شده‌اند —
 *     ۱۳ دسته با این نام در داده هست.
 *   • «شیک پروتئین» شیک است؛ «پروتئین بار» نه.
 *   • «آیس کافی» و «سرد دم» قهوه‌ی سرد هستند.
 */
const FACET_RULES: FacetRule[] = [
  // سرویس — اول، چون «سرویس قلیان» باید قلیان شود
  { facetId: 'hookah', patterns: ['قلیان', 'قلیون', 'hookah', 'shisha'] },

  // رژیمی/گیاهی قبل از همه‌ی خوراکی‌ها: «سالاد رژیمی» رژیمی است نه سالاد،
  // چون کاربری که این فیلتر را می‌زند دنبال همین است.
  {
    facetId: 'healthy',
    patterns: [
      'رژیمی', 'سلامت محور', 'healthy', 'فیتنس', 'fitness', 'گیاهخوار', 'گیاه خوار',
      'وگان', 'vegan', 'وجترین', 'vegetarian', 'سالم', 'لاکتوفری', 'بدون گلوتن',
    ],
  },

  // قهوه — سرد قبل از گرم، چون هر دو کلمه‌ی «قهوه» دارند
  {
    facetId: 'brewed_coffee',
    patterns: [
      'قهوه دمی', 'قهوه های دمی', 'دمی', 'brewed', 'سرد دم', 'کولد برو', 'کلد برو',
      'cold brew', 'نچرال پرس',
    ],
  },
  {
    facetId: 'cold_coffee',
    patterns: [
      'سرد بر پایه قهوه', 'سرد برپایه قهوه', 'قهوه سرد', 'آیس کافی', 'ایس کافی',
      'cold coffee', 'coffee based cold', 'آیس کافی بار', 'فراپاچینو', 'فراپه',
    ],
  },
  {
    facetId: 'coffee',
    patterns: [
      'قهوه', 'اسپرسو', 'کافی شاپ', 'coffee', 'espresso', 'بر پایه قهوه', 'برپایه قهوه',
      'کافئین', 'آفوگاتو', 'افوگاتو', 'هات کافی', 'اسپشیالیتی', 'تک خاستگاه',
    ],
    exclude: ['بدون قهوه', 'بدون کافئین', 'نات کافئین'],
  },

  // ماچا قبل از چای — «ماچا» فنی چای است ولی کاربر جدا می‌جویدش
  { facetId: 'matcha', patterns: ['ماچا', 'matcha', 'اسپیرولینا', 'اسپرولینا', 'spirulina'] },
  {
    facetId: 'tea',
    patterns: ['چای', 'دمنوش', 'هربال', 'tea', 'herbal', 'گرم نوش', 'شربت'],
  },

  // نوشیدنی گرمِ غیرقهوه
  {
    facetId: 'hot_drinks',
    patterns: [
      'هات چاکلت', 'هات شکلات', 'شکلات داغ', 'hot chocolate', 'بدون قهوه',
      'بدون کافئین', 'نات کافئین',
      'نوشیدنی گرم', 'نوشیدنی های گرم', 'بار گرم', 'گرم بر پایه شیر', 'hot drink',
      'چاکلت', 'شکلات گرم', 'chocolate',
    ],
  },

  // سرد و ترکیبی
  { facetId: 'shake', patterns: ['شیک', 'میلک شیک', 'shake', 'گلاسه'] },
  { facetId: 'smoothie', patterns: ['اسموتی', 'smoothie'] },
  { facetId: 'juice', patterns: ['آبمیوه', 'آب میوه', 'juice', 'نچرال جوس', 'فرش بار', 'fresh bar'] },
  {
    facetId: 'mocktail',
    patterns: ['ماکتیل', 'ماکتل', 'موکتل', 'موهیتو', 'mocktail', 'فیزی', 'لیموناد'],
  },
  {
    facetId: 'soft_drinks',
    patterns: [
      'نوشابه', 'سافت درینک', 'سافت بار', 'soft drink', 'نوشیدنی سرد',
      'نوشیدنی های سرد', 'بار سرد', 'cold drink', 'دلستر', 'ماءالشعیر',
      'نوشیدنی', 'drinks', 'drink', 'beverage', 'درینک',
    ],
  },

  // خوراکی — خاص‌ها اول
  { facetId: 'sushi', patterns: ['سوشی', 'sushi'] },
  { facetId: 'pasta', patterns: ['پاستا', 'لازانیا', 'pasta', 'lasagna', 'اسپاگتی', 'spaghetti', 'نودل'] },
  { facetId: 'pizza', patterns: ['پیتزا', 'pizza'] },
  { facetId: 'burger', patterns: ['برگر', 'burger', 'همبرگر', 'اسلایدر', 'slider'] },
  {
    facetId: 'sandwich',
    patterns: [
      'ساندویچ', 'ساندویج', 'sandwich', 'چاپاتا', 'پنینی', 'panini', 'فوکاچیا',
      'رپ', 'wrap', 'هات داگ', 'hot dog', 'برگر و ساندویچ',
    ],
  },
  { facetId: 'steak', patterns: ['استیک', 'steak', 'فیله مینیون', 'ریبای'] },
  { facetId: 'fried', patterns: ['سوخاری', 'fried', 'کنتاکی', 'crispy'] },
  { facetId: 'salad', patterns: ['سالاد', 'salad'] },
  { facetId: 'soup', patterns: ['سوپ', 'soup', 'آش'] },
  { facetId: 'breakfast', patterns: ['صبحانه', 'برانچ', 'breakfast', 'brunch', 'عصرانه', 'ناشتایی'] },
  {
    facetId: 'bakery',
    patterns: [
      'بیکری', 'پیستری', 'bakery', 'pastry', 'کروسان', 'کروآسان', 'croissant',
      'نانوایی', 'شیرینی', 'نان',
    ],
  },
  {
    facetId: 'cake_dessert',
    patterns: [
      'کیک', 'دسر', 'cake', 'dessert', 'چیزکیک', 'چیز کیک', 'براونی', 'تیرامیسو',
      'کوکی', 'cookie', 'تارت', 'وافل', 'پنکیک', 'باقلوا',
    ],
  },
  { facetId: 'ice_cream', patterns: ['بستنی', 'ice cream', 'فالوده', 'یخمک', 'جلاتو', 'ژلاتو', 'gelato'] },

  // آشپزی
  { facetId: 'seafood', patterns: ['دریایی', 'seafood', 'میگو', 'ماهی', 'شریمپ', 'سالمون'] },
  {
    facetId: 'kebab',
    patterns: ['کباب', 'kebab', 'کبابی', 'جوجه', 'کوبیده', 'گریل', 'grill', 'جگر'],
  },
  {
    facetId: 'persian_food',
    patterns: [
      'غذای ایرانی', 'غذا ایرانی', 'ایرانی', 'iranian', 'persian', 'چلو', 'پلو',
      'ته چین', 'دیزی', 'خورش', 'خورشت', 'ایرونی',
    ],
  },
  /**
   * پیش غذا **قبل از** «غذای اصلی» می‌آید.
   *
   * الگوی `غذا` در «غذای اصلی» هست و «پیش غذا» هم شامل آن است. با ترتیب
   * برعکس، پرتکرارترین دسته‌ی کل داده (۹۵ مورد «پیش غذا») به «غذای اصلی»
   * می‌رفت. تست این مورد وجود دارد و همین باگ را گرفت.
   */
  {
    facetId: 'appetizer',
    patterns: [
      'پیش غذا', 'پیشغذا', 'appetizer', 'starter', 'مخلفات', 'دیپ', 'مزه',
      'تنقلات', 'میان وعده', 'المقبلات', 'سالاد بار',
    ],
  },
  {
    facetId: 'fast_food',
    patterns: [
      'فست فود', 'fast food', 'سیب زمینی', 'french fries', 'تاکو', 'taco',
      'سوسیس', 'کالباس', 'ژامبون', 'اسنک', 'snack',
    ],
  },
  {
    facetId: 'main_dish',
    patterns: [
      'غذای اصلی', 'غذاهای اصلی', 'main course', 'main dish', 'خوراک', 'پرسی',
      'بشقاب', 'plate', 'پلیت', 'دیس', 'سینی', 'غذا', 'food', 'kitchen',
      'ناهار', 'نهار', 'شام', 'lunch', 'dinner', 'منو رستوران', 'چیکن', 'chicken',
    ],
    // گاردِ دوم روی همان تله‌ی «پیش غذا» — حتی اگر ترتیب قواعد جابه‌جا شود.
    exclude: ['پیش غذا', 'پیشغذا'],
  },

  // افزودنی و سرویس — آخر، چون عام‌ترین‌اند
  {
    facetId: 'addons',
    patterns: [
      'افزودنی', 'اضافات', 'افزودنی ها', 'تاپینگ', 'topping', 'سیروپ', 'syrup',
      'سس', 'sauce', 'additive', 'extera', 'extra', 'اکسسوری', 'بسته بندی',
    ],
  },
  {
    facetId: 'service',
    patterns: [
      'سرویس', 'service', 'پکیج', 'package', 'تشریفات', 'رزرواسیون', 'منوی ویژه',
      'منو ویژه', 'special', 'ویترین', 'نمونه کار', 'accessor', 'اکسسوری',
      'پیشبند', 'پوشاک', 'عطر', 'ادکلن',
    ],
  },
]

/** الگوها یک‌بار کامپایل می‌شوند، نه در هر تطبیق. */
const COMPILED_RULES = FACET_RULES.map((rule) => ({
  facetId: rule.facetId,
  patterns: rule.patterns.map(compilePattern).filter((p): p is CompiledPattern => p !== null),
  exclude: (rule.exclude ?? [])
    .map(compilePattern)
    .filter((p): p is CompiledPattern => p !== null),
}))

/**
 * نام دسته‌ی منو → شناسه‌ی facet.
 *
 * `null` یعنی هیچ قاعده‌ای منطبق نشد. صدازننده باید آن را در گزارش بیاورد،
 * نه اینکه بی‌صدا به «سایر» بیندازد — نام‌های نگاشت‌نشده ورودی بهبود واژگان‌اند.
 */
export function matchFacet(sectionName: string): string | null {
  const squashed = squashFa(sectionName)
  const spaced = normalizeFa(sectionName)
  if (!squashed) return null

  for (const rule of COMPILED_RULES) {
    if (rule.exclude.some((pattern) => patternHits(pattern, squashed, spaced))) continue
    if (rule.patterns.some((pattern) => patternHits(pattern, squashed, spaced))) {
      return rule.facetId
    }
  }
  return null
}

// ═══════════════════════════════════════════════════════════════════════
// کاتالوگ دیش
// ═══════════════════════════════════════════════════════════════════════

export interface DishDef {
  slug: string
  nameFa: string
  nameEn?: string
  facetId: string
  /**
   * چیزهایی که در نام آیتم ممکن است نوشته شده باشد.
   *
   * تطبیق با **بلندترین alias** انجام می‌شود، نه اولین: «آیس لاته نارگیل»
   * باید به «آیس لاته» بخورد نه به «لاته». بدون این قاعده، هر نوشیدنی سردی
   * لاته‌ی گرم شمرده می‌شد.
   */
  aliases: string[]
  /** روی «بهترین X نزدیک من» پیشنهاد شود؟ از تحلیل داده تنظیم می‌شود. */
  popular?: boolean
}

export const DISHES: DishDef[] = [
  // ── قهوه‌ی گرم
  { slug: 'espresso', nameFa: 'اسپرسو', nameEn: 'Espresso', facetId: 'coffee', aliases: ['اسپرسو', 'espresso', 'اسپرسو سینگل', 'اسپرسو دوبل'], popular: true },
  { slug: 'americano', nameFa: 'آمریکانو', nameEn: 'Americano', facetId: 'coffee', aliases: ['آمریکانو', 'امریکانو', 'americano'], popular: true },
  { slug: 'latte', nameFa: 'لاته', nameEn: 'Latte', facetId: 'coffee', aliases: ['لاته', 'latte', 'کافه لاته'], popular: true },
  { slug: 'cappuccino', nameFa: 'کاپوچینو', nameEn: 'Cappuccino', facetId: 'coffee', aliases: ['کاپوچینو', 'کاپوچینو', 'cappuccino'], popular: true },
  { slug: 'mocha', nameFa: 'موکا', nameEn: 'Mocha', facetId: 'coffee', aliases: ['موکا', 'mocha', 'کافه موکا'], popular: true },
  { slug: 'cortado', nameFa: 'کورتادو', nameEn: 'Cortado', facetId: 'coffee', aliases: ['کورتادو', 'cortado'] },
  { slug: 'flat-white', nameFa: 'فلت وایت', nameEn: 'Flat white', facetId: 'coffee', aliases: ['فلت وایت', 'flat white'] },
  { slug: 'affogato', nameFa: 'آفوگاتو', nameEn: 'Affogato', facetId: 'coffee', aliases: ['آفوگاتو', 'افوگاتو', 'affogato'], popular: true },
  { slug: 'macchiato', nameFa: 'ماکیاتو', nameEn: 'Macchiato', facetId: 'coffee', aliases: ['ماکیاتو', 'macchiato', 'کارامل ماکیاتو'] },
  { slug: 'turkish-coffee', nameFa: 'قهوه ترک', nameEn: 'Turkish coffee', facetId: 'coffee', aliases: ['قهوه ترک', 'ترک', 'turkish'] },
  { slug: 'brewed-coffee', nameFa: 'قهوه دمی', nameEn: 'Brewed coffee', facetId: 'brewed_coffee', aliases: ['قهوه دمی', 'v60', 'وی 60', 'کمکس', 'chemex', 'ایروپرس', 'aeropress', 'فرنچ پرس', 'french press'], popular: true },
  { slug: 'cold-brew', nameFa: 'کولد برو', nameEn: 'Cold brew', facetId: 'brewed_coffee', aliases: ['کولد برو', 'cold brew', 'سرد دم'] },

  // ── قهوه‌ی سرد
  { slug: 'iced-latte', nameFa: 'آیس لاته', nameEn: 'Iced latte', facetId: 'cold_coffee', aliases: ['آیس لاته', 'ایس لاته', 'iced latte'], popular: true },
  { slug: 'iced-americano', nameFa: 'آیس آمریکانو', nameEn: 'Iced americano', facetId: 'cold_coffee', aliases: ['آیس آمریکانو', 'آیس امریکانو', 'ایس امریکانو', 'iced americano'], popular: true },
  { slug: 'iced-mocha', nameFa: 'آیس موکا', nameEn: 'Iced mocha', facetId: 'cold_coffee', aliases: ['آیس موکا', 'ایس موکا', 'iced mocha'], popular: true },
  { slug: 'iced-coffee', nameFa: 'آیس کافی', nameEn: 'Iced coffee', facetId: 'cold_coffee', aliases: ['آیس کافی', 'ایس کافی', 'iced coffee', 'آیس اسپرسو'] },
  { slug: 'frappe', nameFa: 'فراپه', nameEn: 'Frappe', facetId: 'cold_coffee', aliases: ['فراپه', 'فراپاچینو', 'frappe', 'frappuccino'] },

  // ── ماچا
  { slug: 'matcha-latte', nameFa: 'ماچا لاته', nameEn: 'Matcha latte', facetId: 'matcha', aliases: ['ماچا لاته', 'matcha latte'], popular: true },
  { slug: 'iced-matcha', nameFa: 'آیس ماچا', nameEn: 'Iced matcha', facetId: 'matcha', aliases: ['آیس ماچا', 'ایس ماچا', 'آیس لاته ماچا', 'iced matcha'], popular: true },

  // ── چای
  { slug: 'black-tea', nameFa: 'چای سیاه', facetId: 'tea', aliases: ['چای سیاه', 'چای کلاسیک', 'black tea'] },
  { slug: 'green-tea', nameFa: 'چای سبز', facetId: 'tea', aliases: ['چای سبز', 'green tea'] },
  { slug: 'masala-tea', nameFa: 'چای ماسالا', facetId: 'tea', aliases: ['چای ماسالا', 'ماسالا', 'masala'], popular: true },
  { slug: 'karak-tea', nameFa: 'چای کرک', facetId: 'tea', aliases: ['چای کرک', 'کرک', 'karak'], popular: true },
  { slug: 'saffron-tea', nameFa: 'چای زعفران', facetId: 'tea', aliases: ['چای زعفران', 'چای زعفرانی'] },
  { slug: 'herbal-tea', nameFa: 'دمنوش', facetId: 'tea', aliases: ['دمنوش', 'گل گاو زبان', 'به لیمو', 'چای ترش', 'herbal'] },

  // ── نوشیدنی گرم
  { slug: 'hot-chocolate', nameFa: 'هات چاکلت', nameEn: 'Hot chocolate', facetId: 'hot_drinks', aliases: ['هات چاکلت', 'هات شکلات', 'شکلات داغ', 'hot chocolate'], popular: true },
  { slug: 'honey-milk', nameFa: 'شیر عسل', facetId: 'hot_drinks', aliases: ['شیر عسل', 'شیر عسل دارچین'] },

  // ── ماکتیل و سرد
  { slug: 'mojito', nameFa: 'موهیتو', nameEn: 'Mojito', facetId: 'mocktail', aliases: ['موهیتو', 'موخیتو', 'mojito'], popular: true },
  {
    slug: 'packaged-lemonade',
    nameFa: 'لیموناد بسته‌بندی',
    nameEn: 'Packaged lemonade',
    facetId: 'soft_drinks',
    aliases: [
      'لیموناد شیشه ای', 'لیموناد شیشه‌ای', 'لیموناد شیشه', 'لیموناد بطری',
      'ليموناد بطري', 'لیموناد قوطی', 'لیموناد پت', 'پت لیموناد', 'لیموناد خانواده',
      'لیموناد 1 لیتری', 'لیموناد یک لیتری', 'نوشابه لیموناد', 'لیموناد خوشگوار',
      'لیموناد زمزم', 'لیموناد چی لایف', 'bottled lemonade', 'canned lemonade',
    ],
  },
  { slug: 'lemonade', nameFa: 'لیموناد طبیعی', nameEn: 'Fresh lemonade', facetId: 'mocktail', aliases: ['لیموناد', 'lemonade'], popular: true },
  { slug: 'pina-colada', nameFa: 'پیناکولادا', facetId: 'mocktail', aliases: ['پیناکولادا', 'پینا کولادا', 'pina colada'] },
  { slug: 'soda', nameFa: 'سودا', facetId: 'mocktail', aliases: ['سودا', 'soda', 'هی دی'] },

  // ── شیک و اسموتی
  { slug: 'chocolate-shake', nameFa: 'شیک شکلات', facetId: 'shake', aliases: ['شیک شکلات', 'شیک شکلاتی'], popular: true },
  { slug: 'nutella-shake', nameFa: 'شیک نوتلا', facetId: 'shake', aliases: ['شیک نوتلا'], popular: true },
  { slug: 'lotus-shake', nameFa: 'شیک لوتوس', facetId: 'shake', aliases: ['شیک لوتوس'] },
  { slug: 'vanilla-shake', nameFa: 'شیک وانیل', facetId: 'shake', aliases: ['شیک وانیل', 'شیک وانیلی'] },
  { slug: 'strawberry-shake', nameFa: 'شیک توت فرنگی', facetId: 'shake', aliases: ['شیک توت فرنگی'] },
  { slug: 'peanut-shake', nameFa: 'شیک بادام زمینی', facetId: 'shake', aliases: ['شیک بادام زمینی', 'شیک بادوم زمینی'] },
  { slug: 'smoothie', nameFa: 'اسموتی', facetId: 'smoothie', aliases: ['اسموتی', 'smoothie'], popular: true },

  // ── صبحانه
  { slug: 'english-breakfast', nameFa: 'صبحانه انگلیسی', facetId: 'breakfast', aliases: ['صبحانه انگلیسی', 'english breakfast', 'دی لایت انگلیسی'], popular: true },
  { slug: 'omelette', nameFa: 'املت', facetId: 'breakfast', aliases: ['املت', 'omelette', 'omelet'], popular: true },
  { slug: 'nimro', nameFa: 'نیمرو', facetId: 'breakfast', aliases: ['نیمرو', 'نیم رو'] },
  { slug: 'pancake', nameFa: 'پنکیک', facetId: 'breakfast', aliases: ['پنکیک', 'pancake'], popular: true },
  { slug: 'french-toast', nameFa: 'فرنچ تست', facetId: 'breakfast', aliases: ['فرنچ تست', 'french toast'] },
  { slug: 'granola', nameFa: 'گرانولا', facetId: 'breakfast', aliases: ['گرانولا', 'granola'] },
  { slug: 'waffle', nameFa: 'وافل', facetId: 'breakfast', aliases: ['وافل', 'waffle'] },

  // ── بیکری
  { slug: 'croissant', nameFa: 'کروسان', nameEn: 'Croissant', facetId: 'bakery', aliases: ['کروسان', 'کروآسان', 'croissant'], popular: true },
  { slug: 'cinnamon-roll', nameFa: 'رول دارچین', facetId: 'bakery', aliases: ['رول دارچین', 'سینامون رول', 'cinnamon roll'] },
  { slug: 'simit', nameFa: 'سیمیت', facetId: 'bakery', aliases: ['سیمیت', 'simit'] },
  { slug: 'garlic-bread', nameFa: 'نان سیر', facetId: 'appetizer', aliases: ['نان سیر', 'garlic bread'] },

  // ── دسر
  { slug: 'cheesecake', nameFa: 'چیزکیک', nameEn: 'Cheesecake', facetId: 'cake_dessert', aliases: ['چیزکیک', 'چیز کیک', 'cheesecake', 'سن سباستین'], popular: true },
  { slug: 'tiramisu', nameFa: 'تیرامیسو', facetId: 'cake_dessert', aliases: ['تیرامیسو', 'tiramisu'], popular: true },
  { slug: 'brownie', nameFa: 'براونی', facetId: 'cake_dessert', aliases: ['براونی', 'brownie'] },
  { slug: 'carrot-cake', nameFa: 'کیک هویج', facetId: 'cake_dessert', aliases: ['کیک هویج', 'کیک هویج گردو'] },
  { slug: 'chocolate-cake', nameFa: 'کیک شکلاتی', facetId: 'cake_dessert', aliases: ['کیک شکلاتی', 'کیک شکلات'] },
  { slug: 'three-milk-cake', nameFa: 'کیک سه شیر', facetId: 'cake_dessert', aliases: ['کیک سه شیر', 'سه شیر'] },
  { slug: 'baklava', nameFa: 'باقلوا', facetId: 'cake_dessert', aliases: ['باقلوا', 'باقلوا'] },
  { slug: 'cookie', nameFa: 'کوکی', facetId: 'cake_dessert', aliases: ['کوکی', 'cookie'] },
  { slug: 'ice-cream', nameFa: 'بستنی', facetId: 'ice_cream', aliases: ['بستنی', 'ice cream'], popular: true },
  { slug: 'faloodeh', nameFa: 'فالوده', facetId: 'ice_cream', aliases: ['فالوده'] },

  // ── سالاد
  { slug: 'caesar-salad', nameFa: 'سالاد سزار', nameEn: 'Caesar salad', facetId: 'salad', aliases: ['سالاد سزار', 'سزار', 'caesar'], popular: true },
  { slug: 'seasonal-salad', nameFa: 'سالاد فصل', facetId: 'salad', aliases: ['سالاد فصل'] },
  { slug: 'shirazi-salad', nameFa: 'سالاد شیرازی', facetId: 'salad', aliases: ['سالاد شیرازی'] },
  { slug: 'crab-salad', nameFa: 'سالاد کرب', facetId: 'salad', aliases: ['سالاد کرب'] },

  // ── پاستا
  { slug: 'alfredo-pasta', nameFa: 'پاستا آلفردو', nameEn: 'Alfredo pasta', facetId: 'pasta', aliases: ['آلفردو', 'الفردو', 'alfredo'], popular: true },
  { slug: 'pesto-pasta', nameFa: 'پاستا پستو', facetId: 'pasta', aliases: ['پنه چیکن پستو', 'پنه بیف پستو', 'پنه پستو', 'پاستا پستو', 'چیکن پستو پاستا', 'pesto pasta'], popular: true },
  { slug: 'penne-pasta', nameFa: 'پاستا پنه', nameEn: 'Penne pasta', facetId: 'pasta', aliases: ['پنه', 'penne'] },
  { slug: 'lasagna', nameFa: 'لازانیا', nameEn: 'Lasagna', facetId: 'pasta', aliases: ['لازانیا', 'lasagna', 'lasagne'], popular: true },
  { slug: 'spaghetti', nameFa: 'اسپاگتی', facetId: 'pasta', aliases: ['اسپاگتی', 'spaghetti'] },
  { slug: 'linguine', nameFa: 'لینگوئینی', facetId: 'pasta', aliases: ['لینگوئینی', 'linguine'] },

  // ── پیتزا
  { slug: 'pepperoni-pizza', nameFa: 'پیتزا پپرونی', nameEn: 'Pepperoni pizza', facetId: 'pizza', aliases: ['پپرونی', 'pepperoni'], popular: true },
  { slug: 'margherita-pizza', nameFa: 'پیتزا مارگاریتا', facetId: 'pizza', aliases: ['مارگاریتا', 'margherita'], popular: true },
  { slug: 'chicken-pesto-pizza', nameFa: 'پیتزا چیکن پستو', facetId: 'pizza', aliases: ['پیتزا چیکن پستو'] },
  { slug: 'roast-beef-pizza', nameFa: 'پیتزا رست بیف', facetId: 'pizza', aliases: ['پیتزا رست بیف'] },

  // ── برگر
  { slug: 'classic-burger', nameFa: 'برگر کلاسیک', facetId: 'burger', aliases: ['برگر کلاسیک', 'کلاسیک برگر', 'classic burger'], popular: true },
  { slug: 'cheeseburger', nameFa: 'چیز برگر', facetId: 'burger', aliases: ['چیز برگر', 'چیزبرگر', 'cheese burger'], popular: true },
  { slug: 'mushroom-burger', nameFa: 'ماشروم برگر', facetId: 'burger', aliases: ['ماشروم برگر', 'قارچ برگر', 'mushroom burger'], popular: true },
  { slug: 'bacon-burger', nameFa: 'بیکن برگر', facetId: 'burger', aliases: ['بیکن برگر', 'bacon burger'] },
  { slug: 'chicken-burger', nameFa: 'چیکن برگر', facetId: 'burger', aliases: ['چیکن برگر', 'برگر مرغ', 'chicken burger'] },
  { slug: 'double-burger', nameFa: 'دوبل برگر', facetId: 'burger', aliases: ['دوبل برگر', 'double burger'] },

  // ── استیک
  { slug: 'chicken-steak', nameFa: 'چیکن استیک', facetId: 'steak', aliases: ['چیکن استیک', 'استیک مرغ', 'chicken steak'], popular: true },
  { slug: 'filet-mignon', nameFa: 'فیله مینیون', facetId: 'steak', aliases: ['فیله مینیون', 'filet mignon'] },
  { slug: 'ribeye', nameFa: 'ریبای', facetId: 'steak', aliases: ['ریبای', 'ribeye'] },
  { slug: 'beef-steak', nameFa: 'استیک گوشت', facetId: 'steak', aliases: ['استیک گوشت', 'استیک بیف', 'رست بیف', 'roast beef'] },

  // ── ساندویچ
  { slug: 'club-sandwich', nameFa: 'کلاب ساندویچ', facetId: 'sandwich', aliases: ['کلاب ساندویچ', 'club sandwich'] },
  { slug: 'hot-dog', nameFa: 'هات داگ', facetId: 'sandwich', aliases: ['هات داگ', 'hot dog'] },
  { slug: 'chapata', nameFa: 'چاپاتا', facetId: 'sandwich', aliases: ['چاپاتا', 'ciabatta'] },

  // ── پیش غذا و سوخاری
  { slug: 'french-fries', nameFa: 'سیب زمینی سرخ کرده', facetId: 'appetizer', aliases: ['سیب زمینی', 'فرنچ فرایز', 'french fries'], popular: true },
  { slug: 'fried-mushroom', nameFa: 'قارچ سوخاری', facetId: 'fried', aliases: ['قارچ سوخاری'], popular: true },
  { slug: 'fried-chicken', nameFa: 'مرغ سوخاری', facetId: 'fried', aliases: ['مرغ سوخاری', 'چیکن استریپس', 'fried chicken'] },
  { slug: 'olive-tapenade', nameFa: 'زیتون پرورده', facetId: 'appetizer', aliases: ['زیتون پرورده'] },
  { slug: 'yogurt-dip', nameFa: 'ماست موسیر', facetId: 'appetizer', aliases: ['ماست موسیر', 'ماست و خیار'] },
  { slug: 'barley-soup', nameFa: 'سوپ جو', facetId: 'soup', aliases: ['سوپ جو'] },

  // ── ایرانی
  { slug: 'chelo-kabab', nameFa: 'چلو کباب', facetId: 'kebab', aliases: ['چلو کباب', 'چلوکباب'], popular: true },
  { slug: 'kabab-koubideh', nameFa: 'کباب کوبیده', facetId: 'kebab', aliases: ['کوبیده', 'کباب لقمه'], popular: true },
  { slug: 'joje-kabab', nameFa: 'جوجه کباب', facetId: 'kebab', aliases: ['جوجه کباب', 'جوجه'] },
  { slug: 'chelo-morgh', nameFa: 'چلو مرغ', facetId: 'persian_food', aliases: ['چلو مرغ'] },
  { slug: 'dizi', nameFa: 'دیزی', facetId: 'persian_food', aliases: ['دیزی', 'آبگوشت'] },
  { slug: 'tahchin', nameFa: 'ته چین', facetId: 'persian_food', aliases: ['ته چین', 'تهچین'] },

  // ── قلیان
  { slug: 'hookah', nameFa: 'قلیان', facetId: 'hookah', aliases: ['قلیان', 'قلیون', 'hookah'], popular: true },
]

/** الگوهای دیش، مرتب‌شده از بلند به کوتاه — تطبیقِ بلندترین برنده است. */
interface CompiledDish {
  slug: string
  facetId: string
  /** طول alias خام — معیار «بلندترین تطابق». */
  length: number
  pattern: CompiledPattern
}

const COMPILED_DISHES: CompiledDish[] = DISHES.flatMap((dish) =>
  dish.aliases.flatMap((alias) => {
    const pattern = compilePattern(alias)
    if (!pattern) return []
    return [{ slug: dish.slug, facetId: dish.facetId, length: alias.trim().length, pattern }]
  }),
).sort((a, b) => b.length - a.length)

export const DISH_BY_SLUG = new Map(DISHES.map((dish) => [dish.slug, dish]))

/**
 * نام آیتم منو → slug دیش.
 *
 * ═══ دو قاعده که دقت را می‌سازند ═══
 *
 * ۱. **بلندترین alias برنده است.** «آیس لاته نارگیل» به `iced-latte` می‌خورد
 *    نه به `latte`. بدون این، ۳۴ آیتم «آیس لاته نارگیل» به‌عنوان لاته‌ی گرم
 *    شمرده می‌شدند.
 *
 * ۲. **facet دسته، تطبیق را جهت می‌دهد.** «کیک لاته» در دسته‌ی «کیک و دسر»
 *    نباید لاته شمرده شود. اگر facet دسته معلوم باشد، اول بین دیش‌های همان
 *    facet جست‌وجو می‌شود و فقط اگر چیزی پیدا نشد، بین همه.
 */
export function matchDish(
  itemName: string,
  sectionFacetId?: string | null,
  context: DishMatchContext = {},
): string | null {
  const squashed = squashFa(itemName)
  const spaced = normalizeFa(itemName)
  if (!squashed) return null

  /*
   * «لیموناد» در دادهٔ منبع دو محصول متفاوت است:
   *   ۱) نوشیدنی تازه/ماکتیل که معمولاً فقط «لیموناد» نوشته می‌شود؛
   *   ۲) بطری، شیشه یا قوطیِ شرکتی که هم‌ردهٔ نوشابه است.
   *
   * نام صریح بسته‌بندی همیشه قطعی است. برای نام کاملاً ساده فقط وقتی آن را
   * بسته‌بندی می‌دانیم که هم دسته soft_drinks باشد و هم قیمت در محدودهٔ
   * نوشابه باشد؛ در دستهٔ ماکتیل حتی قیمت پایین، طبیعی باقی می‌ماند.
   */
  const lemonadeHit = squashed.includes(squashFa('لیموناد')) || /(?:^|\s)lemonade/.test(spaced)
  if (lemonadeHit) {
    const packagedSignals = [
      'شیشه', 'بطری', 'قوطی', 'پت', 'خانواده', '1لیتری', 'یکلیتری',
      'نوشابه', 'خوشگوار', 'زمزم', 'چیلایف', 'bottled', 'canned', 'bottle', 'can',
    ]
    const explicitPackaged = packagedSignals.some((signal) =>
      LATIN_ONLY.test(signal) ? spaced.includes(signal) : squashed.includes(squashFa(signal)),
    )
    const plainName = squashed === squashFa('لیموناد') || spaced === 'lemonade'
    // در دادهٔ فعلی «لیموناد کوچک» در دستهٔ نوشابه و با قیمت بطری ثبت شده
    // است؛ این عنوان سایزِ ماکتیل نیست و نباید کف قیمت لیموناد طبیعی را خراب کند.
    const packagedSizeName = squashed === squashFa('لیموناد کوچک')
    const sectionSquashed = squashFa(context.sectionName ?? '')
    const packagedSection = ['یخچالی', 'شرکتی', 'کنار غذا', 'مخلفات'].some((signal) =>
      sectionSquashed.includes(squashFa(signal)),
    )
    const lowPricedGeneric = plainName
      && sectionFacetId === 'soft_drinks'
      && (
        packagedSection
        || (context.price !== null && context.price !== undefined && context.price <= 110_000)
      )
    if (explicitPackaged || packagedSizeName || lowPricedGeneric) return 'packaged-lemonade'
  }

  // ── پاس اول: فقط دیش‌های همان facet. دقیق‌ترین حالت.
  if (sectionFacetId) {
    for (const dish of COMPILED_DISHES) {
      if (dish.facetId !== sectionFacetId) continue
      if (patternHits(dish.pattern, squashed, spaced)) return dish.slug
    }
  }

  // ── پاس دوم: همه‌ی دیش‌ها، ولی تطابقِ ناسازگار رد می‌شود.
  const sectionKind = sectionFacetId ? FACET_BY_ID.get(sectionFacetId)?.kind : undefined
  for (const dish of COMPILED_DISHES) {
    if (!patternHits(dish.pattern, squashed, spaced)) continue
    if (sectionKind && !isCompatible(sectionKind, dish.facetId)) continue
    return dish.slug
  }
  return null
}

/**
 * آیا دیشی از این facet می‌تواند در دسته‌ای از این نوع باشد؟
 *
 * جلوی یک کلاس خطای مشخص را می‌گیرد: «کیک لاته» در دسته‌ی «کیک و دسر» نباید
 * به دیش `latte` نسبت داده شود، وگرنه «بهترین لاته‌ی نزدیک من» کافه‌هایی را
 * پیشنهاد می‌دهد که فقط یک کیک با آن نام دارند.
 *
 * قاعده: نوشیدنی و خوراکی با هم قاطی نمی‌شوند. دسته‌های `service` (افزودنی،
 * سرویس، سایر) سطلِ همه‌چیزند، پس محدودیتی برایشان اعمال نمی‌شود.
 */
function isCompatible(sectionKind: FacetKind, dishFacetId: string): boolean {
  const dishKind = FACET_BY_ID.get(dishFacetId)?.kind
  if (!dishKind) return true
  if (sectionKind === 'service' || dishKind === 'service') return true
  const sectionIsDrink = sectionKind === 'drink'
  const dishIsDrink = dishKind === 'drink'
  return sectionIsDrink === dishIsDrink
}
