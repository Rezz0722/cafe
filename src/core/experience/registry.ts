import { ATTRIBUTE_BY_ID } from '@/core/taxonomy/attributes'

export type ExperienceSlug =
  | 'work'
  | 'date'
  | 'gathering'
  | 'birthday'
  | 'desserts'
  | 'healthy'
  | 'breakfast'
  | 'study'
  | 'outdoor'
  | 'late-night'
  | 'photogenic'
  | 'calm'
  | 'specialty-coffee'

export type ExperienceIcon = 'laptop' | 'heart' | 'users' | 'cake' | 'dessert' | 'salad' | 'sunrise' | 'book' | 'trees' | 'moon' | 'camera' | 'leaf' | 'coffee'

export interface ExperienceDefinition {
  slug: ExperienceSlug
  title: string
  shortTitle: string
  description: string
  adminQuestion: string
  primaryAttributeId: string
  supportingAttributeIds: readonly string[]
  supportingFacetIds?: readonly string[]
  image: string
  imageAlt: string
  icon: ExperienceIcon
  accent: string
  /** صفحه با کمتر از این تعداد برای موتور جست‌وجو noindex می‌ماند. */
  minIndexCandidates: number
}

/**
 * Experience یک مفهوم تحریریه‌ای است، نه تگ تازه. هر ورودی روی یک سیگنال
 * اصلیِ قابل ثبت سوار می‌شود و سیگنال‌های کمکی فقط رتبه و «دلیل پیشنهاد» را
 * بهتر می‌کنند. این جدایی اجازه می‌دهد بعداً evidence کاربر یا AI را بدون
 * عوض‌کردن URL و زبان محصول وارد place_attribute کنیم.
 */
export const EXPERIENCES: readonly ExperienceDefinition[] = [
  {
    slug: 'work',
    title: 'کافه‌های مناسب کار و لپ‌تاپ',
    shortTitle: 'برای کار',
    description: 'گزینه‌هایی با فضای مناسب نشستن و کار؛ جزئیات پریز، اینترنت و آرامش هر کافه جداگانه نمایش داده می‌شود.',
    adminQuestion: 'آیا میز و فضای این کافه واقعاً برای کار با لپ‌تاپ مناسب است؟',
    primaryAttributeId: 'laptop_friendly',
    supportingAttributeIds: ['power_outlets', 'fast_wifi', 'long_stay_ok', 'quiet'],
    image: '/experiences/work.webp',
    imageAlt: 'میز کار با لپ‌تاپ در فضای روشن یک کافه',
    icon: 'laptop',
    accent: '#2967d6',
    minIndexCandidates: 5,
  },
  {
    slug: 'date',
    title: 'کافه‌های مناسب قرار',
    shortTitle: 'برای قرار',
    description: 'کافه‌هایی که بر اساس فضای ثبت‌شده، چیدمان و حال‌وهوای محیط می‌توانند برای یک قرار دونفره مناسب باشند.',
    adminQuestion: 'آیا فضا و چیدمان این کافه برای یک قرار دونفره مناسب است؟',
    primaryAttributeId: 'good_for_date',
    supportingAttributeIds: ['cozy', 'upscale', 'outdoor'],
    image: '/experiences/date.webp',
    imageAlt: 'میز دونفره گرم و دنج در کافه',
    icon: 'heart',
    accent: '#a33b5c',
    minIndexCandidates: 5,
  },
  {
    slug: 'gathering',
    title: 'کافه‌های مناسب دورهمی',
    shortTitle: 'برای دورهمی',
    description: 'کاندیدهایی با شواهدی از ظرفیت، چیدمان یا خدمات مناسب جمع دوستانه؛ ادعای کیفیت یا رتبه‌بندی نیست.',
    adminQuestion: 'آیا این کافه برای دورهمی دوستانه مناسب است؟ آیا ظرفیت، رزرو یا خدمات گروهی آن تأیید شده؟',
    primaryAttributeId: 'good_for_gathering',
    supportingAttributeIds: ['birthday_friendly', 'vip_room', 'outdoor', 'upscale'],
    image: '/experiences/gathering.webp',
    imageAlt: 'جمع دوستانه دور یک میز در کافه',
    icon: 'users',
    accent: '#7a4d8f',
    minIndexCandidates: 5,
  },
  {
    slug: 'birthday',
    title: 'کافه‌های مناسب تولد',
    shortTitle: 'برای تولد',
    description: 'کاندیدهایی که امکان جشن یا نشانه‌ای از خدمات تولد برایشان ثبت شده است؛ هماهنگی و رزرو قبلی ضروری است.',
    adminQuestion: 'آیا کافه برای برگزاری تولد یا مراسم کوچک، ظرفیت و هماهنگی مشخص دارد؟',
    primaryAttributeId: 'birthday_friendly',
    supportingAttributeIds: ['good_for_gathering', 'vip_room', 'outdoor', 'desserts'],
    image: '/experiences/birthday.webp',
    imageAlt: 'کیک تولد و قهوه روی میز کافه',
    icon: 'cake',
    accent: '#b55b70',
    minIndexCandidates: 5,
  },
  {
    slug: 'desserts',
    title: 'کافه‌های مناسب دسر و شیرینی',
    shortTitle: 'برای دسر',
    description: 'کاندیدهایی که در منوی ثبت‌شده، کیک، دسر، شیرینی یا پیستری دارند؛ موجودی و تازگی را همان روز بررسی کن.',
    adminQuestion: 'آیا منوی جاری این کافه دسر، کیک، شیرینی یا پیستری قابل‌توجه دارد؟',
    primaryAttributeId: 'desserts',
    supportingAttributeIds: ['birthday_friendly', 'good_for_date'],
    image: '/experiences/desserts.webp',
    imageAlt: 'کیک و شیرینی در کنار قهوه روی میز کافه',
    icon: 'dessert',
    accent: '#a86646',
    minIndexCandidates: 5,
  },
  {
    slug: 'healthy',
    title: 'کافه‌ها و رستوران‌های سالم',
    shortTitle: 'برای غذای سالم',
    description: 'کاندیدهایی با گزینه‌های سالم، گیاهی یا رژیمی در منوی ثبت‌شده؛ نیازهای پزشکی یا رژیم تخصصی را جداگانه بررسی کن.',
    adminQuestion: 'آیا منوی جاری گزینه‌های سالم، گیاهی یا رژیمی مشخص دارد؟',
    primaryAttributeId: 'healthy_options',
    supportingAttributeIds: ['breakfast', 'desserts'],
    image: '/experiences/healthy.webp',
    imageAlt: 'بشقاب غذای سالم و نوشیدنی تازه در کافه',
    icon: 'salad',
    accent: '#4d8062',
    minIndexCandidates: 5,
  },
  {
    slug: 'breakfast',
    title: 'کافه‌های مناسب صبحانه',
    shortTitle: 'برای صبحانه',
    description: 'کاندیدهایی که صبحانه یا برانچ در منوی ثبت‌شده‌شان وجود دارد؛ ساعت سرو هر شعبه را جدا بررسی کن.',
    adminQuestion: 'آیا صبحانه یا برانچ این کافه در منوی جاری و ساعت قابل استفاده ثبت شده است؟',
    primaryAttributeId: 'breakfast',
    supportingAttributeIds: ['good_for_gathering', 'outdoor'],
    image: '/experiences/breakfast.webp',
    imageAlt: 'صبحانه و قهوه روی میز کافه',
    icon: 'sunrise',
    accent: '#c8752f',
    minIndexCandidates: 5,
  },
  {
    slug: 'study',
    title: 'کافه‌های مناسب مطالعه',
    shortTitle: 'برای مطالعه',
    description: 'کافه‌هایی با سیگنال مطالعه یا فضای کتاب؛ سکوت، پریز و ماندن طولانی باید جداگانه تأیید شود.',
    adminQuestion: 'آیا فضای این کافه برای مطالعه مناسب است و این موضوع از منبع معتبر تأیید شده؟',
    primaryAttributeId: 'good_for_study',
    supportingAttributeIds: ['quiet', 'laptop_friendly', 'long_stay_ok'],
    image: '/experiences/study.webp',
    imageAlt: 'کتاب و قهوه روی میز مطالعه در کافه',
    icon: 'book',
    accent: '#496b85',
    minIndexCandidates: 5,
  },
  {
    slug: 'outdoor',
    title: 'کافه‌های دارای فضای باز و منظره',
    shortTitle: 'برای فضای باز',
    description: 'کاندیدهایی با فضای بیرونی یا دید ثبت‌شده؛ وضعیت فصلی و شرایط آب‌وهوا را پیش از مراجعه بررسی کن.',
    adminQuestion: 'آیا فضای باز یا منظره این کافه در منبع معتبر و برای شعبه فعلی تأیید شده؟',
    primaryAttributeId: 'outdoor',
    supportingAttributeIds: ['scenic_view', 'photogenic', 'good_for_gathering'],
    image: '/experiences/outdoor.webp',
    imageAlt: 'میز کافه در فضای باز با منظره شهری',
    icon: 'trees',
    accent: '#4d8062',
    minIndexCandidates: 5,
  },
  {
    slug: 'late-night',
    title: 'کافه‌های باز تا نیمه‌شب',
    shortTitle: 'برای شب‌نشینی',
    description: 'کاندیدهایی که ساعت تعطیلی دیرهنگام برایشان ثبت شده است؛ ساعت همان روز را پیش از حرکت بررسی کن.',
    adminQuestion: 'آیا این شعبه معمولاً تا نیمه‌شب یا بعد از آن باز است و ساعت آن اخیراً تأیید شده؟',
    primaryAttributeId: 'open_late',
    supportingAttributeIds: ['good_for_gathering', 'lively', 'desserts'],
    image: '/experiences/late-night.webp',
    imageAlt: 'قهوه و دسر در فضای گرم کافه در شب',
    icon: 'moon',
    accent: '#42527a',
    minIndexCandidates: 5,
  },
  {
    slug: 'photogenic',
    title: 'کافه‌های مناسب عکاسی',
    shortTitle: 'برای عکس',
    description: 'فضاهایی با نور، طراحی یا جزئیات بصری قابل‌توجه؛ بدون ادعای رتبه‌بندی یا «اینستاگرامی‌ترین» بودن.',
    adminQuestion: 'آیا این کافه واقعاً فضای متمایز و مناسبی برای عکاسی دارد؟',
    primaryAttributeId: 'photogenic',
    supportingAttributeIds: ['natural_light', 'scenic_view', 'upscale'],
    image: '/experiences/photo.webp',
    imageAlt: 'گوشه‌ای خوش‌نور و چشم‌نواز از فضای کافه',
    icon: 'camera',
    accent: '#9a651d',
    minIndexCandidates: 5,
  },
  {
    slug: 'calm',
    title: 'کافه‌های آرام و کم‌سروصدا',
    shortTitle: 'برای آرامش',
    description: 'گزینه‌هایی که آرام‌بودن محیطشان ثبت شده است؛ شلوغی می‌تواند با ساعت و روز مراجعه تغییر کند.',
    adminQuestion: 'آیا این کافه در بیشتر ساعت‌های معمول، کم‌سروصدا و آرام است؟',
    primaryAttributeId: 'quiet',
    supportingAttributeIds: ['cozy', 'outdoor'],
    image: '/experiences/calm.webp',
    imageAlt: 'گوشه‌ای آرام با صندلی راحت و گیاهان در کافه',
    icon: 'leaf',
    accent: '#397157',
    minIndexCandidates: 5,
  },
  {
    slug: 'specialty-coffee',
    title: 'کافه‌های دارای قهوه تخصصی',
    shortTitle: 'برای قهوه',
    description: 'کافه‌هایی که ارائه قهوه تخصصی برایشان ثبت یا بررسی شده است؛ صرف وجود اسپرسو در منو کافی نیست.',
    adminQuestion: 'آیا شواهد مشخصی از ارائه قهوه تخصصی و دم‌آوری حرفه‌ای وجود دارد؟',
    primaryAttributeId: 'specialty_coffee',
    supportingAttributeIds: [],
    supportingFacetIds: ['brewed_coffee', 'coffee'],
    image: '/experiences/specialty-coffee.webp',
    imageAlt: 'ابزار دم‌آوری قهوه تخصصی روی بار کافه',
    icon: 'coffee',
    accent: '#6f4b32',
    minIndexCandidates: 5,
  },
] as const

export const EXPERIENCE_BY_SLUG = new Map(EXPERIENCES.map((item) => [item.slug, item]))

export const EXPERIENCE_PRIMARY_ATTRIBUTE_IDS = EXPERIENCES.map(
  (item) => item.primaryAttributeId,
)

export const EXPERIENCE_CURATION_ATTRIBUTE_IDS = [...new Set(
  EXPERIENCES.flatMap((item) => [item.primaryAttributeId, ...item.supportingAttributeIds]),
)]

export const EXPERIENCE_CURATION_ATTRIBUTES = EXPERIENCE_CURATION_ATTRIBUTE_IDS
  .map((id) => ATTRIBUTE_BY_ID.get(id))
  .filter((item) => item !== undefined)

export function isExperienceSlug(value: string): value is ExperienceSlug {
  return EXPERIENCE_BY_SLUG.has(value as ExperienceSlug)
}

export function experiencePath(slug: ExperienceSlug): string {
  return `/mashhad/experience/${slug}`
}
