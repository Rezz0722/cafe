import type { RawCafe } from '../import/source'
import { isTopMenuSourceExcluded } from './topMenuExclusions'

export interface TopMenuSelection { scope: 'all' | 'selected'; sourceIds: number[] }
export interface TopMenuSkippedSources {
  excluded: number[]
  missing: number[]
  incomplete: number[]
}
export interface TopMenuTarget {
  sourceId: number
  placeId: number | null
  name: string
  username: string
  items?: number
  /**
   * آیا این مجموعه در آخرین فهرستِ منبع دیده شده است؟
   *
   * `true`  = در فهرست منبع هست (یا از خودِ snapshot آمده).
   * `false` = در آخرین فهرست کاملِ خوانده‌شده نبود؛ اجرای تازه دوباره بررسی می‌کند.
   * `undefined` = فهرست منبع در دسترس نبوده، پس درباره‌اش چیزی نمی‌دانیم.
   *
   * ═══ چرا `undefined` وجود دارد و `false` نیست ═══
   *
   * غیبتِ سند، دلیلِ غیبتِ مجموعه نیست. اگر نتوانستیم فهرست منبع را بخوانیم
   * (فایل نیست، JSON خراب است، پوشه خوانده نشد) و همه را `false` بگذاریم، آن‌وقت
   * یک قطعیِ موقتِ فایل، همه‌ی کافه‌های سایت را از انتخاب ادمین حذف می‌کند و
   * همگام‌سازی را از راهی که اصلاً ربطی به خرابیِ فایل ندارد می‌بندد.
   *
   * پس نبودِ شواهد، هرگز تبدیل به «شاهدِ نبود» نمی‌شود: در حالت نامعلوم، مقدار
   * `undefined` می‌ماند. تصمیم قطعی فقط با فهرست کاملِ اجرای تازه گرفته می‌شود.
   */
  inSource?: boolean
}

/** Explicit empty selection must NEVER mean "all". IDs are source IDs, not place IDs. */
export function parseTopMenuSelection(scope: unknown, ids: unknown): TopMenuSelection {
  if (scope === 'all') {
    if (ids !== undefined && (!Array.isArray(ids) || ids.length)) throw new Error('انتخاب همه با فهرست کافه‌ها ناسازگار است.')
    return { scope: 'all', sourceIds: [] }
  }
  if (scope !== 'selected' || !Array.isArray(ids) || !ids.length || ids.length > 1000)
    throw new Error('حداقل یک کافه را انتخاب کنید؛ حداکثر ۱۰۰۰ کافه.')
  if (ids.some(id => typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || id > 2147483647))
    throw new Error('شناسهٔ کافه‌های انتخاب‌شده معتبر نیست.')
  return { scope: 'selected', sourceIds: [...new Set(ids)] }
}

export function selectTopMenuCafes(cafes: RawCafe[], selection: TopMenuSelection): RawCafe[] {
  const parsed = parseTopMenuSelection(selection.scope, selection.sourceIds)
  if (parsed.scope === 'all') {
    if (!cafes.some(cafe => isTopMenuSourceExcluded(Number(cafe['شناسه'])))) return cafes
    return cafes.filter(cafe => !isTopMenuSourceExcluded(Number(cafe['شناسه'])))
  }
  const blocked = parsed.sourceIds.filter(isTopMenuSourceExcluded)
  if (blocked.length) throw new Error(`شناسه‌های منبع انتخاب‌شده به‌دلیل تأیید غیرکافه بودن از همگام‌سازی مستثنا هستند: ${blocked.join('، ')}؛ هیچ تغییری اعمال نشد.`)
  const requested = new Set(parsed.sourceIds)
  const selected = cafes.filter(cafe => requested.has(Number(cafe['شناسه'])))
  const found = new Set(selected.map(cafe => Number(cafe['شناسه'])))
  if (parsed.sourceIds.some(id => !found.has(id))) throw new Error('بعضی کافه‌های انتخاب‌شده در دادهٔ منبع وجود ندارند؛ هیچ تغییری اعمال نشد.')
  return selected
}

/**
 * Scraping tolerates changes in a verified source directory; applying data does
 * not. An incomplete snapshot is tolerated only when that provider is also in
 * the scraper's per-provider failure manifest. Unknown omissions stay fatal.
 */
export function reconcileTopMenuScrape(
  cafes: RawCafe[], selection: TopMenuSelection, sourceIds: readonly number[], failedIds: readonly number[],
): { cafes: RawCafe[]; skipped: TopMenuSkippedSources } {
  const parsed = parseTopMenuSelection(selection.scope, selection.sourceIds)
  const available = new Set(sourceIds)
  const recorded = new Set(cafes.map(cafe => Number(cafe['شناسه'])))
  const failed = new Set(failedIds)
  const unexpected = [...recorded].filter(id => !available.has(id))
  if (unexpected.length) throw new Error(`رکورد خارج از فهرست معتبر منبع در خروجی اسکرپ دیده شد (${unexpected.slice(0, 10).join('، ')}). هیچ داده‌ای اعمال نشد.`)
  if (parsed.scope === 'all') {
    const excluded = sourceIds.filter(isTopMenuSourceExcluded)
    const incomplete = sourceIds.filter(id => !isTopMenuSourceExcluded(id) && !recorded.has(id))
    const unexplained = incomplete.filter(id => !failed.has(id))
    if (unexplained.length) throw new Error(`دادهٔ ${unexplained.length} کافهٔ موجود در منبع بدون ثبت خطای دریافت ناقص است (${unexplained.slice(0, 10).join('، ')}). هیچ داده‌ای اعمال نشد.`)
    return { cafes: selectTopMenuCafes(cafes, parsed), skipped: { excluded, missing: [], incomplete } }
  }
  const excluded = parsed.sourceIds.filter(isTopMenuSourceExcluded)
  const missing = parsed.sourceIds.filter(id => !isTopMenuSourceExcluded(id) && !available.has(id))
  const eligible = parsed.sourceIds.filter(id => !isTopMenuSourceExcluded(id) && available.has(id))
  const selectedSet = new Set(eligible)
  const unrequested = [...recorded].filter(id => !selectedSet.has(id))
  if (unrequested.length) throw new Error(`رکورد انتخاب‌نشده در خروجی اسکرپ دیده شد (${unrequested.slice(0, 10).join('، ')}). هیچ داده‌ای اعمال نشد.`)
  const absentFromSnapshot = eligible.filter(id => !recorded.has(id))
  const unexplained = absentFromSnapshot.filter(id => !failed.has(id))
  if (unexplained.length) throw new Error(`دادهٔ ${unexplained.length} کافهٔ موجود در منبع بدون ثبت خطای دریافت ناقص است (${unexplained.slice(0, 10).join('، ')}). هیچ داده‌ای اعمال نشد.`)
  const complete = eligible.filter(id => recorded.has(id))
  return {
    cafes: complete.length ? selectTopMenuCafes(cafes, { scope: 'selected', sourceIds: complete }) : [],
    skipped: { excluded, missing, incomplete: absentFromSnapshot },
  }
}

/**
 * برچسب‌گذاریِ کاتالوگ با وضعیت حضور در منبع.
 *
 * ═══ مسئله‌ای که این حل می‌کند ═══
 *
 * کاتالوگِ ادمین از دیتابیس ساخته می‌شود (هر `place` که `source_id` دارد)، اما
 * منبع مستقل است و ممکن است مجموعه‌ها را حذف کند. این برچسب به ادمین نشان
 * می‌دهد کدام شناسه در آخرین فهرست نبود؛ اجرای تازه هر شناسه را دوباره می‌سنجد
 * و غایب‌ها را بدون متوقف‌کردن بقیه کنار می‌گذارد.
 *
 * این تابع فقط وضعیت آخرین فهرست را نشان می‌دهد. برای اجرای تازه، تنها فهرست
 * کامل و اعتبارسنجی‌شدهٔ همان اجرا می‌تواند مبنای کنارگذاشتن شناسه باشد.
 *
 * @param targets کاتالوگِ فعلی
 * @param sourceIds شناسه‌هایی که در snapshot/فهرست اخیرِ منبع دیده شده‌اند؛
 *                 آرایه‌ی خالی یعنی «فهرست منبع در دسترس نبود» — نه «منبع خالی است».
 */
export function annotateSourceAvailability(
  targets: TopMenuTarget[],
  sourceIds: readonly number[],
): TopMenuTarget[] {
  if (!sourceIds.length) return targets
  const known = new Set(sourceIds)
  return targets.map(target => target.inSource === true
    ? target
    : { ...target, inSource: known.has(target.sourceId) })
}

/**
 * شناسه‌هایی از یک انتخاب که می‌دانیم در منبع نیستند.
 *
 * فقط `inSource === false` برمی‌گردد. `undefined` عمداً نادیده گرفته می‌شود: در
 * حالت نامعلوم و حتی غیبتِ قبلی هر دو اجازهٔ ارسال دارند؛ فهرست کاملِ همین
 * اجرای جدید تشخیص می‌دهد کدام شناسه‌ها واقعاً باید کنار گذاشته شوند.
 */
export function staleSelectionIds(targets: TopMenuTarget[], sourceIds: readonly number[]): number[] {
  const stale = new Set(targets.filter(target => target.inSource === false).map(target => target.sourceId))
  return sourceIds.filter(id => stale.has(id))
}
