/**
 * تجزیه‌ی لاگ اسکرپ/اعمال — بدون هیچ دسترسی به فایل‌سیستم.
 *
 * ═══ چرا این فایل از `topMenuLogStore` جداست ═══
 *
 * این ماژول باید هم در پنل ادمین (کلاینت) و هم در مسیر API (سرور) استفاده شود.
 * اگر `node:fs` همین‌جا import می‌شد، باندلِ مرورگر هنگام import می‌ترکید.
 * پس منطقِ خالص اینجاست و خواندنِ فایل در `topMenuLogStore.ts` که `server-only`
 * دارد — همان تفکیکی که `db/connection.ts` و `db/client.ts` دارند.
 *
 * ═══ چه چیزی از لاگ درمی‌آید ═══
 *
 * `topmarket.py` پیشرفت را فقط با `print` می‌نویسد و همان stdout مستقیم به
 * `scrape.log` می‌رود. این ماژول همان متن را به وضعیتِ قابل نمایش تبدیل می‌کند:
 * مرحله، «چندتا از چند تا»، نام کافه‌ی در حال اسکرپ، و شمار خطاها.
 *
 * عمداً هیچ چیزی اینجا *حدس* زده نمی‌شود: هر عددی که در UI نشان داده می‌شود از
 * یک خطِ واقعیِ لاگ آمده. لاگِ قدیمی یا ناقص، `null` می‌دهد نه عددِ ساختگی.
 */

export type TopMenuStage = 'listing' | 'scraping' | 'finishing' | 'done' | 'unknown'

export interface TopMenuProgress {
  stage: TopMenuStage
  /** کافه‌های تمام‌شده؛ فقط وقتی معتبر است که `total` هم باشد. */
  done: number | null
  total: number | null
  /** نام کافه‌ای که همین الان دارد پردازش می‌شود. */
  currentName: string | null
  currentUsername: string | null
  /** مجموع آیتم‌های منوی پیدا‌شده تا این لحظه. */
  itemsFound: number
  /** تعداد مجموعه‌هایی که دست‌کم یک خطا داشته‌اند (نه تعداد خطا). */
  failedCafes: number
  /** مجموعه‌هایی که خطا داشته‌اند و در انتهای لاگ فهرست شده‌اند. */
  lastFailure: string | null
  lastLine: string | null
}

const EMPTY: TopMenuProgress = {
  stage: 'unknown', done: null, total: null, currentName: null, currentUsername: null,
  itemsFound: 0, failedCafes: 0, lastFailure: null, lastLine: null,
}

/** `[12/352] کافه ونگوگ (vangogh) ...` */
const ITEM_LINE = /^\[(\d+)\/(\d+)\]\s+(.+?)\s+\(([^)]*)\)\s*\.\.\.\s*$/
/** `    42 آیتم منو پیدا شد.` */
const ITEMS_LINE = /^\s*(\d+)\s+آیتم\s+منو\s+پیدا\s+شد/
/** `    خطا: hours: 403 Client Error: ...` */
const ERROR_LINE = /^\s*خطا:\s*(.+)$/
/** `  صفحه 3/18 از providerها گرفته شد (مجموع تاکنون: 60 از 355)` */
const PAGE_LINE = /^\s*صفحه\s+(\d+)\/(\d+)\s+از\s+providerها/
/** `تعداد کافه/رستوران‌هایی که پردازش می‌شن: 352` */
const TOTAL_LINE = /پردازش\s+می‌شن:\s*(\d+)/
/** `تمام شد.` */
const DONE_LINE = /^تمام\s+شد\.?\s*$/

/**
 * وضعیت فعلی از روی متن لاگ.
 *
 * @param text کل یا دنباله‌ای از لاگ. دنباله هم کافی است، ولی اگر دنباله
 *            وسط یک مجموعه باشد شمارش خطا کمتر از واقعیت می‌شود — که در UI
 *            به شکل «۰ خطا» دیده می‌شود، نه عددِ غلطِ بزرگ.
 */
export function parseTopMenuLog(text: string): TopMenuProgress {
  const result: TopMenuProgress = { ...EMPTY }
  if (!text.trim()) return result

  // خطای مجموعه‌ی *در حال پردازش* جدا نگه داشته می‌شود تا با دیدن خطای بعدی
  // نشماریم یک مجموعه را دو بار.
  let currentFailed = false
  let seenLines = 0

  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '').trimEnd()
    if (!line) continue
    seenLines++
    result.lastLine = line

    const item = ITEM_LINE.exec(line)
    if (item) {
      // مجموعه‌ی قبلی همین‌جا تمام می‌شود.
      if (currentFailed) { result.failedCafes++; currentFailed = false }
      result.done = Number(item[1])
      result.total = Number(item[2])
      result.currentName = item[3] || null
      result.currentUsername = item[4] || null
      result.stage = 'scraping'
      continue
    }

    if (ERROR_LINE.test(line)) { currentFailed = true; result.lastFailure = line.trim(); continue }

    const items = ITEMS_LINE.exec(line)
    if (items) { result.itemsFound += Number(items[1]); continue }

    if (PAGE_LINE.test(line)) { result.stage = 'listing'; continue }
    if (TOTAL_LINE.test(line)) { result.total ??= Number(TOTAL_LINE.exec(line)![1]); continue }
    if (DONE_LINE.test(line)) {
      if (currentFailed) { result.failedCafes++; currentFailed = false }
      result.stage = 'done'
      continue
    }
  }

  // مجموعه‌ای که لاگ وسطش قطع شده، هنوز «تمام» نشده — ولی خطایش دیده شده.
  if (currentFailed && result.stage === 'scraping') result.failedCafes++

  // «تمام شد» بعد از هر چیزی یعنی فاز اسکرپ بسته شده، حتی اگر تعداد کل نیامده باشد.
  if (result.stage === 'done' && result.done === null) result.done = result.total
  /*
   * `done >= total` عمداً «finishing» نمی‌شود. عددِ `[3/3]` یعنی مجموعه‌ی آخر *شروع*
   * شده، نه تمام؛ فایل‌های JSON بعد از حلقه نوشته می‌شوند و ما تا دیدنِ خطِ
   * «تمام شد» از آن بی‌خبریم. گفتنِ «در حال نوشتن خروجی» در آن لحظه، ادعایی است
   * که لاگ پشتیبانی‌اش نمی‌کند.
   */
  if (result.stage === 'unknown' && seenLines > 0 && result.total !== null) result.stage = 'listing'

  return result
}

/**
 * زمان باقی‌مانده، بر پایه‌ی سرعت واقعیِ همین اجرا.
 *
 * @param startedAt زمان شروع به میلی‌ثانیه
 * @param done کافه‌های تمام‌شده
 * @param total کل کافه‌ها
 * @param now زمان مرجع؛ برای تست تزریق می‌شود
 * @returns میلی‌ثانیه، یا `null` وقتی برآورد معنی‌دار نیست
 *
 * میانگینِ ساده است، نه رگرسیون: نرخ اسکرپ در طول اجرا تقریباً ثابت است (۳
 * درخواست و یک `delay` به‌ازای هر مجموعه). میانگین ساده قابل توضیح است و
 * عددی می‌دهد که کاربر می‌تواند به آن اعتماد کند.
 *
 * `now` پارامتر است نه `Date.now()` در بدنه: بدون آن، هر assertِ عددی در تست
 * با چند میلی‌ثانیه اختلاف می‌خورد و تست به‌شکل تصادفی پاس یا رد می‌شود —
 * که در آزمایش اول روی /opt پاس شد و روی /var/www رد.
 */
export function estimateRemainingMs(
  startedAt: number,
  done: number | null,
  total: number | null,
  now: number = Date.now(),
): number | null {
  if (!total || done === null || done <= 0) return null
  if (done >= total) return 0
  const perCafe = (now - startedAt) / done
  /*
   * نرخِ بی‌دلیل‌تر از یک مجموعه در ثانیه، نرخِ واقعی نیست: اسکرپر برای هر
   * مجموعه سه درخواست و سه `delay` یک‌ثانیه‌ای می‌زند. نمایشِ برآوردِ حاصل از
   * چند صد میلی‌ثانیه، عددی است که فقط در ثانیه‌های اول درست از آب درمی‌آید و
   * بعداً غلط — یعنی دقیقاً همان چیزی که نباید به ادمین نشان داد.
   */
  if (perCafe < 1000) return null
  return Math.round(perCafe * (total - done))
}

export const TOP_MENU_STAGE_LABELS: Record<TopMenuStage, string> = {
  listing: 'در حال گرفتن فهرست مجموعه‌ها',
  scraping: 'در حال اسکرپ منو',
  finishing: 'در حال نوشتن خروجی',
  done: 'اسکرپ تمام شد',
  unknown: 'در انتظار اولین خط لاگ',
}
