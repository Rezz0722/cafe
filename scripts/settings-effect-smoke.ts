/**
 * بررسی اینکه تنظیمات **واقعاً** روی سایت اثر می‌گذارند.
 *
 *   node scripts/settings-effect-smoke.ts [baseUrl]      (با tsx)
 *   npm run settings:effect
 *
 * ═══ چرا این جدا از `settings-smoke.ts` است ═══
 *
 * آن یکی می‌گوید «مقدار درست ذخیره و خوانده شد». این یکی می‌گوید «صفحه‌ی
 * واقعیِ سایت آن مقدار را دید». فاصله‌ی این دو، جایی است که همه‌ی باگ‌های
 * «تنظیم گذاشتم ولی اثری نداشت» زندگی می‌کنند: propی که پاس داده نشده،
 * صفحه‌ای که استاتیک پیش‌تولید شده، یا کشی که باطل نشده.
 *
 * ═══ چرا کند است ═══
 *
 * `getSettings()` سی ثانیه کش دارد و این اسکریپت از **بیرون** به سرور
 * می‌زند، پس `invalidateSettings()` این پروسه به آن پروسه نمی‌رسد. برای همین
 * همه‌ی تغییرها در **یک** ذخیره جمع شده‌اند و فقط دو بار صبر می‌کنیم.
 */

import { closeDb } from '../src/db/connection'
import {
  getSettings,
  listOverriddenKeys,
  resetSettings,
  saveSettings,
} from '../src/core/settings/store'
import type { SettingKey } from '../src/core/settings/registry'

const base = process.argv[2] ?? 'http://127.0.0.1:3001'
const ACTOR = { userId: 'effect-smoke', label: 'settings-effect-smoke' }
/** کمی بیشتر از TTL کش تنظیمات. */
const CACHE_WAIT_MS = 32_000

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

async function html(path: string): Promise<string> {
  const response = await fetch(base + path, {
    headers: { 'user-agent': 'settings-effect' },
  })
  const body = await response.text()
  /*
    React بین دو گره‌ی متنیِ مجاور یک `<!-- -->` می‌گذارد، پس «صفحه ۱ از ۱۴»
    در HTML واقعی «صفحه <!-- -->۱<!-- --> از <!-- -->۱۴» است. حذفشان لازم
    است وگرنه هر بررسیِ متنی روی عددهای درون‌خطی بی‌دلیل رد می‌شود.
  */
  return body.split('<!-- -->').join('')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const TOUCHED: SettingKey[] = [
  'siteName',
  'siteTagline',
  'announcement',
  'searchPageSize',
  'priceFilterCaps',
  'routingServices',
  'showBuildingsFromZoom',
]

async function main(): Promise<void> {
  const before = await getSettings()
  const overriddenBefore = new Set(await listOverriddenKeys())

  // ── وضعیت مبنا
  const baseHome = await html('/')
  check(
    'صفحه‌ی اول با نام پیش‌فرض بالا می‌آید',
    baseHome.includes(before.siteName),
    before.siteName,
  )

  const baseCafe = await html('/cafe/jan-majnoon-lounge')
  check('مسیریابی نشان به‌صورت پیش‌فرض هست', baseCafe.includes('neshan.org/maps/routing'))

  // ── تغییرها، همه با هم
  console.log('\nذخیره‌ی تنظیمات آزمایشی…')
  const saved = await saveSettings(
    {
      siteName: 'کافه‌یاب',
      siteTagline: 'آزمایشِ تنظیمات',
      announcement: 'این یک اعلان آزمایشی است.',
      searchPageSize: '6',
      priceFilterCaps: '123000,456000',
      // نشان حذف می‌شود — اگر پنل واقعاً تنظیم را بخواند، دکمه‌اش نباید باشد.
      routingServices: 'google,waze',
      showBuildingsFromZoom: '17',
    },
    ACTOR,
  )
  check(
    'ذخیره موفق بود',
    saved.ok,
    saved.errors.map((e) => e.message).join(' · ') || 'بی‌خطا',
  )

  console.log(`صبر ${CACHE_WAIT_MS / 1000} ثانیه برای انقضای کش سرور…`)
  await sleep(CACHE_WAIT_MS)

  // ── هویت سایت
  const home = await html('/')
  check('نام سایت در صفحه دیده می‌شود', home.includes('کافه‌یاب'))
  check(
    'عنوان صفحه از تنظیمات ساخته شد',
    home.includes('<title>کافه‌یاب — آزمایشِ تنظیمات'),
  )
  check('بنر اعلان رندر شد', home.includes('این یک اعلان آزمایشی است.'))

  // ── جست‌وجو
  const search = await html('/search')
  /*
    پنل فیلتر تا کلیک‌نشدن باز نمی‌شود، پس سقف‌های قیمت در HTML اولیه *رندر*
    نشده‌اند — ولی به‌عنوان prop در payload هستند. همان را می‌سنجیم؛ رندرشدنِ
    دکمه بعد از باز کردن پنل، کارِ خودِ کامپوننت است نه تنظیمات.
  */
  check('سقف قیمتِ تازه به کلاینت رسید', search.includes('123000'), '123000')
  check('سقف پیش‌فرضِ قبلی رفت', !search.includes('200000'))
  /*
    اندازه‌ی صفحه ۶ شد. با ۳۲۶ نتیجه، تعداد صفحه‌ها ۵۵ می‌شود (با ۲۴ تایی، ۱۴).
    این عدد در نوار صفحه‌بندی سمت سرور رندر می‌شود.
  */
  check(
    'تعداد صفحه‌ها با اندازه‌ی تازه حساب شد',
    search.includes('از ۵۵'),
    'صفحه ۱ از ۵۵',
  )

  // ── مسیریابی
  const cafe = await html('/cafe/jan-majnoon-lounge')
  check('سرویس حذف‌شده دیگر نیست', !cafe.includes('neshan.org/maps/routing'))
  check(
    'سرویس‌های انتخاب‌شده هستند',
    cafe.includes('google.com/maps/dir') && cafe.includes('waze.com/ul'),
  )

  // ── استایل نقشه
  const style = await html('/api/map/style?theme=light')
  check('زومِ ساختمان از تنظیمات آمد', style.includes('"minzoom":17'), 'minzoom=17')

  // ── حالت تعمیر: جداگانه، چون بقیه‌ی بررسی‌ها را می‌بندد
  console.log('\nروشن‌کردن حالت تعمیر…')
  await saveSettings({ maintenanceMode: 'true' }, ACTOR)
  await sleep(CACHE_WAIT_MS)

  const closedHome = await html('/')
  check('صفحه‌ی اول بسته شد', closedHome.includes('ورود مدیران و کافه‌داران'))
  const closedDistrict = await html('/mashhad/vakilabad')
  check(
    'صفحه‌ی محله هم بسته شد (پیش‌تولید استاتیک آن را دور نمی‌زند)',
    closedDistrict.includes('ورود مدیران و کافه‌داران'),
  )
  const closedCafe = await html('/cafe/jan-majnoon-lounge')
  check('صفحه‌ی کافه هم بسته شد', closedCafe.includes('ورود مدیران و کافه‌داران'))
  const authPage = await html('/auth')
  check(
    'ولی صفحه‌ی ورود باز ماند',
    authPage.includes('ورود') && !authPage.includes('ورود مدیران و کافه‌داران'),
  )

  // ── برگرداندن
  console.log('\nبرگرداندن وضعیت اولیه…')
  await resetSettings([...TOUCHED, 'maintenanceMode'], ACTOR)
  const restore: Record<string, unknown> = {}
  for (const key of [...TOUCHED, 'maintenanceMode'] as SettingKey[]) {
    if (overriddenBefore.has(key)) restore[key] = before[key]
  }
  if (Object.keys(restore).length > 0) await saveSettings(restore, ACTOR)
  await sleep(CACHE_WAIT_MS)

  const restored = await html('/')
  check('سایت به حالت اول برگشت', restored.includes(before.siteName))
  check('بنر اعلان رفت', !restored.includes('این یک اعلان آزمایشی است.'))

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
