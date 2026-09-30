import { normalizeFa } from '@/core/text/normalize'

export interface CategoryArtworkOption {
  id: string
  label: string
  path: string
  facetIds: string[]
  keywords: string[]
}

/**
 * کتابخانهٔ تصویری دسته‌های منو.
 *
 * فایل کوچک برای کارت‌ها و فایل `.full.webp` برای نمایش بزرگ نگه‌داری می‌شود.
 * مسیرها عمومی‌اند تا پنل بتواند یک تصویر را به `menu_section.media_id` متصل کند؛
 * ولی تا وقتی کافه‌دار انتخابی نکرده، همین نگاشت به‌عنوان پیش‌فرض هوشمند کار می‌کند.
 */
export const CATEGORY_ARTWORK_OPTIONS: CategoryArtworkOption[] = [
  { id: 'coffee', label: 'قهوه و اسپرسو', path: '/menu-categories/v2/coffee.webp', facetIds: ['coffee'], keywords: ['قهوه', 'اسپرسو', 'لاته', 'کاپوچینو', 'coffee', 'espresso'] },
  { id: 'brewed-coffee', label: 'قهوه دمی', path: '/menu-categories/v2/brewed-coffee.webp', facetIds: ['brewed_coffee'], keywords: ['دمی', 'کمکس', 'وی شصت', 'v60', 'aeropress', 'brewed'] },
  { id: 'cold-coffee', label: 'قهوه سرد', path: '/menu-categories/v2/cold-coffee.webp', facetIds: ['cold_coffee'], keywords: ['آیس کافی', 'قهوه سرد', 'کلد برو', 'cold coffee', 'cold brew'] },
  { id: 'matcha', label: 'ماچا', path: '/menu-categories/v2/matcha.webp', facetIds: ['matcha'], keywords: ['ماچا', 'matcha', 'اسپیرولینا'] },
  { id: 'tea', label: 'چای و دمنوش', path: '/menu-categories/v2/tea.webp', facetIds: ['tea'], keywords: ['چای', 'دمنوش', 'هربال', 'tea', 'herbal'] },
  { id: 'hot-drinks', label: 'نوشیدنی گرم', path: '/menu-categories/v2/hot-drinks.webp', facetIds: ['hot_drinks'], keywords: ['هات چاکلت', 'شکلات داغ', 'نوشیدنی گرم', 'hot chocolate'] },
  { id: 'extras', label: 'افزودنی‌های نوشیدنی', path: '/menu-categories/v2/extras.webp', facetIds: [], keywords: ['افزودنی', 'اضافات', 'سیروپ', 'شات اضافه', 'extra', 'add-on'] },
  { id: 'mocktail', label: 'ماکتیل و نوشیدنی سرد', path: '/menu-categories/v2/mocktail.webp', facetIds: ['mocktail', 'soft_drinks'], keywords: ['ماکتیل', 'ماکتل', 'موهیتو', 'لیموناد', 'نوشیدنی سرد', 'سرد نوش', 'سردنوش', 'mocktail'] },
  { id: 'shake', label: 'شیک و اسموتی', path: '/menu-categories/v2/shake.webp', facetIds: ['shake', 'smoothie'], keywords: ['شیک', 'اسموتی', 'گلاسه', 'shake', 'smoothie'] },
  { id: 'juice', label: 'آبمیوه طبیعی', path: '/menu-categories/v2/juice.webp', facetIds: ['juice'], keywords: ['آبمیوه', 'آب میوه', 'جوس', 'juice', 'fresh'] },
  { id: 'breakfast', label: 'صبحانه و برانچ', path: '/menu-categories/v2/breakfast.webp', facetIds: ['breakfast'], keywords: ['صبحانه', 'برانچ', 'املت', 'breakfast', 'brunch'] },
  { id: 'bakery', label: 'بیکری و پیستری', path: '/menu-categories/v2/bakery.webp', facetIds: ['bakery'], keywords: ['بیکری', 'پیستری', 'کروسان', 'نان', 'bakery', 'pastry'] },
  { id: 'cake-dessert', label: 'کیک و دسر', path: '/menu-categories/v2/cake-dessert.webp', facetIds: ['cake_dessert'], keywords: ['کیک', 'دسر', 'براونی', 'تارت', 'وافل', 'cake', 'dessert'] },
  { id: 'ice-cream', label: 'بستنی و جلاتو', path: '/menu-categories/v2/ice-cream.webp', facetIds: ['ice_cream'], keywords: ['بستنی', 'جلاتو', 'ژلاتو', 'فالوده', 'ice cream', 'gelato'] },
  { id: 'pasta', label: 'پاستا', path: '/menu-categories/v2/pasta.webp', facetIds: ['pasta'], keywords: ['پاستا', 'لازانیا', 'اسپاگتی', 'pasta'] },
  { id: 'pizza', label: 'پیتزا', path: '/menu-categories/v2/pizza.webp', facetIds: ['pizza'], keywords: ['پیتزا', 'pizza'] },
  { id: 'burger', label: 'برگر و فست‌فود', path: '/menu-categories/v2/burger.webp', facetIds: ['burger', 'fast_food'], keywords: ['برگر', 'همبرگر', 'فست فود', 'burger'] },
  { id: 'sandwich', label: 'ساندویچ و پنینی', path: '/menu-categories/v2/sandwich.webp', facetIds: ['sandwich'], keywords: ['ساندویچ', 'پنینی', 'چاپاتا', 'رپ', 'هات داگ', 'sandwich'] },
  { id: 'salad', label: 'سالاد و غذای سالم', path: '/menu-categories/v2/salad.webp', facetIds: ['salad', 'healthy'], keywords: ['سالاد', 'رژیمی', 'سالم', 'گیاهی', 'وگان', 'salad', 'healthy'] },
  { id: 'appetizer', label: 'پیش‌غذا و سوخاری', path: '/menu-categories/v2/appetizer.webp', facetIds: ['appetizer', 'fried'], keywords: ['پیش غذا', 'سوخاری', 'سیب زمینی', 'appetizer', 'fried'] },
  { id: 'persian-food', label: 'غذای ایرانی', path: '/menu-categories/v2/persian-food.webp', facetIds: ['persian_food', 'kebab', 'main_dish'], keywords: ['غذای ایرانی', 'کباب', 'چلو', 'پلو', 'غذای اصلی', 'persian'] },
  { id: 'seafood', label: 'غذای دریایی', path: '/menu-categories/v2/seafood.webp', facetIds: ['seafood'], keywords: ['دریایی', 'ماهی', 'میگو', 'سالمون', 'seafood'] },
]

export const CATEGORY_ARTWORK_BY_ID = new Map(CATEGORY_ARTWORK_OPTIONS.map((option) => [option.id, option]))

const FACET_ARTWORK = new Map(
  CATEGORY_ARTWORK_OPTIONS.flatMap((option) => option.facetIds.map((facetId) => [facetId, option.path] as const)),
)

/** تصویر اختصاصی دسته مقدم است؛ سپس facet و در نهایت نام خام دسته. */
export function categoryArtwork(
  name: string,
  facetId?: string | null,
  customUrl?: string | null,
): string {
  if (customUrl) return customUrl
  if (facetId && FACET_ARTWORK.has(facetId)) return FACET_ARTWORK.get(facetId)!

  const text = normalizeFa(name).toLowerCase()
  const match = CATEGORY_ARTWORK_OPTIONS.find((option) =>
    option.keywords.some((keyword) => text.includes(normalizeFa(keyword).toLowerCase())),
  )
  return match?.path ?? '/menu-categories/other.webp'
}

/**
 * نسخهٔ بزرگ همان تصویر برای کاورهای عریض و تمام‌صفحه.
 *
 * تصویر اختصاصی مدیر با URL کامل خودش مقدم است. تصاویر داخلی دو خروجی دارند:
 * ۷۲۰px برای rail و موبایل، و ۱۲۵۴px برای کاورهای بزرگ دسکتاپ. fallback قدیمی
 * نسخهٔ بزرگ ندارد و همان فایل اصلی را برمی‌گرداند.
 */
export function categoryArtworkFull(
  name: string,
  facetId?: string | null,
  customFullUrl?: string | null,
): string {
  const artwork = categoryArtwork(name, facetId, customFullUrl)
  return artwork.startsWith('/menu-categories/v2/') && !artwork.endsWith('.full.webp')
    ? artwork.replace(/\.webp$/, '.full.webp')
    : artwork
}
