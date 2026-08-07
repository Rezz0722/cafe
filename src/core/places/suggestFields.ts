/**
 * فیلدهایی که کاربر اجازه دارد برایشان اصلاح پیشنهاد کند.
 *
 * ═══ چرا فهرست بسته ═══
 *
 * `edit_suggestion.field` یک رشته‌ی آزاد است. اگر فرم هر رشته‌ای را قبول کند،
 * صفِ بررسی پر می‌شود از فیلدهایی که ادمین نمی‌داند به کجای دیتابیس مربوط‌اند
 * و عملاً هیچ‌کدام اعمال نمی‌شوند. فهرست بسته یعنی هر پیشنهاد از قبل معلوم است
 * کدام ستون را هدف گرفته.
 *
 * ═══ چرا اینجا و نه در `suggestions.ts` ═══
 *
 * فرم یک کامپوننت کلاینت است و به برچسب‌ها نیاز دارد. `suggestions.ts` با
 * `server-only` علامت خورده چون به دیتابیس وصل است، پس ثابت‌های مشترک باید در
 * ماژول جدا باشند وگرنه import از کلاینت، build را می‌شکند.
 */

export interface SuggestableField {
  id: string
  labelFa: string
  /** چه چیزی از کاربر می‌خواهیم — زیرِ فیلد نمایش داده می‌شود. */
  hint: string
  placeholder: string
  /** فیلدِ بلند، `textarea` می‌گیرد نه `input`. */
  long?: boolean
  /** جهتِ متن؛ شماره و مختصات و آیدی اینستاگرام لاتین‌اند. */
  ltr?: boolean
}

export const SUGGESTABLE_FIELDS: SuggestableField[] = [
  {
    id: 'hours',
    labelFa: 'ساعت کاری',
    hint: 'روزها و ساعت‌ها را همان‌طور که هست بنویسید — مثلاً «شنبه تا چهارشنبه ۹ تا ۲۳، جمعه تعطیل».',
    placeholder: 'شنبه تا چهارشنبه ۰۹:۰۰ تا ۲۳:۰۰ — پنجشنبه و جمعه ۱۰:۰۰ تا ۰۰:۳۰',
    long: true,
  },
  {
    id: 'address',
    labelFa: 'آدرس',
    hint: 'آدرس کامل با نام خیابان و پلاک، اگر بلدید.',
    placeholder: 'مشهد، احمدآباد، خیابان…',
    long: true,
  },
  {
    id: 'phone',
    labelFa: 'شماره تماس',
    hint: 'چند شماره را با کاما جدا کنید.',
    placeholder: '05138472000، 09151234567',
    ltr: true,
  },
  {
    id: 'coords',
    labelFa: 'موقعیت روی نقشه',
    hint: 'در نشان یا گوگل مپس روی نقطه‌ی درست نگه دارید و مختصات را کپی کنید.',
    placeholder: '36.316,59.567',
    ltr: true,
  },
  {
    id: 'menu_price',
    labelFa: 'قیمت منو',
    hint: 'کدام آیتم و قیمت درستش چند است؟ اگر می‌دانید کی آن را دیده‌اید، بنویسید.',
    placeholder: 'لاته ۱۴۰ هزار تومان است نه ۹۸ — هفته‌ی پیش رفتم.',
    long: true,
  },
  {
    id: 'instagram',
    labelFa: 'اینستاگرام',
    hint: 'فقط آیدی، بدون @ و بدون آدرس کامل.',
    placeholder: 'cafe_name',
    ltr: true,
  },
  {
    id: 'name',
    labelFa: 'نام مجموعه',
    hint: 'اگر اسم غلط نوشته شده یا عوض شده.',
    placeholder: 'نام درست مجموعه',
  },
  {
    id: 'closed',
    labelFa: 'این مجموعه تعطیل شده',
    hint: 'اگر می‌دانید دائمی تعطیل شده یا جابه‌جا شده، همین‌جا بنویسید.',
    placeholder: 'از اسفند تعطیل شده — تابلویش برداشته شده.',
    long: true,
  },
  {
    id: 'other',
    labelFa: 'چیز دیگری',
    hint: 'هر چیزی که در صفحه غلط است و در فهرست بالا نبود.',
    placeholder: 'چه چیزی غلط است و درستش چیست؟',
    long: true,
  },
]

export function findSuggestableField(id: string): SuggestableField | undefined {
  return SUGGESTABLE_FIELDS.find((field) => field.id === id)
}

/** کمینه و بیشینه‌ی طولِ متنِ پیشنهاد. */
export const SUGGESTION_MIN_LENGTH = 3
export const SUGGESTION_MAX_LENGTH = 800
