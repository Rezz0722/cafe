/** روزهای هفته، شنبه‌محور — ترتیبی که تقویم ایرانی استفاده می‌کند. */
export const WEEKDAY_LABELS = [
  'شنبه',
  'یک‌شنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنج‌شنبه',
  'جمعه',
] as const

export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6

export function weekdayLabel(dow: number): string {
  return WEEKDAY_LABELS[dow] ?? ''
}
