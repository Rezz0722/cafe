/**
 * «الان باز است؟» با پشتیبانی شیفت شکسته.
 *
 * ═══ چرا ماژول جدید ═══
 *
 * `openState.ts` قبلی فرض می‌کرد هر روز **یک** بازه دارد. داده‌ی واقعی این را
 * نقض می‌کند: ۴۱۴ روز در فایل منبع دو یا سه شیفت دارند
 * (`شنبه: 12:00-16:30 و 20:00-23:30`). با مدل تک‌بازه‌ای، رستورانی که ظهر و
 * شب باز است در ساعت ۵ بعدازظهر «باز» نشان داده می‌شد.
 *
 * ═══ سه تله‌ای که اینجا بسته شده ═══
 *
 * ۱. **منطقه‌ی زمانی.** سرور ممکن است UTC باشد؛ «الان» باید به وقت تهران
 *    حساب شود وگرنه ساعت ۳:۳۰ اختلاف، همه‌ی کافه‌ها را در نیمه‌شب «باز»
 *    نشان می‌دهد.
 * ۲. **گذر از نیمه‌شب.** کافه‌ای که ۱۶:۰۰ تا ۰۰:۳۰ باز است، ساعت ۰۰:۱۵
 *    *بامداد روز بعد* هنوز باز است — یعنی باید شیفتِ **دیروز** را هم نگاه کرد.
 * ۳. **نامشخص ≠ تعطیل.** روزی که در داده نیست یعنی نمی‌دانیم. نمایش
 *    «تعطیل» برای آن، دروغ است.
 */

import { WEEKDAY_NAMES } from '@/core/import/normalize'

export interface HourShift {
  /** ۰ = شنبه */
  dow: number
  shiftIndex: number
  opensAt: string | null
  closesAt: string | null
  crossesMidnight: boolean
  closed: boolean
}

export type OpenStatus = 'open' | 'closed' | 'unknown'

export interface OpenState {
  status: OpenStatus
  /** «تا ۲۳:۰۰ باز است» · «بسته — شنبه ۰۹:۰۰ باز می‌شود» · «ساعت کاری ثبت نشده» */
  label: string
  /** خطِ دوم، کوتاه‌تر — «کمتر از یک ساعت تا بستن». */
  subLabel: string
  /** دقیقه تا بسته‌شدن، اگر باز است. برای هشدار «نزدیک بستن». */
  minutesToClose: number | null
}

/**
 * منطقه‌ی زمانی پیش‌فرض.
 *
 * تزریق‌شدنی است چون از تنظیمات پنل ادمین می‌آید، ولی پیش‌فرض دارد تا این
 * ماژول **خالص و بدون وابستگی به دیتابیس** بماند و مستقیم قابل تست باشد.
 */
export const DEFAULT_TIME_ZONE = 'Asia/Tehran'
const MINUTES_PER_DAY = 24 * 60

/** «HH:MM» → دقیقه از نیمه‌شب. */
function toMinutes(clock: string): number {
  const [hours, minutes] = clock.split(':').map(Number)
  return (hours ?? 0) * 60 + (minutes ?? 0)
}

/** دقیقه از نیمه‌شب → «HH:MM» فارسی‌سازی‌نشده (نمایش کارِ UI است). */
function fromMinutes(minutes: number): string {
  const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const hours = Math.floor(normalized / 60)
  const mins = normalized % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

export interface TehranNow {
  /** ۰ = شنبه */
  dow: number
  /** دقیقه از نیمه‌شب */
  minutes: number
}

/**
 * «الان» به وقت تهران.
 *
 * از `Intl.DateTimeFormat` استفاده می‌کند نه از افست ثابت `+03:30`: ایران
 * ساعت تابستانی را در ۱۴۰۱ لغو کرد ولی اگر روزی برگردد، `Intl` خودش
 * درست می‌ماند و این کد نه.
 */
export function tehranNow(at: Date = new Date(), timeZone = DEFAULT_TIME_ZONE): TehranNow {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at)

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '0'
  const weekday = get('weekday')
  const hour = Number(get('hour')) % 24
  const minute = Number(get('minute'))

  // هفته‌ی ایرانی از شنبه شروع می‌شود.
  const JS_TO_IR: Record<string, number> = {
    Sat: 0,
    Sun: 1,
    Mon: 2,
    Tue: 3,
    Wed: 4,
    Thu: 5,
    Fri: 6,
  }

  return { dow: JS_TO_IR[weekday] ?? 0, minutes: hour * 60 + minute }
}

interface ResolvedShift {
  /** دقیقه‌ی شروع، در محور زمانِ «امروز» (می‌تواند منفی باشد: شیفت دیروز). */
  start: number
  /** دقیقه‌ی پایان، در همان محور (می‌تواند > ۱۴۴۰ باشد). */
  end: number
  opensAt: string
  closesAt: string
}

/**
 * شیفت‌های مربوط به «حالا» را در یک محور زمانی مشترک می‌چیند.
 *
 * شیفت‌های *دیروز* که از نیمه‌شب گذشته‌اند با شروعِ منفی می‌آیند، و شیفت‌های
 * امروز که از نیمه‌شب می‌گذرند با پایانِ بیش از ۱۴۴۰. با این کار مقایسه‌ی
 * «آیا حالا داخل بازه است» یک مقایسه‌ی ساده‌ی عددی می‌شود.
 */
function resolveShifts(shifts: HourShift[], now: TehranNow): ResolvedShift[] {
  const yesterday = (now.dow + 6) % 7
  const out: ResolvedShift[] = []

  for (const shift of shifts) {
    if (shift.closed || !shift.opensAt || !shift.closesAt) continue
    const start = toMinutes(shift.opensAt)
    const rawEnd = toMinutes(shift.closesAt)
    const end = shift.crossesMidnight || rawEnd <= start ? rawEnd + MINUTES_PER_DAY : rawEnd

    if (shift.dow === now.dow) {
      out.push({ start, end, opensAt: shift.opensAt, closesAt: shift.closesAt })
    } else if (shift.dow === yesterday && end > MINUTES_PER_DAY) {
      // شیفتِ دیروز که تا بامداد امروز ادامه دارد.
      out.push({
        start: start - MINUTES_PER_DAY,
        end: end - MINUTES_PER_DAY,
        opensAt: shift.opensAt,
        closesAt: shift.closesAt,
      })
    }
  }

  return out.sort((a, b) => a.start - b.start)
}

/** روزهایی که در داده ذکر شده‌اند — برای تفکیک «تعطیل» از «نامشخص». */
function knownDays(shifts: HourShift[]): Set<number> {
  return new Set(shifts.map((shift) => shift.dow))
}

/**
 * بعد از حالا، اولین زمانِ باز شدن.
 *
 * تا ۷ روز جلو می‌رود. اگر هیچ روزی بازه‌ی باز نداشت، `null` — یعنی این مکان
 * ساعت کاری قابل استفاده‌ای ثبت نکرده.
 */
function nextOpening(
  shifts: HourShift[],
  now: TehranNow,
): { dow: number; opensAt: string; daysAhead: number } | null {
  for (let daysAhead = 0; daysAhead < 8; daysAhead++) {
    const dow = (now.dow + daysAhead) % 7
    const candidates = shifts
      .filter((shift) => shift.dow === dow && !shift.closed && shift.opensAt)
      .map((shift) => ({ shift, start: toMinutes(shift.opensAt!) }))
      .sort((a, b) => a.start - b.start)

    for (const candidate of candidates) {
      if (daysAhead === 0 && candidate.start <= now.minutes) continue
      return { dow, opensAt: candidate.shift.opensAt!, daysAhead }
    }
  }
  return null
}

const DAY_LABEL = (dow: number) => WEEKDAY_NAMES[dow] ?? ''

/**
 * وضعیت باز/بسته‌بودن.
 *
 * `at` برای تست تزریق می‌شود — بدون آن، تستِ «نیمه‌شب باز است» فقط نیمه‌شب
 * قابل اجرا بود.
 */
export function computeOpenState(
  shifts: HourShift[],
  at: Date = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
): OpenState {
  if (shifts.length === 0) {
    return {
      status: 'unknown',
      label: 'ساعت کاری ثبت نشده',
      subLabel: 'برای اطمینان تماس بگیرید',
      minutesToClose: null,
    }
  }

  const now = tehranNow(at, timeZone)
  const resolved = resolveShifts(shifts, now)
  const current = resolved.find((shift) => now.minutes >= shift.start && now.minutes < shift.end)

  if (current) {
    const minutesToClose = current.end - now.minutes
    // شیفت بعدیِ همین امروز — «تا ۱۶:۳۰ باز، بعد ۲۰:۰۰ دوباره»
    const later = resolved.find((shift) => shift.start >= current.end)
    let subLabel = ''
    if (minutesToClose <= 60) {
      subLabel = `کمتر از یک ساعت تا بستن`
    } else if (later) {
      subLabel = `بعد از ${fromMinutes(toMinutes(later.opensAt))} دوباره باز است`
    }
    return {
      status: 'open',
      label: `تا ${current.closesAt} باز است`,
      subLabel,
      minutesToClose,
    }
  }

  const upcoming = nextOpening(shifts, now)
  const days = knownDays(shifts)

  if (!upcoming) {
    // همه‌ی روزهای ثبت‌شده «تعطیل»اند.
    const allClosed = shifts.every((shift) => shift.closed)
    return {
      status: allClosed ? 'closed' : 'unknown',
      label: allClosed ? 'تعطیل' : 'ساعت کاری نامشخص',
      subLabel: allClosed ? '' : 'برای اطمینان تماس بگیرید',
      minutesToClose: null,
    }
  }

  if (upcoming.daysAhead === 0) {
    return {
      status: 'closed',
      label: `بسته — ${upcoming.opensAt} باز می‌شود`,
      subLabel: 'امروز',
      minutesToClose: null,
    }
  }

  // اگر روزِ جاری در داده نیست، «بسته» گفتن دروغ است.
  const status: OpenStatus = days.has(now.dow) ? 'closed' : 'unknown'
  const dayLabel = upcoming.daysAhead === 1 ? 'فردا' : DAY_LABEL(upcoming.dow)

  return {
    status,
    label: status === 'closed' ? 'الان بسته است' : 'ساعت امروز نامشخص',
    subLabel: `${dayLabel} ${upcoming.opensAt} باز می‌شود`,
    minutesToClose: null,
  }
}

// ═══════════════════════════════════════════════════════════════════════
// نمایش هفته
// ═══════════════════════════════════════════════════════════════════════

export interface DaySchedule {
  dow: number
  dayName: string
  /** «۱۲:۰۰–۱۶:۳۰» و «۲۰:۰۰–۲۳:۳۰» — هر شیفت یک رشته. */
  ranges: string[]
  closed: boolean
  unknown: boolean
  isToday: boolean
}

/**
 * جدول هفته برای نمایش.
 *
 * از شنبه شروع می‌شود و **روز جاری علامت می‌خورد** — کاربر تقریباً همیشه
 * دنبال همان یک سطر است.
 */
export function weekSchedule(
  shifts: HourShift[],
  at: Date = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
): DaySchedule[] {
  const now = tehranNow(at, timeZone)
  const byDay = new Map<number, HourShift[]>()
  for (const shift of shifts) {
    const list = byDay.get(shift.dow)
    if (list) list.push(shift)
    else byDay.set(shift.dow, [shift])
  }

  return WEEKDAY_NAMES.map((dayName, dow) => {
    const dayShifts = (byDay.get(dow) ?? []).sort((a, b) => a.shiftIndex - b.shiftIndex)
    const open = dayShifts.filter((shift) => !shift.closed && shift.opensAt && shift.closesAt)
    return {
      dow,
      dayName,
      ranges: open.map((shift) => `${shift.opensAt}–${shift.closesAt}`),
      closed: dayShifts.length > 0 && open.length === 0,
      unknown: dayShifts.length === 0,
      isToday: dow === now.dow,
    }
  })
}

// ═══════════════════════════════════════════════════════════════════════
// نمایش فشرده‌ی هفته
// ═══════════════════════════════════════════════════════════════════════

export interface DayGroup {
  /** «شنبه تا چهارشنبه» · «پنجشنبه و جمعه» · «جمعه» */
  label: string
  /** روزهای این گروه، به ترتیب. */
  dows: number[]
  ranges: string[]
  closed: boolean
  unknown: boolean
  /** امروز داخل این گروه است — سطر برجسته می‌شود. */
  containsToday: boolean
}

/**
 * چند روزِ **پشت‌سرهم** با ساعت یکسان را در یک سطر می‌آورد.
 *
 * ═══ چرا ═══
 *
 * جدول هفت‌سطری برای داده‌ی واقعی این کافه‌ها تقریباً همیشه هفت بار تکرارِ یک
 * چیز است: اکثرشان شنبه تا چهارشنبه یک ساعت‌اند و فقط پنجشنبه و جمعه تفاوت
 * دارند. هفت سطر برای دو واقعیت، نیم صفحه‌ی موبایل را می‌خورد و کاربر باید
 * هفت بار مقایسه کند تا بفهمد فرقی نیست.
 *
 * ═══ چرا فقط روزهای پشت‌سرهم ═══
 *
 * ادغامِ روزهای پراکنده («شنبه، دوشنبه و پنجشنبه») تکنیکاً فشرده‌تر است ولی
 * خواندنش سخت‌تر از خودِ جدول می‌شود. گروه‌بندی بر محور تقویم، همان چیزی است
 * که کاربر در ذهنش دارد: یک بازه‌ی پیوسته از هفته.
 *
 * هفته دوری بسته نمی‌شود: «جمعه» به «شنبه» نمی‌چسبد، حتی اگر ساعتشان یکی
 * باشد. جدول از شنبه شروع می‌شود و پایانش جمعه است؛ سطرِ «جمعه تا شنبه»
 * ترتیب را می‌شکند.
 */
export function groupedWeekSchedule(
  shifts: HourShift[],
  at: Date = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
): DayGroup[] {
  const week = weekSchedule(shifts, at, timeZone)

  /** دو روز «یکی» شمرده می‌شوند اگر هم وضعیت و هم همه‌ی شیفت‌هایشان یکی باشد. */
  const signature = (day: DaySchedule) =>
    day.unknown ? 'unknown' : day.closed ? 'closed' : day.ranges.join('|')

  const runs: { signature: string; days: DaySchedule[] }[] = []
  for (const day of week) {
    const previous = runs[runs.length - 1]
    if (previous && previous.signature === signature(day)) previous.days.push(day)
    else runs.push({ signature: signature(day), days: [day] })
  }

  return runs.map(({ days }) => {
    const first = days[0]
    const last = days[days.length - 1]
    const label =
      days.length === 1
        ? first.dayName
        : days.length === 2
          ? `${first.dayName} و ${last.dayName}`
          : `${first.dayName} تا ${last.dayName}`

    return {
      label,
      dows: days.map((day) => day.dow),
      ranges: first.ranges,
      closed: first.closed,
      unknown: first.unknown,
      containsToday: days.some((day) => day.isToday),
    }
  })
}
