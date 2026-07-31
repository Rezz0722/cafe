/**
 * قانون ایندکس‌پذیری صفحات برنامه‌ای.
 *
 * ═══ دام SEO برنامه‌ای ═══
 *
 * ۶ محله × ۱۶ ویژگی = ۹۶ صفحه‌ی ممکن. اگر کورکورانه همه را تولید و ایندکس
 * کنیم، بیشترشان یک یا صفر کافه دارند. گوگل این را «thin content» می‌بیند و
 * می‌تواند *کل دامنه* را تنبیه کند — نه فقط آن صفحات.
 *
 * پس: صفحه ساخته می‌شود و برای کاربر کار می‌کند، ولی تا وقتی به حد نصاب
 * نرسیده `noindex` می‌ماند و در sitemap هم نمی‌آید. با رشد داده، خودکار
 * وارد ایندکس می‌شود — بدون اینکه کسی کاری بکند.
 */

/** حداقل تعداد کافه‌ی منتشرشده برای اینکه یک صفحه‌ی مجموعه ایندکس شود. */
export const MIN_PLACES_FOR_INDEX = 5

export function isIndexable(placeCount: number): boolean {
  return placeCount >= MIN_PLACES_FOR_INDEX
}

/** آبجکت `robots` برای متادیتای Next. */
export function robotsFor(placeCount: number) {
  const indexable = isIndexable(placeCount)
  return {
    index: indexable,
    follow: true, // حتی وقتی ایندکس نمی‌شود، لینک‌ها دنبال شوند
  }
}
