/**
 * رجیستری تنظیمات سایت.
 *
 * ═══ هدف ═══
 *
 * هر عددی که «سلیقه‌ای» است — یعنی ممکن است فردا بخواهیم عوضش کنیم و
 * عوض‌کردنش نیاز به فکرِ مهندسی ندارد — باید از کد بیرون بیاید و در پنل ادمین
 * قابل ویرایش باشد. مرزِ تصمیم این است:
 *
 *   تنظیم است    → «چند روز قیمت را بیات حساب کنیم؟» ۹۰ یا ۱۲۰، هر دو درست
 *   تنظیم نیست   → «چطور شیفت شکسته را تجزیه کنیم؟» یک جواب درست دارد
 *
 * ═══ چرا تعریف در کد ولی مقدار در دیتابیس ═══
 *
 * تعریف (نوع، بازه‌ی مجاز، برچسب، پیش‌فرض) در کد است تا تایپ‌سیف باشد و
 * اعتبارسنجی از یک جا بیاید. **مقدار** در جدول `setting` است تا بدون
 * ری‌دیپلوی عوض شود. اگر کلیدی در دیتابیس نباشد، پیش‌فرضِ کد استفاده می‌شود —
 * پس سایت روی دیتابیسِ خالی هم کار می‌کند.
 *
 * ═══ افزودن تنظیم جدید ═══
 *
 * ۱. فیلد را به `Settings` اضافه کنید
 * ۲. پیش‌فرض را به `SETTING_DEFAULTS`
 * ۳. تعریف نمایشی را به `SETTING_DEFS`
 *
 * تست `settings.test.ts` بررسی می‌کند که هر سه هم‌خوان باشند، پس فراموش‌کردن
 * یکی از آن‌ها build را نمی‌شکند ولی تست را می‌شکند.
 */

export type SettingGroup =
  | 'identity'
  | 'locale'
  | 'auth'
  | 'moderation'
  | 'discovery'
  | 'map'
  | 'data'
  | 'analytics'

export const GROUP_LABELS: Record<SettingGroup, string> = {
  identity: 'هویت سایت',
  locale: 'زبان، زمان و شهر',
  auth: 'ورود و امنیت',
  moderation: 'نظرها و بازبینی',
  discovery: 'جست‌وجو و رتبه‌بندی',
  map: 'نقشه و مسیریابی',
  data: 'داده و قیمت',
  analytics: 'آمار',
}

export const GROUP_HINTS: Partial<Record<SettingGroup, string>> = {
  locale:
    'منطقه‌ی زمانی روی «الان باز است؟» اثر مستقیم دارد. نام شهر در متادیتای صفحه‌ها و داده‌ی ساخت‌یافته‌ی گوگل استفاده می‌شود.',
  auth: 'اگر سرویس پیامک در دسترس نیست، «ورود با رمز» را روشن نگه دارید — وگرنه هیچ‌کس نمی‌تواند وارد شود.',
  data: 'این اعداد روی طبقه‌بندی قیمت و تشخیص داده‌ی خراب اثر دارند. با ذخیرهٔ قواعد سطح قیمت، همهٔ مجموعه‌ها همان لحظه بازمحاسبه می‌شوند.',
  discovery:
    'مرزهای قیمت بر پایه‌ی توزیع واقعیِ داده تنظیم شده‌اند؛ عوض‌کردنشان طبقه‌بندی همه‌ی کافه‌ها را جابه‌جا می‌کند.',
}

// ═══════════════════════════════════════════════════════════════════════
// شکل تنظیمات
// ═══════════════════════════════════════════════════════════════════════

export interface Settings {
  // ── هویت
  siteName: string
  siteTagline: string
  siteDescription: string
  contactEmail: string
  contactPhone: string
  siteInstagram: string
  siteTelegram: string
  /** بنر اعلان بالای سایت. خالی = بنری نیست. */
  announcement: string
  /** سایت را برای همه جز ادمین می‌بندد. */
  maintenanceMode: boolean

  // ── زبان، زمان، شهر
  /** شناسه‌ی IANA — روی «الان باز است؟» اثر مستقیم دارد. */
  timeZone: string
  cityName: string
  regionName: string
  countryCode: string
  currencyLabel: string

  // ── ورود
  allowRegistration: boolean
  allowPasswordLogin: boolean
  allowOtpLogin: boolean
  /** پیامک هدف‌دار برای تأیید شماره در ثبت‌نام و بازیابی رمز. */
  allowSmsVerification: boolean
  /** آیا ساخت حساب عمومی باید پیش از ایجاد کاربر، شماره را با OTP تأیید کند؟ */
  registrationRequiresPhoneVerification: boolean
  passwordMinLength: number
  loginMaxAttempts: number
  loginLockoutMinutes: number
  sessionDays: number
  viewAsMinutes: number
  otpLength: number
  otpTtlSeconds: number
  otpResendCooldownSeconds: number
  otpMaxPerHour: number
  otpMaxAttempts: number
  otpMaxGlobalPerHour: number
  /** پیامک ارسال نمی‌شود؛ کد در لاگ سرور چاپ می‌شود. */
  smsDevMode: boolean

  // ── نظرها و بازبینی
  reviewsEnabled: boolean
  reviewsRequireApproval: boolean
  reviewMinTextLength: number
  reviewMaxTextLength: number
  ownerRepliesRequireApproval: boolean
  submissionsEnabled: boolean
  /** واژه‌های ممنوع، با کاما. نظر حاوی آن‌ها خودکار علامت می‌خورد. */
  reviewBlocklist: string

  // ── جست‌وجو و رتبه‌بندی
  searchPageSize: number
  defaultSort: string
  /** سقف‌های قیمت روی نوار فیلتر، با کاما (تومان). */
  priceFilterCaps: string
  /** حداقل تعداد نظر تا امتیاز خودِ مکان وزن کامل بگیرد. */
  ratingPriorCount: number
  /** امتیاز پیش‌فرض سایت تا وقتی نظری نیست. */
  defaultSiteMean: number
  popularFacetMinPlaces: number
  popularDishMinPlaces: number
  nearbyRadiusKm: number
  homeCardCount: number

  // ── نقشه
  mapCenterLat: number
  mapCenterLng: number
  mapDefaultZoom: number
  mapMinZoom: number
  mapMaxZoom: number
  /** سرویس‌های مسیریابی و ترتیبشان، با کاما. */
  routingServices: string
  showBuildingsFromZoom: number

  // ── داده و قیمت
  /** زیر این عدد، قیمت به تومان بی‌معنی است → منو «هزارتومانی» فرض می‌شود. */
  thousandUnitThreshold: number
  priceTierCheapMax: number
  priceTierMidMax: number
  /** صفر یعنی سقف خودکار غیرفعال است. */
  priceStatsMaxItemPrice: number
  /** دسته‌هایی مثل سرویس و پکیج/قلیان را از آمار قیمت مکان کنار می‌گذارد. */
  priceStatsExcludeServiceSections: boolean
  /** قیمت کمتر از این نسبت از میانه‌ی شهری، داده‌ی خراب است. */
  priceOutlierRatio: number
  /** بعد از این تعداد روز، قیمت «بیات» شمرده می‌شود. */
  stalePriceDays: number
  /** سقف فاصله برای انتساب مکان به محله (کیلومتر). */
  districtMatchMaxKm: number
  geoBboxMinLat: number
  geoBboxMaxLat: number
  geoBboxMinLng: number
  geoBboxMaxLng: number

  // ── آمار
  trackPageViews: boolean
  countBotsInStats: boolean
  pageViewRetentionDays: number
}

export const SETTING_DEFAULTS: Settings = {
  siteName: 'کو کافه',
  siteTagline: 'راهنمای کافه‌ها و رستوران‌های مشهد',
  siteDescription:
    'قیمت واقعی منو، ساعت کاری، نقشه و مسیریابی برای کافه‌ها و رستوران‌های مشهد.',
  contactEmail: '',
  contactPhone: '',
  siteInstagram: '',
  siteTelegram: '',
  announcement: '',
  maintenanceMode: false,

  timeZone: 'Asia/Tehran',
  cityName: 'مشهد',
  regionName: 'خراسان رضوی',
  countryCode: 'IR',
  currencyLabel: 'تومان',

  allowRegistration: true,
  allowPasswordLogin: true,
  allowOtpLogin: false,
  allowSmsVerification: true,
  registrationRequiresPhoneVerification: false,
  passwordMinLength: 8,
  loginMaxAttempts: 5,
  loginLockoutMinutes: 15,
  sessionDays: 30,
  viewAsMinutes: 30,
  otpLength: 5,
  otpTtlSeconds: 60,
  otpResendCooldownSeconds: 90,
  otpMaxPerHour: 5,
  otpMaxAttempts: 5,
  otpMaxGlobalPerHour: 60,
  smsDevMode: true,

  reviewsEnabled: true,
  reviewsRequireApproval: true,
  reviewMinTextLength: 0,
  reviewMaxTextLength: 4000,
  ownerRepliesRequireApproval: false,
  submissionsEnabled: true,
  reviewBlocklist: '',

  searchPageSize: 24,
  defaultSort: 'rating',
  priceFilterCaps: '200000,300000,500000,800000',
  ratingPriorCount: 20,
  defaultSiteMean: 4.2,
  popularFacetMinPlaces: 30,
  popularDishMinPlaces: 15,
  nearbyRadiusKm: 3,
  homeCardCount: 6,

  mapCenterLat: 36.2972,
  mapCenterLng: 59.6067,
  mapDefaultZoom: 12,
  mapMinZoom: 9,
  mapMaxZoom: 19,
  routingServices: 'neshan,balad,google,waze,osm',
  showBuildingsFromZoom: 16,

  thousandUnitThreshold: 5000,
  priceTierCheapMax: 250000,
  priceTierMidMax: 400000,
  priceStatsMaxItemPrice: 5000000,
  priceStatsExcludeServiceSections: false,
  priceOutlierRatio: 0.05,
  stalePriceDays: 90,
  districtMatchMaxKm: 4,
  geoBboxMinLat: 36.1,
  geoBboxMaxLat: 36.55,
  geoBboxMinLng: 59.2,
  geoBboxMaxLng: 59.85,

  trackPageViews: true,
  countBotsInStats: false,
  pageViewRetentionDays: 180,
}

export type SettingKey = keyof Settings

// ═══════════════════════════════════════════════════════════════════════
// تعریف نمایشی
// ═══════════════════════════════════════════════════════════════════════

export type SettingType = 'string' | 'text' | 'number' | 'boolean' | 'select'

export interface SettingDef {
  key: SettingKey
  group: SettingGroup
  label: string
  hint?: string
  type: SettingType
  options?: { value: string; label: string }[]
  min?: number
  max?: number
  /** برای عدد اعشاری — گام ورودی. */
  step?: number
  unit?: string
  /**
   * تغییرش تا اجرای یک عملیات اثر کامل ندارد.
   * در UI هشدار داده می‌شود، چون کاربر تغییر را می‌بیند و فکر می‌کند تمام است.
   */
  needsRecompute?: 'derived' | 'facets' | 'restart'
}

const TIME_ZONES = [
  'Asia/Tehran',
  'UTC',
  'Asia/Dubai',
  'Asia/Istanbul',
  'Europe/Berlin',
].map((zone) => ({ value: zone, label: zone }))

export const SETTING_DEFS: SettingDef[] = [
  // ── هویت
  { key: 'siteName', group: 'identity', label: 'نام سایت', type: 'string' },
  { key: 'siteTagline', group: 'identity', label: 'شعار', type: 'string' },
  {
    key: 'siteDescription',
    group: 'identity',
    label: 'توضیح پیش‌فرض',
    hint: 'در متادیتای صفحه‌ی اول و اشتراک‌گذاری استفاده می‌شود.',
    type: 'text',
  },
  { key: 'contactEmail', group: 'identity', label: 'ایمیل تماس', type: 'string' },
  { key: 'contactPhone', group: 'identity', label: 'تلفن تماس', type: 'string' },
  { key: 'siteInstagram', group: 'identity', label: 'اینستاگرام سایت', type: 'string' },
  { key: 'siteTelegram', group: 'identity', label: 'تلگرام سایت', type: 'string' },
  {
    key: 'announcement',
    group: 'identity',
    label: 'بنر اعلان',
    hint: 'خالی بگذارید تا بنری نمایش داده نشود. برای اطلاع‌رسانی موقت.',
    type: 'text',
  },
  {
    key: 'maintenanceMode',
    group: 'identity',
    label: 'حالت تعمیر',
    hint: 'سایت برای همه بسته می‌شود جز مدیرها. پنل‌ها باز می‌مانند.',
    type: 'boolean',
  },

  // ── زبان، زمان، شهر
  {
    key: 'timeZone',
    group: 'locale',
    label: 'منطقه‌ی زمانی',
    hint: 'مبنای «الان باز است؟». تغییرش بلافاصله روی همه‌ی صفحه‌ها اثر می‌کند.',
    type: 'select',
    options: TIME_ZONES,
  },
  { key: 'cityName', group: 'locale', label: 'نام شهر', type: 'string' },
  { key: 'regionName', group: 'locale', label: 'نام استان', type: 'string' },
  {
    key: 'countryCode',
    group: 'locale',
    label: 'کد کشور',
    hint: 'دوحرفی، برای داده‌ی ساخت‌یافته‌ی گوگل. مثلاً IR',
    type: 'string',
  },
  { key: 'currencyLabel', group: 'locale', label: 'واحد پول', type: 'string' },

  // ── ورود
  { key: 'allowRegistration', group: 'auth', label: 'ثبت‌نام باز است', type: 'boolean' },
  {
    key: 'allowPasswordLogin',
    group: 'auth',
    label: 'ورود با رمز',
    hint: 'خاموش‌کردنش وقتی پیامک هم کار نمی‌کند، همه را بیرون می‌گذارد.',
    type: 'boolean',
  },
  {
    key: 'allowOtpLogin',
    group: 'auth',
    label: 'ورود با کد یک‌بارمصرف',
    hint: 'فعلاً خاموش بماند؛ با روشن‌کردن، گزینهٔ ورود پیامکی کنار ورود با رمز ظاهر می‌شود.',
    type: 'boolean',
  },
  {
    key: 'allowSmsVerification',
    group: 'auth',
    label: 'پیامک ثبت‌نام و بازیابی',
    hint: 'برای تأیید مالکیت شماره در ساخت حساب و بازیابی رمز استفاده می‌شود و مستقل از روش ورود است.',
    type: 'boolean',
  },
  {
    key: 'registrationRequiresPhoneVerification',
    group: 'auth',
    label: 'تأیید شماره هنگام ثبت‌نام',
    hint: 'خاموش = ساخت حساب مستقیم با نام کاربری و رمز؛ روشن = شماره موبایل و کد تأیید هم لازم است.',
    type: 'boolean',
  },
  {
    key: 'smsDevMode',
    group: 'auth',
    label: 'حالت توسعه‌ی پیامک',
    hint: 'روشن = پیامکی ارسال نمی‌شود و کد در لاگ سرور چاپ می‌شود. برای تولید خاموشش کنید.',
    type: 'boolean',
  },
  {
    key: 'passwordMinLength',
    group: 'auth',
    label: 'حداقل طول رمز',
    type: 'number',
    min: 6,
    max: 64,
  },
  {
    key: 'loginMaxAttempts',
    group: 'auth',
    label: 'سقف تلاش ناموفق',
    type: 'number',
    min: 3,
    max: 20,
  },
  {
    key: 'loginLockoutMinutes',
    group: 'auth',
    label: 'مدت قفل ورود',
    type: 'number',
    min: 1,
    max: 1440,
    unit: 'دقیقه',
  },
  {
    key: 'sessionDays',
    group: 'auth',
    label: 'مدت اعتبار نشست',
    type: 'number',
    min: 1,
    max: 365,
    unit: 'روز',
  },
  {
    key: 'viewAsMinutes',
    group: 'auth',
    label: 'مدت «مشاهده به‌عنوان»',
    hint: 'پنجره‌ی یک کار پشتیبانی، نه یک نشست دوم.',
    type: 'number',
    min: 5,
    max: 240,
    unit: 'دقیقه',
  },
  {
    key: 'otpLength',
    group: 'auth',
    label: 'طول کد پیامکی',
    type: 'number',
    min: 4,
    max: 8,
    unit: 'رقم',
  },
  {
    key: 'otpTtlSeconds',
    group: 'auth',
    label: 'اعتبار کد',
    type: 'number',
    min: 30,
    max: 900,
    unit: 'ثانیه',
  },
  {
    key: 'otpResendCooldownSeconds',
    group: 'auth',
    label: 'فاصله‌ی ارسال دوباره',
    type: 'number',
    min: 15,
    max: 600,
    unit: 'ثانیه',
  },
  {
    key: 'otpMaxPerHour',
    group: 'auth',
    label: 'سقف کد در ساعت (هر شماره)',
    type: 'number',
    min: 1,
    max: 50,
  },
  {
    key: 'otpMaxAttempts',
    group: 'auth',
    label: 'سقف تلاش برای هر کد',
    type: 'number',
    min: 1,
    max: 10,
  },
  {
    key: 'otpMaxGlobalPerHour',
    group: 'auth',
    label: 'سقف کد در ساعت (کل سایت)',
    hint: 'جلوی سوزاندن اعتبار پیامک با چند ده شماره را می‌گیرد.',
    type: 'number',
    min: 10,
    max: 5000,
  },

  // ── نظرها
  {
    key: 'reviewsEnabled',
    group: 'moderation',
    label: 'ثبت نظر فعال است',
    type: 'boolean',
  },
  {
    key: 'reviewsRequireApproval',
    group: 'moderation',
    label: 'نظر نیاز به تأیید دارد',
    hint: 'خاموش‌کردنش یعنی نظرها بلافاصله منتشر می‌شوند — از جمله نظرهای توهین‌آمیز.',
    type: 'boolean',
  },
  {
    key: 'ownerRepliesRequireApproval',
    group: 'moderation',
    label: 'پاسخ کافه‌دار نیاز به تأیید دارد',
    type: 'boolean',
  },
  {
    key: 'submissionsEnabled',
    group: 'moderation',
    label: 'ثبت کافه توسط کاربر',
    type: 'boolean',
  },
  {
    key: 'reviewMinTextLength',
    group: 'moderation',
    label: 'حداقل طول متن نظر',
    type: 'number',
    min: 0,
    max: 500,
  },
  {
    key: 'reviewMaxTextLength',
    group: 'moderation',
    label: 'حداکثر طول متن نظر',
    type: 'number',
    min: 100,
    max: 20000,
  },
  {
    key: 'reviewBlocklist',
    group: 'moderation',
    label: 'واژه‌های ممنوع',
    hint: 'با کاما جدا کنید. نظر حاوی این واژه‌ها خودکار در صف بازبینی می‌ماند حتی اگر تأیید خودکار روشن باشد.',
    type: 'text',
  },

  // ── جست‌وجو
  {
    key: 'searchPageSize',
    group: 'discovery',
    label: 'نتیجه در هر صفحه',
    type: 'number',
    min: 6,
    max: 100,
  },
  {
    key: 'defaultSort',
    group: 'discovery',
    label: 'مرتب‌سازی پیش‌فرض',
    type: 'select',
    options: [
      { value: 'rating', label: 'محبوب‌ترین' },
      { value: 'quality', label: 'کامل‌ترین اطلاعات' },
      { value: 'price_asc', label: 'ارزان‌ترین' },
      { value: 'name', label: 'الفبا' },
    ],
  },
  {
    key: 'priceFilterCaps',
    group: 'discovery',
    label: 'سقف‌های قیمت فیلتر',
    hint: 'با کاما، به تومان. مثلاً 200000,300000,500000',
    type: 'string',
  },
  {
    key: 'ratingPriorCount',
    group: 'discovery',
    label: 'وزن پیشین امتیاز',
    hint: 'حداقل تعداد نظر تا امتیاز خودِ مکان وزن کامل بگیرد. بالاتر = محافظه‌کارتر.',
    type: 'number',
    min: 1,
    max: 200,
  },
  {
    key: 'defaultSiteMean',
    group: 'discovery',
    label: 'امتیاز پیش‌فرض سایت',
    type: 'number',
    min: 1,
    max: 5,
    step: 0.1,
  },
  {
    key: 'popularFacetMinPlaces',
    group: 'discovery',
    label: 'حداقل کافه برای facet پرمصرف',
    type: 'number',
    min: 1,
    max: 300,
    needsRecompute: 'facets',
  },
  {
    key: 'popularDishMinPlaces',
    group: 'discovery',
    label: 'حداقل کافه برای دیش پرمصرف',
    hint: '«بهترین سوشی نزدیک من» وقتی ۳ کافه سوشی دارند، بی‌فایده است.',
    type: 'number',
    min: 1,
    max: 300,
    needsRecompute: 'facets',
  },
  {
    key: 'nearbyRadiusKm',
    group: 'discovery',
    label: 'شعاع «نزدیک همین‌جا»',
    type: 'number',
    min: 1,
    max: 30,
    unit: 'کیلومتر',
  },
  {
    key: 'homeCardCount',
    group: 'discovery',
    label: 'تعداد کارت در هر بخش صفحه‌ی اول',
    type: 'number',
    min: 2,
    max: 24,
  },

  // ── نقشه
  {
    key: 'mapCenterLat',
    group: 'map',
    label: 'مرکز نقشه — عرض',
    type: 'number',
    step: 0.0001,
  },
  {
    key: 'mapCenterLng',
    group: 'map',
    label: 'مرکز نقشه — طول',
    type: 'number',
    step: 0.0001,
  },
  {
    key: 'mapDefaultZoom',
    group: 'map',
    label: 'زوم پیش‌فرض',
    type: 'number',
    min: 5,
    max: 19,
  },
  {
    key: 'mapMinZoom',
    group: 'map',
    label: 'کمینه‌ی زوم',
    type: 'number',
    min: 1,
    max: 19,
  },
  {
    key: 'mapMaxZoom',
    group: 'map',
    label: 'بیشینه‌ی زوم',
    type: 'number',
    min: 5,
    max: 22,
  },
  {
    key: 'showBuildingsFromZoom',
    group: 'map',
    label: 'نمایش ساختمان از زوم',
    hint: 'پایین‌تر بردنش نقشه را در زوم شهری کند و ناخوانا می‌کند.',
    type: 'number',
    min: 12,
    max: 19,
  },
  {
    key: 'routingServices',
    group: 'map',
    label: 'سرویس‌های مسیریابی',
    hint: 'با کاما و به ترتیب نمایش. مجاز: neshan, balad, google, waze, osm',
    type: 'string',
  },

  // ── داده و قیمت
  {
    key: 'thousandUnitThreshold',
    group: 'data',
    label: 'آستانه‌ی تشخیص «هزار تومان»',
    hint: 'اگر میانه‌ی منوی یک کافه کمتر از این باشد، قیمت‌هایش هزارتومانی فرض و ×۱۰۰۰ می‌شوند.',
    type: 'number',
    min: 100,
    max: 100000,
    needsRecompute: 'restart',
  },
  {
    key: 'priceTierCheapMax',
    group: 'data',
    label: 'سقف میانه برای رده‌ی اقتصادی',
    hint: 'اگر میانهٔ قیمت آیتم‌های مشمول تا این مقدار باشد، مجموعه «اقتصادی» است.',
    type: 'number',
    min: 10000,
    max: 5000000,
    unit: 'تومان',
    needsRecompute: 'derived',
  },
  {
    key: 'priceTierMidMax',
    group: 'data',
    label: 'سقف میانه برای رده‌ی متوسط',
    hint: 'بالاتر از سقف اقتصادی و تا این مقدار «متوسط» است؛ بیشتر از آن «گران» می‌شود.',
    type: 'number',
    min: 20000,
    max: 10000000,
    unit: 'تومان',
    needsRecompute: 'derived',
  },
  {
    key: 'priceStatsMaxItemPrice',
    group: 'data',
    label: 'بیشترین قیمت قابل‌محاسبه',
    hint: 'آیتم گران‌تر از این عدد (مثلاً دستگاه اسپرسو) خودکار از حداقل، میانه، حداکثر و ردهٔ قیمت کنار می‌رود. صفر = بدون سقف.',
    type: 'number',
    min: 0,
    max: 1000000000,
    unit: 'تومان',
    needsRecompute: 'derived',
  },
  {
    key: 'priceStatsExcludeServiceSections',
    group: 'data',
    label: 'حذف دسته‌های خدماتی از سطح قیمت',
    hint: 'آیتم‌های دسته‌های خدماتی مثل «سرویس و پکیج» و «قلیان» در آمار قیمت مجموعه محاسبه نمی‌شوند.',
    type: 'boolean',
    needsRecompute: 'derived',
  },
  {
    key: 'priceOutlierRatio',
    group: 'data',
    label: 'نسبت تشخیص قیمت پرت',
    hint: 'قیمتِ کمتر از این نسبت از میانه‌ی شهریِ همان دیش، از رتبه‌بندی «ارزان‌ترین» کنار گذاشته می‌شود.',
    type: 'number',
    min: 0.001,
    max: 0.5,
    step: 0.01,
    needsRecompute: 'facets',
  },
  {
    key: 'stalePriceDays',
    group: 'data',
    label: 'قیمت بیات بعد از',
    type: 'number',
    min: 7,
    max: 730,
    unit: 'روز',
  },
  {
    key: 'districtMatchMaxKm',
    group: 'data',
    label: 'سقف فاصله برای انتساب محله',
    type: 'number',
    min: 1,
    max: 20,
    step: 0.5,
    unit: 'کیلومتر',
  },
  {
    key: 'geoBboxMinLat',
    group: 'data',
    label: 'کادر شهر — کمینه‌ی عرض',
    type: 'number',
    step: 0.01,
  },
  {
    key: 'geoBboxMaxLat',
    group: 'data',
    label: 'کادر شهر — بیشینه‌ی عرض',
    type: 'number',
    step: 0.01,
  },
  {
    key: 'geoBboxMinLng',
    group: 'data',
    label: 'کادر شهر — کمینه‌ی طول',
    type: 'number',
    step: 0.01,
  },
  {
    key: 'geoBboxMaxLng',
    group: 'data',
    label: 'کادر شهر — بیشینه‌ی طول',
    type: 'number',
    step: 0.01,
  },

  // ── آمار
  { key: 'trackPageViews', group: 'analytics', label: 'ثبت بازدید', type: 'boolean' },
  {
    key: 'countBotsInStats',
    group: 'analytics',
    label: 'شمردن ربات‌ها در آمار',
    hint: 'روشن‌کردنش آمار را با خزنده‌های گوگل قاطی می‌کند.',
    type: 'boolean',
  },
  {
    key: 'pageViewRetentionDays',
    group: 'analytics',
    label: 'نگه‌داشتن بازدید خام',
    hint: 'بازدیدهای قدیمی‌تر با «پاک‌سازی بازدید» حذف می‌شوند.',
    type: 'number',
    min: 7,
    max: 3650,
    unit: 'روز',
  },
]

export const SETTING_DEF_BY_KEY = new Map<SettingKey, SettingDef>(
  SETTING_DEFS.map((def) => [def.key, def]),
)

// ═══════════════════════════════════════════════════════════════════════
// اعتبارسنجی
// ═══════════════════════════════════════════════════════════════════════

export interface ValidationError {
  key: SettingKey
  message: string
}

/**
 * یک مقدار خام (از فرم، همیشه رشته) را به نوع درست تبدیل و اعتبارسنجی می‌کند.
 *
 * `null` در `value` یعنی خطا داشت؛ خطا در `error` است. مقدار نامعتبر **ذخیره
 * نمی‌شود** و بقیه‌ی تنظیمات همان فرم ذخیره می‌شوند: یک عددِ اشتباه نباید
 * جلوی ذخیره‌ی نُه فیلد درست را بگیرد.
 */
export function parseSettingValue(
  key: SettingKey,
  raw: unknown,
): { value?: unknown; error?: string } {
  const def = SETTING_DEF_BY_KEY.get(key)
  if (!def) return { error: 'تنظیم ناشناس' }

  if (def.type === 'boolean') {
    return { value: raw === true || raw === 'true' || raw === 'on' || raw === '1' }
  }

  const text = typeof raw === 'string' ? raw.trim() : String(raw ?? '')

  if (def.type === 'number') {
    if (text === '') return { error: 'خالی است' }
    const num = Number(text.replace(/[٬,]/g, ''))
    if (!Number.isFinite(num)) return { error: 'عدد معتبر نیست' }
    if (def.min !== undefined && num < def.min)
      return { error: `کمتر از ${def.min} مجاز نیست` }
    if (def.max !== undefined && num > def.max)
      return { error: `بیشتر از ${def.max} مجاز نیست` }
    return { value: num }
  }

  if (def.type === 'select') {
    const allowed = def.options?.map((option) => option.value) ?? []
    if (!allowed.includes(text)) return { error: 'گزینه‌ی نامعتبر' }
    return { value: text }
  }

  // string | text
  if (text.length > 2000) return { error: 'خیلی بلند است' }
  return { value: text }
}

/**
 * بررسی‌های بین‌فیلدی.
 *
 * تنظیم‌هایی که تک‌تک معتبرند ولی با هم بی‌معنی می‌شوند. بدون این بررسی،
 * ادمین می‌تواند سایت را در وضعیتی بگذارد که هیچ‌کس نتواند وارد شود.
 */
export function validateSettings(next: Settings): ValidationError[] {
  const errors: ValidationError[] = []

  if (!next.allowPasswordLogin && !next.allowOtpLogin) {
    errors.push({
      key: 'allowPasswordLogin',
      message: 'حداقل یکی از روش‌های ورود با رمز یا کد یک‌بارمصرف باید روشن باشد.',
    })
  }
  if (
    next.allowRegistration
    && next.registrationRequiresPhoneVerification
    && !next.allowSmsVerification
  ) {
    errors.push({
      key: 'allowSmsVerification',
      message: 'تا وقتی ثبت‌نام باز است، پیامک تأیید شماره باید روشن بماند.',
    })
  }
  if (next.priceTierMidMax <= next.priceTierCheapMax) {
    errors.push({
      key: 'priceTierMidMax',
      message: 'سقف رده‌ی متوسط باید از سقف رده‌ی اقتصادی بیشتر باشد.',
    })
  }
  if (next.mapMaxZoom <= next.mapMinZoom) {
    errors.push({ key: 'mapMaxZoom', message: 'بیشینه‌ی زوم باید از کمینه بیشتر باشد.' })
  }
  if (next.mapDefaultZoom < next.mapMinZoom || next.mapDefaultZoom > next.mapMaxZoom) {
    errors.push({
      key: 'mapDefaultZoom',
      message: 'زوم پیش‌فرض باید بین کمینه و بیشینه باشد.',
    })
  }
  if (
    next.geoBboxMaxLat <= next.geoBboxMinLat ||
    next.geoBboxMaxLng <= next.geoBboxMinLng
  ) {
    errors.push({
      key: 'geoBboxMaxLat',
      message: 'کادر شهر معتبر نیست — بیشینه باید از کمینه بزرگ‌تر باشد.',
    })
  }
  if (next.reviewMaxTextLength <= next.reviewMinTextLength) {
    errors.push({
      key: 'reviewMaxTextLength',
      message: 'حداکثر طول باید از حداقل بیشتر باشد.',
    })
  }
  if (next.otpResendCooldownSeconds >= next.otpTtlSeconds * 4) {
    errors.push({
      key: 'otpResendCooldownSeconds',
      message: 'فاصله‌ی ارسال دوباره نسبت به اعتبار کد خیلی زیاد است؛ کاربر گیر می‌افتد.',
    })
  }

  // منطقه‌ی زمانی باید برای Intl شناخته باشد، وگرنه «الان باز است؟» می‌ترکد.
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: next.timeZone })
  } catch {
    errors.push({ key: 'timeZone', message: 'این منطقه‌ی زمانی شناخته نمی‌شود.' })
  }

  const ROUTING_ALLOWED = new Set(['neshan', 'balad', 'google', 'waze', 'osm'])
  const services = splitList(next.routingServices)
  if (services.length === 0) {
    errors.push({ key: 'routingServices', message: 'حداقل یک سرویس مسیریابی لازم است.' })
  }
  const unknownService = services.find((service) => !ROUTING_ALLOWED.has(service))
  if (unknownService) {
    errors.push({ key: 'routingServices', message: `سرویس ناشناس: ${unknownService}` })
  }

  const caps = splitList(next.priceFilterCaps).map(Number)
  if (caps.length === 0 || caps.some((cap) => !Number.isFinite(cap) || cap <= 0)) {
    errors.push({
      key: 'priceFilterCaps',
      message: 'فهرست سقف قیمت باید عددهای مثبت جداشده با کاما باشد.',
    })
  }

  return errors
}

/** رشته‌ی کاماجدا → آرایه‌ی تمیز. */
export function splitList(value: string): string[] {
  return value
    .split(/[,،]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

/** سقف‌های قیمت به‌صورت عدد، مرتب. */
export function parsePriceCaps(value: string): number[] {
  return splitList(value)
    .map((part) => Number(part.replace(/[٬]/g, '')))
    .filter((num) => Number.isFinite(num) && num > 0)
    .sort((a, b) => a - b)
}
