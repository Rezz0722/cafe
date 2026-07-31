/**
 * رتبه‌بندی امتیاز.
 *
 * میانگین خام برای *مرتب‌سازی* بی‌فایده است: کافه‌ای با ۴٫۹ از ۳ نظر بالای
 * کافه‌ای با ۴٫۶ از ۵۰۰ نظر می‌نشیند، در حالی که دومی قطعاً انتخاب بهتری است.
 *
 * میانگین بیزی امتیاز را به سمت میانگین کل سایت می‌کشد، به‌اندازه‌ای که تعداد
 * نظرات کم باشد:
 *
 *     score = (v/(v+m))·R + (m/(v+m))·C
 *
 * میانگین خام همچنان برای *نمایش* استفاده می‌شود («۴٫۹ از ۳ نظر») — کاربر
 * باید عدد واقعی را ببیند؛ فقط ترتیب است که باید تصحیح شود.
 */

/** حداقل تعداد نظر برای اینکه امتیاز خودِ مکان وزن کامل بگیرد. */
export const RATING_PRIOR_COUNT = 20

/** میانگین پیش‌فرض سایت تا وقتی داده‌ی کافی برای محاسبه‌اش نداریم. */
export const DEFAULT_SITE_MEAN = 4.2

export function rawAverage(ratingSum: number, ratingCount: number): number {
  if (ratingCount <= 0) return 0
  return ratingSum / ratingCount
}

export function bayesianAverage(
  ratingSum: number,
  ratingCount: number,
  siteMean = DEFAULT_SITE_MEAN,
  priorCount = RATING_PRIOR_COUNT,
): number {
  if (ratingCount <= 0) return siteMean
  const v = ratingCount
  const m = priorCount
  const R = ratingSum / ratingCount
  return (v / (v + m)) * R + (m / (v + m)) * siteMean
}

/** میانگین کل سایت — ورودی `siteMean` برای بقیه‌ی محاسبات. */
export function computeSiteMean(
  places: { ratingSum: number; ratingCount: number }[],
): number {
  const totalSum = places.reduce((s, p) => s + p.ratingSum, 0)
  const totalCount = places.reduce((s, p) => s + p.ratingCount, 0)
  return totalCount > 0 ? totalSum / totalCount : DEFAULT_SITE_MEAN
}
