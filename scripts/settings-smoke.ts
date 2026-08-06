/**
 * بررسی زنده‌ی تنظیمات روی MySQL.
 *
 *   npm run settings:smoke
 *
 * ═══ چه چیزی اینجا تست می‌شود که در `settings.test.ts` نه ═══
 *
 * تست واحد، منطق خالص را می‌سنجد. این اسکریپت چیزهایی را می‌سنجد که فقط با
 * دیتابیس واقعی معلوم می‌شوند:
 *
 *   • ستون `json` مقدار بولی و عددی را با **همان نوع** برمی‌گرداند یا نه
 *     (MySQL می‌تواند `true` را `1` بدهد و آن‌وقت type-check ما ردش می‌کند)
 *   • upsert روی کلید تکراری کار می‌کند
 *   • کش بعد از ذخیره باطل می‌شود
 *   • اعتبارسنجی بین‌فیلدی **قبل از نوشتن** جلو را می‌گیرد (هیچ ردیفی نماند)
 *   • بازگردانی به پیش‌فرض، ردیف را پاک می‌کند
 *
 * اسکریپت **وضعیت اولیه را برمی‌گرداند**: هر کلیدی که دست‌کاری کند، در پایان
 * به همان چیزی که بود برمی‌گردد. اجرا روی دیتابیس واقعی نباید تنظیمات را
 * عوض کند.
 */

import { closeDb, getDb } from '../src/db/connection'
import { SETTING_DEFAULTS, type SettingKey } from '../src/core/settings/registry'
import {
  getSettings,
  invalidateSettings,
  listOverriddenKeys,
  resetSettings,
  saveSettings,
} from '../src/core/settings/store'

const ACTOR = { userId: 'smoke-test', label: 'settings-smoke' }

let passed = 0
let failed = 0

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1
    console.log(`✓ ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed += 1
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/** کلیدهایی که این اسکریپت دست می‌زند. */
const TOUCHED: SettingKey[] = [
  'siteName',
  'searchPageSize',
  'trackPageViews',
  'defaultSiteMean',
  'routingServices',
  'timeZone',
]

async function main(): Promise<void> {
  const db = getDb()

  // ── وضعیت اولیه، برای برگرداندن در پایان
  const before = await getSettings()
  const overriddenBefore = new Set(await listOverriddenKeys())

  // ── ۱. خواندن روی دیتابیسِ بدون ردیف، پیش‌فرض می‌دهد
  await resetSettings(TOUCHED, ACTOR)
  const fresh = await getSettings()
  check(
    'کلیدِ بی‌ردیف، پیش‌فرضِ کد را می‌گیرد',
    fresh.searchPageSize === SETTING_DEFAULTS.searchPageSize,
    `${fresh.searchPageSize}`,
  )

  // ── ۲. ذخیره و خواندن، با نوع درست
  const saved = await saveSettings(
    {
      siteName: 'کافه‌گردِ آزمایشی ☕',
      searchPageSize: '36',
      trackPageViews: 'false',
      defaultSiteMean: '4.6',
      routingServices: 'google, neshan',
    },
    ACTOR,
  )
  check('ذخیره موفق بود', saved.ok, `${saved.saved.length} کلید`)

  const after = await getSettings()
  check(
    'رشته‌ی فارسی سالم برگشت',
    after.siteName === 'کافه‌گردِ آزمایشی ☕',
    after.siteName,
  )
  check(
    'عدد صحیح، عدد ماند',
    after.searchPageSize === 36 && typeof after.searchPageSize === 'number',
  )
  check(
    'عدد اعشاری دقتش را نگه داشت',
    after.defaultSiteMean === 4.6,
    String(after.defaultSiteMean),
  )
  check(
    'بولی، بولی ماند (نه ۰/۱)',
    after.trackPageViews === false && typeof after.trackPageViews === 'boolean',
    typeof after.trackPageViews,
  )
  check('رشته‌ی فهرستی نرمال ذخیره شد', after.routingServices === 'google, neshan')

  // ── ۳. کش بعد از ذخیره باطل شده — بدون `invalidateSettings` دستی
  check('کش بعد از ذخیره تازه است', (await getSettings()).searchPageSize === 36)

  // ── ۴. upsert روی کلید موجود
  await saveSettings({ searchPageSize: '48' }, ACTOR)
  check(
    'نوشتن دوباره روی همان کلید کار می‌کند',
    (await getSettings()).searchPageSize === 48,
  )
  const [rows] = await db.execute(
    "SELECT COUNT(*) AS c FROM `setting` WHERE `key` = 'searchPageSize'",
  )
  const count = Number((rows as unknown as Record<string, number>[])[0]?.c ?? 0)
  check('یک ردیف بیشتر نساخت', count === 1, `${count} ردیف`)

  // ── ۵. فیلد نامعتبر، بقیه را زمین نمی‌زند
  const mixed = await saveSettings(
    { searchPageSize: 'خیلی', siteName: 'نامِ درست' },
    ACTOR,
  )
  check(
    'فیلد نامعتبر خطا گرفت',
    mixed.errors.some((e) => e.key === 'searchPageSize'),
  )
  check('فیلد درستِ همان فرم ذخیره شد', (await getSettings()).siteName === 'نامِ درست')
  check(
    'عددِ نامعتبر مقدار قبلی را نگه داشت',
    (await getSettings()).searchPageSize === 48,
  )

  // ── ۶. اعتبارسنجی بین‌فیلدی قبل از نوشتن جلو را می‌گیرد
  const lockout = await saveSettings(
    { allowPasswordLogin: 'false', allowOtpLogin: 'false', siteName: 'نباید ذخیره شود' },
    ACTOR,
  )
  check('بستنِ هر دو راه ورود رد شد', !lockout.ok)
  check(
    'و هیچ‌چیزِ دیگری از آن فرم ذخیره نشد',
    (await getSettings()).siteName === 'نامِ درست',
  )

  const badZone = await saveSettings({ timeZone: 'Nowhere/Nothing' }, ACTOR)
  check('منطقه‌ی زمانی ناشناس رد شد', !badZone.ok)

  // ── ۷. ردیفِ خرابِ دستی، تایپ اپ را نمی‌شکند
  await db.execute(
    "INSERT INTO `setting` (`key`, `value`) VALUES ('searchPageSize', JSON_QUOTE('بیست'))" +
      ' ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
  )
  invalidateSettings()
  check(
    'ردیفِ با نوع اشتباه نادیده گرفته می‌شود',
    (await getSettings()).searchPageSize === SETTING_DEFAULTS.searchPageSize,
    String((await getSettings()).searchPageSize),
  )

  // ── ۸. کلیدِ متروک، خطا نمی‌دهد
  await db.execute(
    "INSERT INTO `setting` (`key`, `value`) VALUES ('someRemovedSetting', JSON_QUOTE('x'))" +
      ' ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
  )
  invalidateSettings()
  const withGarbage = await getSettings()
  check('کلید ناشناسِ دیتابیس نادیده گرفته می‌شود', withGarbage.siteName === 'نامِ درست')
  check(
    'و در فهرست «تغییر داده شده» نمی‌آید',
    !(await listOverriddenKeys()).includes('someRemovedSetting' as SettingKey),
  )
  await db.execute("DELETE FROM `setting` WHERE `key` = 'someRemovedSetting'")

  // ── ۹. لاگ تغییرات نوشته شده
  const [auditRows] = await db.execute(
    "SELECT COUNT(*) AS c FROM `audit_log` WHERE `action` = 'settings.update' AND `actor_user_id` = 'smoke-test'",
  )
  const auditCount = Number((auditRows as unknown as Record<string, number>[])[0]?.c ?? 0)
  check('هر ذخیره در audit_log ثبت شد', auditCount >= 3, `${auditCount} ردیف`)

  // ── ۱۰. بازگردانی، ردیف را پاک می‌کند
  await resetSettings(TOUCHED, ACTOR)
  const reset = await getSettings()
  check(
    'بازگردانی، پیش‌فرض را برمی‌گرداند',
    reset.siteName === SETTING_DEFAULTS.siteName &&
      reset.searchPageSize === SETTING_DEFAULTS.searchPageSize,
  )
  const stillThere = (await listOverriddenKeys()).filter((key) => TOUCHED.includes(key))
  check(
    'و ردیف‌ها واقعاً پاک شدند',
    stillThere.length === 0,
    stillThere.join(',') || 'خالی',
  )

  // ── پاک‌سازی: وضعیت اولیه را برگردان
  const restore: Record<string, unknown> = {}
  for (const key of TOUCHED) {
    if (overriddenBefore.has(key)) restore[key] = before[key]
  }
  if (Object.keys(restore).length > 0) {
    await saveSettings(restore, { userId: 'smoke-test', label: 'settings-smoke restore' })
  }
  await db.execute("DELETE FROM `audit_log` WHERE `actor_user_id` = 'smoke-test'")
  console.log(
    `\nوضعیت اولیه برگردانده شد (${Object.keys(restore).length} کلیدِ دست‌کاری‌شده).`,
  )

  console.log(`\n${passed} موفق · ${failed} ناموفق`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDb()
  })
