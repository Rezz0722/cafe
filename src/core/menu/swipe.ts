/**
 * تشخیص حرکت افقی عمدی برای منوی RTL.
 *
 * خروجی +۱ یعنی دستهٔ بعدی و -۱ یعنی دستهٔ قبلی. در رابط RTL، کشیدن انگشت
 * به راست دستهٔ بعدی را از سمت چپ وارد می‌کند؛ کشیدن به چپ به قبلی برمی‌گردد.
 */
export function menuSectionStepFromSwipe(
  deltaX: number,
  deltaY: number,
  threshold = 52,
): -1 | 0 | 1 {
  const horizontal = Math.abs(deltaX)
  const vertical = Math.abs(deltaY)
  if (horizontal < threshold || horizontal <= vertical * 1.25) return 0
  return deltaX > 0 ? 1 : -1
}
