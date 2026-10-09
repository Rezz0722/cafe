import type { RawCafe } from '../import/source'
import { isTopMenuSourceExcluded } from './topMenuExclusions'

export interface TopMenuSelection { scope: 'all' | 'selected'; sourceIds: number[] }
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
   * `false` = در دیتابیس هست ولی منبع آن را حذف کرده — قابل اسکرپ نیست.
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
   * `undefined` می‌ماند و رفتار سیستم دقیقاً مثل قبل است — گاردِ `selectTopMenuCafes`
   * و fail-fast اسکرپر، هر دو دست‌نخورده باقی می‌مانند.
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
 * برچسب‌گذاریِ کاتالوگ با وضعیت حضور در منبع.
 *
 * ═══ مسئله‌ای که این حل می‌کند ═══
 *
 * کاتالوگِ ادمین از دیتابیس ساخته می‌شود (هر `place` که `source_id` دارد). منبع
 * هم مستقل است و مجموعه‌ها را حذف می‌کند. نتیجه: کافه‌ای که منبع حذفش کرده در
 * کاتالوگ می‌ماند، تیک می‌خورد، و بعد `topmarket.py` کل اجرا را می‌کشد چون آن
 * شناسه در فهرست منبع نیست. یعنی سه مجموعه‌ی حذف‌شده، ۳۴۹ مجموعه‌ی سالم را هم
 * قفل می‌کنند — و کاربر پیامی می‌بیند که اسم هیچ کافه‌ای در آن نیست.
 *
 * این تابع آن سه را *می‌شناساند* (نه اینکه حذفشان کند) تا ادمین بتواند تیکشان را
 * بردارد. حذفِ خودکار غلط است: ممکن است منبع موقتاً فهرست را ناقص بدهد و ما
 * بی‌دلیل کافه‌های سالم را از دسترس خارج کنیم.
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
 * آیا چک‌باکسِ این ردیف غیرفعال است؟
 *
 * ═══ چرا فقط وقتی تیک نخورده ═══
 *
 * یک ردیفِ حذف‌شده از منبع باید نتواند *تازه* انتخاب شود — ولی اگر از قبل
 * در انتخاب بوده، باید بتوان آن را **برداشت**. `disabled` در HTML هر دو حالت
 * را می‌بندد، و آن‌وقت ادمین در انتخابی گیر می‌افتد که نه می‌تواند آن سه را
 * بردارد و نه اسکرپ را اجرا کند (سرور درخواست را رد می‌کند). عملاً یک بن‌بست با
 * رابط کاربریِ درست.
 *
 * پس قفل، فقط راه *ورود* را می‌بندد؛ راه خروج همیشه باز است.
 */
export function isTargetCheckboxDisabled(target: TopMenuTarget, selected: readonly number[]): boolean {
  return target.inSource === false && !selected.includes(target.sourceId)
}

/**
 * شناسه‌هایی از یک انتخاب که می‌دانیم در منبع نیستند.
 *
 * فقط `inSource === false` برمی‌گردد. `undefined` عمداً نادیده گرفته می‌شود: در
 * حالت نامعلوم، ادمین باید بتواند انتخابش را بفرستد و گاردِ سمتِ اسکرپر تصمیم
 * بگیرد — این تابع جای آن گارد را نمی‌گیرد، فقط کاری می‌کند که خطا *قبل* از
 * پنج دقیقه اسکرپ و با نام کافه برسد.
 */
export function staleSelectionIds(targets: TopMenuTarget[], sourceIds: readonly number[]): number[] {
  const stale = new Set(targets.filter(target => target.inSource === false).map(target => target.sourceId))
  return sourceIds.filter(id => stale.has(id))
}
