import 'server-only'

/**
 * خواندن و نوشتن تنظیمات.
 *
 * ═══ چرا کش و چرا کوتاه ═══
 *
 * `getSettings()` تقریباً در هر رندری صدا زده می‌شود (منطقه‌ی زمانی برای
 * «الان باز است؟»، اندازه‌ی صفحه، نام شهر). بدون کش، هر صفحه یک `SELECT`
 * اضافه می‌زند. کش ۳۰ ثانیه‌ای است تا ادمین بعد از ذخیره، اثرش را در همان
 * چند ثانیه ببیند — و `invalidateSettings()` هم بلافاصله صدا زده می‌شود.
 *
 * ═══ چرا روی دیتابیسِ خالی هم کار می‌کند ═══
 *
 * هر کلیدی که در جدول نباشد، پیش‌فرضِ کد را می‌گیرد. پس سایت روی یک دیتابیس
 * تازه بالا می‌آید و ادمین فقط چیزهایی را که می‌خواهد عوض کند ذخیره می‌کند —
 * جدول `setting` فقط **تفاوت‌ها** را نگه می‌دارد، نه یک کپی از همه‌چیز.
 */

import { eq, inArray } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { auditLog, setting as settingTable } from '@/db/schema'
import {
  parseSettingValue,
  SETTING_DEFAULTS,
  SETTING_DEF_BY_KEY,
  validateSettings,
  type SettingKey,
  type Settings,
  type ValidationError,
} from './registry'

const CACHE_TTL_MS = 30_000

/**
 * دسترسی با کلیدِ رشته‌ای به `Settings`.
 *
 * `Settings` عمداً index signature ندارد تا تایپو در نام کلید، خطای کامپایل
 * بدهد. ولی این ماژول ذاتاً با کلیدهای داینامیک (از فرم، از دیتابیس) کار
 * می‌کند، پس فقط همین‌جا و در همین یک تابع، تایپ باز می‌شود.
 */
function bag(settings: Settings): Record<string, unknown> {
  return settings as unknown as Record<string, unknown>
}

/**
 * شناسه‌ی موجودیت برای `audit_log`.
 *
 * ═══ چرا فهرست کلیدها اینجا نمی‌آید ═══
 *
 * `audit_log.entity_id` یک `varchar(64)` **ایندکس‌شده** است و برای شناسایی
 * *یک* موجودیت ساخته شده. چسباندن نامِ کلیدها با کاما، در ذخیره‌ی یک گروهِ
 * شش‌فیلدی از ۶۴ کاراکتر می‌گذشت و کل نوشتن را با
 * `ER_DATA_TOO_LONG` می‌ترکاند — یعنی ذخیره‌ی تنظیمات شکست می‌خورد، آن هم
 * فقط وقتی ادمین چند فیلد را با هم عوض می‌کرد.
 *
 * پس فهرست کامل در `before`/`after` (که `json`اند) می‌رود و اینجا یا نام
 * همان یک کلید می‌آید یا تعدادشان.
 */
function auditEntityId(keys: string[]): string {
  if (keys.length === 1) return keys[0]!.slice(0, 64)
  return `${keys.length} keys`
}

interface SettingsCache {
  value?: Settings
  at?: number
}

const cache = globalThis as unknown as { __cafegardSettings?: SettingsCache }
cache.__cafegardSettings ??= {}

/**
 * تنظیمات فعلی — پیش‌فرض‌ها با مقادیر دیتابیس بازنویسی می‌شوند.
 *
 * اگر خواندن دیتابیس بشکند، **پیش‌فرض‌ها** برگردانده می‌شوند نه خطا: یک
 * جدول تنظیماتِ در دسترس‌نبودن نباید کل سایت را پایین بیاورد.
 */
export async function getSettings(): Promise<Settings> {
  const now = Date.now()
  const cached = cache.__cafegardSettings!
  if (cached.value && cached.at && now - cached.at < CACHE_TTL_MS) return cached.value

  const merged: Settings = { ...SETTING_DEFAULTS }

  try {
    const db = getDb()
    const rows = await db.select().from(settingTable)
    for (const row of rows) {
      const key = row.key as SettingKey
      if (!(key in SETTING_DEFAULTS)) continue // کلید متروک — نادیده گرفته می‌شود
      const stored = row.value
      // مقدار در JSON ذخیره شده؛ نوعش باید با پیش‌فرض بخواند، وگرنه یک
      // ردیفِ خرابِ دستی می‌تواند تایپ کل اپ را نقض کند.
      if (typeof stored === typeof SETTING_DEFAULTS[key]) {
        bag(merged)[key] = stored
      }
    }
  } catch (error) {
    console.warn('[settings] خواندن از دیتابیس نشد؛ پیش‌فرض‌ها استفاده می‌شوند.', error)
    return merged
  }

  cache.__cafegardSettings = { value: merged, at: now }
  return merged
}

export function invalidateSettings(): void {
  cache.__cafegardSettings = {}
}

export interface SaveResult {
  ok: boolean
  /** تنظیم‌هایی که ذخیره شدند. */
  saved: SettingKey[]
  /** خطاهای فیلدی — بقیه‌ی فیلدها ذخیره شده‌اند. */
  errors: ValidationError[]
}

/**
 * ذخیره‌ی یک دسته تنظیم.
 *
 * ═══ قاعده‌ی «خطای یک فیلد، نُه فیلد دیگر را زمین نمی‌زند» ═══
 *
 * فیلدهای نامعتبر رد می‌شوند و بقیه ذخیره می‌شوند، ولی **اعتبارسنجی
 * بین‌فیلدی** قبل از نوشتن اجرا می‌شود: اگر نتیجه‌ی نهایی سایت را در وضعیت
 * غیرقابل‌ورود بگذارد، **هیچ‌چیز** ذخیره نمی‌شود. آن حالت برگشت‌پذیر نیست.
 */
export async function saveSettings(
  patch: Record<string, unknown>,
  actor: { userId: string; label: string },
): Promise<SaveResult> {
  const current = await getSettings()
  const errors: ValidationError[] = []
  const accepted = new Map<SettingKey, unknown>()

  for (const [rawKey, rawValue] of Object.entries(patch)) {
    const key = rawKey as SettingKey
    if (!(key in SETTING_DEFAULTS)) continue
    const { value, error } = parseSettingValue(key, rawValue)
    if (error) {
      errors.push({ key, message: error })
      continue
    }
    accepted.set(key, value)
  }

  const next: Settings = { ...current }
  for (const [key, value] of accepted) {
    bag(next)[key] = value
  }

  // اعتبارسنجی بین‌فیلدی — اگر نتیجه بی‌معنی است، هیچ‌چیز نوشته نمی‌شود.
  const crossErrors = validateSettings(next)
  if (crossErrors.length > 0) {
    return { ok: false, saved: [], errors: [...errors, ...crossErrors] }
  }

  // فقط چیزهایی که واقعاً عوض شده‌اند نوشته می‌شوند: ردیفِ بی‌تغییر یعنی
  // یک سطر بی‌فایده در `audit_log` و یک ردیف اضافه در `setting`.
  const changed = [...accepted.entries()].filter(
    ([key, value]) => value !== bag(current)[key],
  )

  if (changed.length === 0) {
    return { ok: errors.length === 0, saved: [], errors }
  }

  const db = getDb()
  for (const [key, value] of changed) {
    await db
      .insert(settingTable)
      .values({ key, value, updatedByUserId: actor.userId })
      .onDuplicateKeyUpdate({ set: { value, updatedByUserId: actor.userId } })
  }

  await db.insert(auditLog).values({
    actorUserId: actor.userId,
    actorLabel: actor.label,
    action: 'settings.update',
    entity: 'setting',
    entityId: auditEntityId(changed.map(([key]) => key)),
    before: Object.fromEntries(changed.map(([key]) => [key, bag(current)[key]])),
    after: Object.fromEntries(changed),
  })

  invalidateSettings()
  return { ok: errors.length === 0, saved: changed.map(([key]) => key), errors }
}

/** برگرداندن یک تنظیم به پیش‌فرضِ کد — ردیفش پاک می‌شود. */
export async function resetSettings(
  keys: SettingKey[],
  actor: { userId: string; label: string },
): Promise<void> {
  const valid = keys.filter((key) => key in SETTING_DEFAULTS)
  if (valid.length === 0) return

  const current = await getSettings()
  const db = getDb()
  await db.delete(settingTable).where(inArray(settingTable.key, valid))
  await db.insert(auditLog).values({
    actorUserId: actor.userId,
    actorLabel: actor.label,
    action: 'settings.reset',
    entity: 'setting',
    // مقدارهای قبلی در `before` می‌آیند تا بازگردانی قابل رهگیری بماند.
    entityId: auditEntityId(valid),
    before: Object.fromEntries(valid.map((key) => [key, bag(current)[key]])),
    after: null,
  })
  invalidateSettings()
}

/** کلیدهایی که از پیش‌فرض فاصله گرفته‌اند — برای نمایش «تغییر داده شده». */
export async function listOverriddenKeys(): Promise<SettingKey[]> {
  try {
    const db = getDb()
    const rows = await db.select({ key: settingTable.key }).from(settingTable)
    return rows
      .map((row) => row.key as SettingKey)
      .filter((key) => key in SETTING_DEFAULTS)
  } catch {
    return []
  }
}

/** آخرین زمان تغییر تنظیمات — برای نمایش در پنل. */
export async function getSettingsUpdatedAt(): Promise<Date | null> {
  try {
    const db = getDb()
    const rows = await db.select({ updatedAt: settingTable.updatedAt }).from(settingTable)
    if (rows.length === 0) return null
    return rows.reduce<Date | null>(
      (latest, row) => (!latest || row.updatedAt > latest ? row.updatedAt : latest),
      null,
    )
  } catch {
    return null
  }
}

export { eq, SETTING_DEF_BY_KEY }
