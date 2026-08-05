/**
 * سلیقه‌سنجی کاربر.
 *
 * ═══ چرا سؤال، و چرا این سؤال‌ها ═══
 *
 * پیشنهاد شخصی بدون هیچ سیگنالی از کاربر، همان فهرست محبوب‌ترین‌ها است با
 * عنوان دیگر. ولی پرسیدنِ زیاد هم جواب نمی‌دهد: کاربری که برای دیدن یک کافه
 * آمده، ده سؤال جواب نمی‌دهد.
 *
 * پس شش سؤال، همه چندگزینه‌ای، همه قابل رد شدن. هر گزینه به **وزن روی
 * facet/dish/محله‌ی واقعیِ داده** نگاشت می‌شود — نه به یک برچسب انتزاعی.
 * اگر گزینه‌ای به چیزی نگاشت شود که در داده وجود ندارد، آن گزینه بی‌فایده
 * است؛ تست همین را بررسی می‌کند.
 *
 * ═══ چرا پاسخ خام هم ذخیره می‌شود ═══
 *
 * `user_taste_profile.answers` پاسخ‌ها را همان‌طور که داده شده نگه می‌دارد، نه
 * فقط وزن‌های استخراج‌شده. وقتی فردا الگوریتم پیشنهاد عوض شود، می‌شود وزن‌ها
 * را از نو حساب کرد بدون اینکه دوباره از کاربر بپرسیم.
 */

export type PreferenceKind = 'facet' | 'dish' | 'attribute' | 'district'

export interface Weight {
  kind: PreferenceKind
  refId: string
  /** ‎-۲ تا ۲. منفی یعنی «این را نمی‌خواهم». */
  weight: number
}

export interface QuizOption {
  id: string
  label: string
  hint?: string
  weights: Weight[]
  /** فقط برای سؤال بودجه — باند قیمت را تعیین می‌کند. */
  budgetBand?: 1 | 2 | 3
}

export interface QuizQuestion {
  id: string
  title: string
  hint?: string
  multi: boolean
  options: QuizOption[]
}

const f = (refId: string, weight = 2): Weight => ({ kind: 'facet', refId, weight })
const d = (refId: string, weight = 2): Weight => ({ kind: 'dish', refId, weight })
const a = (refId: string, weight = 2): Weight => ({ kind: 'attribute', refId, weight })

export const QUIZ_VERSION = 1

export const QUIZ: QuizQuestion[] = [
  {
    id: 'purpose',
    title: 'معمولاً برای چه به کافه می‌روی؟',
    hint: 'می‌توانی چند مورد را انتخاب کنی',
    multi: true,
    options: [
      {
        id: 'work',
        label: 'کار با لپ‌تاپ',
        weights: [a('laptop_friendly'), a('power_outlets', 1), a('fast_wifi', 1)],
      },
      { id: 'date', label: 'قرار دو نفره', weights: [a('good_for_date'), a('cozy', 1)] },
      { id: 'friends', label: 'دورهمی با دوستان', weights: [a('lively'), a('long_stay_ok', 1)] },
      {
        id: 'breakfast',
        label: 'صبحانه و برانچ',
        weights: [f('breakfast'), d('english-breakfast', 1), d('omelette', 1)],
      },
      { id: 'dinner', label: 'شام', weights: [f('main_dish'), f('steak', 1)] },
      { id: 'solo', label: 'تنهایی و کتاب', weights: [a('quiet'), a('good_for_study'), a('cozy', 1)] },
    ],
  },
  {
    id: 'drink',
    title: 'نوشیدنی اصلی‌ات چیست؟',
    multi: true,
    options: [
      {
        id: 'espresso',
        label: 'قهوه‌ی اسپرسویی',
        hint: 'لاته، کاپوچینو، آمریکانو',
        weights: [f('coffee'), d('latte', 1), d('cappuccino', 1), d('americano', 1)],
      },
      {
        id: 'brewed',
        label: 'قهوه‌ی دمی',
        hint: 'V60، کمکس، ایروپرس',
        weights: [f('brewed_coffee'), d('brewed-coffee', 1), a('specialty_coffee', 1)],
      },
      {
        id: 'cold_coffee',
        label: 'قهوه‌ی سرد',
        weights: [f('cold_coffee'), d('iced-latte', 1)],
      },
      { id: 'matcha', label: 'ماچا', weights: [f('matcha'), d('matcha-latte', 1)] },
      { id: 'tea', label: 'چای و دمنوش', weights: [f('tea'), d('masala-tea', 1)] },
      {
        id: 'cold',
        label: 'شیک و ماکتیل',
        weights: [f('shake'), f('mocktail'), d('mojito', 1)],
      },
      { id: 'no_coffee', label: 'قهوه نمی‌خورم', weights: [f('coffee', -1), f('tea', 1)] },
    ],
  },
  {
    id: 'budget',
    title: 'برای یک نفر معمولاً چقدر خرج می‌کنی؟',
    hint: 'بر اساس میانگین قیمت منو',
    multi: false,
    options: [
      { id: 'low', label: 'تا ۲۰۰ هزار تومان', weights: [], budgetBand: 1 },
      { id: 'mid', label: '۲۰۰ تا ۴۰۰ هزار', weights: [], budgetBand: 2 },
      { id: 'high', label: 'بیشتر از ۴۰۰ هزار', weights: [], budgetBand: 3 },
    ],
  },
  {
    id: 'food',
    title: 'کنارش غذا هم می‌خوری؟',
    multi: true,
    options: [
      { id: 'pasta', label: 'پاستا', weights: [f('pasta'), d('alfredo-pasta', 1)] },
      { id: 'pizza', label: 'پیتزا', weights: [f('pizza'), d('pepperoni-pizza', 1)] },
      { id: 'burger', label: 'برگر', weights: [f('burger'), d('classic-burger', 1)] },
      { id: 'steak', label: 'استیک', weights: [f('steak')] },
      { id: 'persian', label: 'غذای ایرانی', weights: [f('persian_food'), f('kebab', 1)] },
      {
        id: 'healthy',
        label: 'رژیمی و گیاهی',
        weights: [f('healthy'), f('salad', 1), a('healthy_options', 1)],
      },
      {
        id: 'dessert',
        label: 'کیک و دسر',
        weights: [f('cake_dessert'), d('cheesecake', 1), f('bakery', 1), a('desserts', 1)],
      },
      { id: 'drinks_only', label: 'فقط نوشیدنی', weights: [f('main_dish', -1)] },
    ],
  },
  {
    id: 'hookah',
    title: 'قلیان؟',
    multi: false,
    options: [
      { id: 'yes', label: 'بله، مهم است', weights: [f('hookah')] },
      { id: 'no', label: 'نه، ترجیح می‌دهم نباشد', weights: [f('hookah', -2)] },
      { id: 'dont_care', label: 'فرقی نمی‌کند', weights: [] },
    ],
  },
  {
    id: 'vibe',
    title: 'چه حال‌وهوایی را می‌پسندی؟',
    multi: true,
    options: [
      { id: 'outdoor', label: 'فضای باز و تراس', weights: [a('outdoor')] },
      { id: 'cozy', label: 'دنج و کوچک', weights: [a('cozy')] },
      { id: 'quiet', label: 'ساکت', weights: [a('quiet')] },
      { id: 'lively', label: 'شلوغ و پرانرژی', weights: [a('lively')] },
      { id: 'view', label: 'چشم‌انداز خوب', weights: [a('scenic_view'), a('photogenic', 1)] },
      { id: 'family', label: 'مناسب خانواده', weights: [a('family_friendly')] },
      { id: 'late', label: 'تا دیروقت باز', weights: [a('open_late')] },
    ],
  },
]

export const QUESTION_BY_ID = new Map(QUIZ.map((question) => [question.id, question]))

/** پاسخ‌های کاربر: شناسه‌ی سؤال → شناسه‌ی گزینه‌های انتخاب‌شده. */
export type QuizAnswers = Record<string, string[]>

export interface TasteResult {
  weights: Weight[]
  budgetBand: 1 | 2 | 3 | null
  /** تعداد سؤال‌های پاسخ‌داده‌شده — برای نمایش «چقدر پروفایلت کامل است». */
  answered: number
}

/**
 * پاسخ‌ها → وزن‌ها.
 *
 * وزن‌های یک `refId` **جمع** می‌شوند و در بازه‌ی ‎-۲..۲ محدود می‌مانند: اگر
 * کاربر هم «صبحانه» و هم «کیک و دسر» را انتخاب کند، هر دو به `bakery` وزن
 * می‌دهند و بدون محدودسازی، یک facet می‌توانست کل امتیاز را ببرد.
 */
export function computeTaste(answers: QuizAnswers): TasteResult {
  const totals = new Map<string, Weight>()
  let budgetBand: 1 | 2 | 3 | null = null
  let answered = 0

  for (const question of QUIZ) {
    const selected = answers[question.id] ?? []
    if (selected.length === 0) continue
    answered++

    for (const optionId of selected) {
      const option = question.options.find((item) => item.id === optionId)
      if (!option) continue // گزینه‌ی ناشناس از فرمِ دستکاری‌شده — بی‌صدا رد می‌شود
      if (option.budgetBand) budgetBand = option.budgetBand

      for (const weight of option.weights) {
        const key = `${weight.kind}:${weight.refId}`
        const existing = totals.get(key)
        if (existing) existing.weight += weight.weight
        else totals.set(key, { ...weight })
      }
    }
  }

  const weights = [...totals.values()]
    .map((weight) => ({ ...weight, weight: Math.max(-2, Math.min(2, weight.weight)) }))
    // وزن صفر هیچ اثری ندارد و فقط ردیف اضافه در دیتابیس است.
    .filter((weight) => weight.weight !== 0)

  return { weights, budgetBand, answered }
}

/** آیا این پاسخ‌ها اصلاً چیزی برای ذخیره دارند؟ */
export function hasAnyAnswer(answers: QuizAnswers): boolean {
  return Object.values(answers).some((selected) => selected.length > 0)
}

/** فقط شناسه‌های معتبر — ورودی از فرم است و باید پاک‌سازی شود. */
export function sanitizeAnswers(raw: Record<string, string[] | string | undefined>): QuizAnswers {
  const out: QuizAnswers = {}
  for (const question of QUIZ) {
    const value = raw[question.id]
    const list = Array.isArray(value) ? value : value ? [value] : []
    const valid = list.filter((optionId) =>
      question.options.some((option) => option.id === optionId),
    )
    if (valid.length === 0) continue
    // سؤال تک‌گزینه‌ای فقط اولی را نگه می‌دارد.
    out[question.id] = question.multi ? [...new Set(valid)] : [valid[0]!]
  }
  return out
}
