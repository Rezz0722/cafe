import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GROUP_LABELS,
  parsePriceCaps,
  parseSettingValue,
  SETTING_DEFAULTS,
  SETTING_DEFS,
  SETTING_DEF_BY_KEY,
  splitList,
  validateSettings,
  type SettingKey,
  type Settings,
} from './registry'
import { authPolicyFrom, dataPolicyFrom, mapPolicyFrom } from './policiesPure'

/**
 * تست رجیستری تنظیمات.
 *
 * ═══ چرا اولین تست، «هم‌خوانی سه فهرست» است ═══
 *
 * هر تنظیم در سه جا نوشته می‌شود: تایپ `Settings`، پیش‌فرض در
 * `SETTING_DEFAULTS`، و تعریف نمایشی در `SETTING_DEFS`. تایپ‌اسکریپت دو تای
 * اول را به هم گره می‌زند ولی سومی را نه — یعنی می‌شود فیلدی اضافه کرد که
 * **هیچ‌وقت در پنل دیده نشود** و کسی نفهمد. این تست همان شکاف را می‌بندد.
 */

const DEFAULT_KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[]

test('هر پیش‌فرض یک تعریف نمایشی دارد', () => {
  const missing = DEFAULT_KEYS.filter((key) => !SETTING_DEF_BY_KEY.has(key))
  assert.deepEqual(missing, [], 'این کلیدها در پنل ادمین دیده نمی‌شوند')
})

test('هر تعریف نمایشی یک پیش‌فرض دارد', () => {
  const orphan = SETTING_DEFS.filter((def) => !(def.key in SETTING_DEFAULTS)).map(
    (d) => d.key,
  )
  assert.deepEqual(orphan, [], 'این تعریف‌ها به هیچ فیلدی وصل نیستند')
})

test('تعریف تکراری وجود ندارد', () => {
  assert.equal(SETTING_DEFS.length, new Set(SETTING_DEFS.map((d) => d.key)).size)
})

test('نوعِ تعریف با نوعِ پیش‌فرض می‌خواند', () => {
  for (const def of SETTING_DEFS) {
    const value = SETTING_DEFAULTS[def.key]
    const expected =
      def.type === 'number' ? 'number' : def.type === 'boolean' ? 'boolean' : 'string'
    assert.equal(typeof value, expected, `${def.key} نوعش نمی‌خواند`)
  }
})

test('هر گروهِ استفاده‌شده برچسب دارد', () => {
  for (const def of SETTING_DEFS) {
    assert.ok(GROUP_LABELS[def.group], `گروه ${def.group} برچسب ندارد`)
  }
})

test('پیش‌فرضِ عددی داخل بازه‌ی مجاز خودش است', () => {
  for (const def of SETTING_DEFS) {
    if (def.type !== 'number') continue
    const value = SETTING_DEFAULTS[def.key] as number
    if (def.min !== undefined) assert.ok(value >= def.min, `${def.key} کمتر از min است`)
    if (def.max !== undefined) assert.ok(value <= def.max, `${def.key} بیشتر از max است`)
  }
})

test('پیش‌فرضِ select یکی از گزینه‌هاست', () => {
  for (const def of SETTING_DEFS) {
    if (def.type !== 'select') continue
    const value = SETTING_DEFAULTS[def.key] as string
    assert.ok(
      def.options?.some((option) => option.value === value),
      `${def.key} پیش‌فرضش در گزینه‌ها نیست`,
    )
  }
})

test('پیش‌فرض‌ها خودشان اعتبارسنجی بین‌فیلدی را رد نمی‌شوند', () => {
  assert.deepEqual(validateSettings(SETTING_DEFAULTS), [])
})

// ═══════════════════════════════════════════════════════════════════════
// تبدیل مقدار فرم
// ═══════════════════════════════════════════════════════════════════════

test('عدد از رشته‌ی فارسی‌شده‌ی جداکننده‌دار خوانده می‌شود', () => {
  assert.equal(parseSettingValue('priceTierCheapMax', '300,000').value, 300000)
  assert.equal(parseSettingValue('priceTierCheapMax', '300٬000').value, 300000)
})

test('عدد بیرون از بازه رد می‌شود', () => {
  assert.ok(parseSettingValue('searchPageSize', '2').error)
  assert.ok(parseSettingValue('searchPageSize', '1000').error)
  assert.equal(parseSettingValue('searchPageSize', '30').value, 30)
})

test('عدد نامعتبر رد می‌شود، خالی هم', () => {
  assert.ok(parseSettingValue('searchPageSize', 'بیست').error)
  assert.ok(parseSettingValue('searchPageSize', '').error)
})

test('بولی از شکل‌های واقعیِ فرم خوانده می‌شود', () => {
  // چک‌باکسِ روشن مقدار `on` می‌فرستد؛ فیلد پنهانِ خاموش `false`.
  assert.equal(parseSettingValue('reviewsEnabled', 'on').value, true)
  assert.equal(parseSettingValue('reviewsEnabled', 'true').value, true)
  assert.equal(parseSettingValue('reviewsEnabled', true).value, true)
  assert.equal(parseSettingValue('reviewsEnabled', false).value, false)
  assert.equal(parseSettingValue('reviewsEnabled', '').value, false)
})

test('گزینه‌ی نامعتبرِ select رد می‌شود', () => {
  assert.ok(parseSettingValue('timeZone', 'Mars/Olympus').error)
  assert.equal(parseSettingValue('timeZone', 'UTC').value, 'UTC')
})

test('کلید ناشناس رد می‌شود', () => {
  assert.ok(parseSettingValue('notASetting' as SettingKey, 'x').error)
})

// ═══════════════════════════════════════════════════════════════════════
// اعتبارسنجی بین‌فیلدی — همان چیزهایی که سایت را قفل می‌کنند
// ═══════════════════════════════════════════════════════════════════════

function withSettings(patch: Partial<Settings>): Settings {
  return { ...SETTING_DEFAULTS, ...patch }
}

function errorKeys(patch: Partial<Settings>): string[] {
  return validateSettings(withSettings(patch)).map((error) => error.key)
}

test('بستنِ هر دو راه ورود مجاز نیست', () => {
  assert.deepEqual(errorKeys({ allowPasswordLogin: false, allowOtpLogin: false }), [
    'allowPasswordLogin',
  ])
  // بستنِ یکی، مجاز است.
  assert.deepEqual(errorKeys({ allowOtpLogin: false }), [])
  assert.deepEqual(errorKeys({ allowPasswordLogin: false, allowOtpLogin: true }), [])
})

test('ثبت‌نام باز بدون پیامک تأیید مجاز نیست', () => {
  assert.deepEqual(errorKeys({
    allowRegistration: true,
    registrationRequiresPhoneVerification: true,
    allowSmsVerification: false,
  }), [
    'allowSmsVerification',
  ])
  assert.deepEqual(errorKeys({
    allowRegistration: true,
    registrationRequiresPhoneVerification: false,
    allowSmsVerification: false,
  }), [])
  assert.deepEqual(errorKeys({ allowRegistration: false, allowSmsVerification: false }), [])
})

test('مرزهای رده‌ی قیمت باید صعودی باشند', () => {
  assert.ok(
    errorKeys({ priceTierCheapMax: 500_000, priceTierMidMax: 400_000 }).includes(
      'priceTierMidMax',
    ),
  )
})

test('زوم پیش‌فرض باید بین کمینه و بیشینه باشد', () => {
  assert.ok(errorKeys({ mapDefaultZoom: 5, mapMinZoom: 9 }).includes('mapDefaultZoom'))
  assert.ok(errorKeys({ mapMinZoom: 18, mapMaxZoom: 12 }).includes('mapMaxZoom'))
})

test('کادر شهر باید معتبر باشد', () => {
  assert.ok(errorKeys({ geoBboxMinLat: 37, geoBboxMaxLat: 36 }).includes('geoBboxMaxLat'))
})

test('منطقه‌ی زمانی ناشناس رد می‌شود', () => {
  // از مسیر `validateSettings` نه `parseSettingValue`: ردیف دستیِ دیتابیس هم
  // باید گرفته شود، نه فقط ورودی فرم.
  assert.ok(errorKeys({ timeZone: 'Nowhere/Nothing' }).includes('timeZone'))
})

test('سرویس مسیریابی ناشناس و فهرست خالی رد می‌شوند', () => {
  assert.ok(errorKeys({ routingServices: 'neshan,yandex' }).includes('routingServices'))
  assert.ok(errorKeys({ routingServices: '' }).includes('routingServices'))
  assert.deepEqual(errorKeys({ routingServices: 'google, neshan' }), [])
})

test('سقف قیمتِ غیرعددی رد می‌شود', () => {
  assert.ok(errorKeys({ priceFilterCaps: 'ارزان,گران' }).includes('priceFilterCaps'))
  assert.ok(errorKeys({ priceFilterCaps: '-5' }).includes('priceFilterCaps'))
})

test('حداکثر طول نظر باید از حداقل بیشتر باشد', () => {
  assert.ok(
    errorKeys({ reviewMinTextLength: 500, reviewMaxTextLength: 100 }).includes(
      'reviewMaxTextLength',
    ),
  )
})

// ═══════════════════════════════════════════════════════════════════════
// کمکی‌ها
// ═══════════════════════════════════════════════════════════════════════

test('splitList با کاما فارسی و فاصله‌ی اضافه کار می‌کند', () => {
  assert.deepEqual(splitList(' neshan ، google,  waze '), ['neshan', 'google', 'waze'])
  assert.deepEqual(splitList(''), [])
})

test('parsePriceCaps مرتب و پاک می‌کند', () => {
  assert.deepEqual(parsePriceCaps('500000, 200000,300000'), [200000, 300000, 500000])
  assert.deepEqual(parsePriceCaps('200000, ابله, -1, 0'), [200000])
})

// ═══════════════════════════════════════════════════════════════════════
// نگاشت تنظیم → سیاست
// ═══════════════════════════════════════════════════════════════════════

test('سیاست ورود، همان اعدادِ تنظیمات را می‌دهد', () => {
  const policy = authPolicyFrom(
    withSettings({ otpLength: 6, sessionDays: 7, viewAsMinutes: 45 }),
  )
  assert.equal(policy.otp.length, 6)
  assert.equal(policy.sessionMaxAgeSec, 7 * 86_400)
  assert.equal(policy.viewAsMaxAgeSec, 45 * 60)
})

test('سیاست داده، کادر و مرزها را درست می‌چیند', () => {
  const policy = dataPolicyFrom(
    withSettings({
      priceTierCheapMax: 100_000,
      priceTierMidMax: 200_000,
      priceStatsMaxItemPrice: 3_000_000,
      priceStatsExcludeServiceSections: true,
      geoBboxMinLat: 30,
    }),
  )
  assert.deepEqual(policy.priceTierBounds, { cheap: 100_000, mid: 200_000 })
  assert.equal(policy.priceStatsMaxItemPrice, 3_000_000)
  assert.equal(policy.priceStatsExcludeServiceSections, true)
  assert.equal(policy.bbox.minLat, 30)
})

test('سیاست نقشه ترتیب سرویس‌ها را حفظ می‌کند', () => {
  const policy = mapPolicyFrom(withSettings({ routingServices: 'google,neshan' }))
  assert.deepEqual(policy.routingServices, ['google', 'neshan'])
})
