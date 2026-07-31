import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizePhone, isValidPhone, maskPhone } from './phone.ts'
import {
  canRequestCode,
  createOtpRecord,
  generateCode,
  hashCode,
  verifyCode,
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_PER_HOUR,
  OTP_RESEND_COOLDOWN_SEC,
  OTP_MAX_GLOBAL_PER_HOUR,
  isGlobalLimitReached,
  pruneGlobal,
  type OtpRecord,
} from './otp.ts'

// ── نرمال‌سازی شماره ────────────────────────────────────────────────
// اگر «۰۹۱۵…» و «+98915…» دو کاربر جدا بسازند، یک نفر دو حساب دارد.

test('شکل‌های مختلف یک شماره به یک چیز می‌رسند', () => {
  const canonical = '09151234567'
  for (const variant of [
    '09151234567',
    '9151234567',
    '+989151234567',
    '00989151234567',
    '0915 123 4567',
    '0915-123-4567',
    '۰۹۱۵۱۲۳۴۵۶۷',
  ]) {
    assert.equal(normalizePhone(variant), canonical, `شکست روی: ${variant}`)
  }
})

test('شماره‌ی نامعتبر رد می‌شود', () => {
  for (const bad of ['', '0912', '08151234567', '091512345678', 'abcdefghijk']) {
    assert.equal(normalizePhone(bad), null, `باید رد می‌شد: ${bad}`)
  }
})

test('isValidPhone و maskPhone', () => {
  assert.equal(isValidPhone('09151234567'), true)
  assert.equal(isValidPhone('12345'), false)
  assert.equal(maskPhone('09151234567'), '0915***4567')
})

// ── تولید کد ────────────────────────────────────────────────────────

test('کد طول درست دارد و فقط رقم است', () => {
  for (let i = 0; i < 50; i += 1) {
    const code = generateCode()
    assert.equal(code.length, OTP_LENGTH)
    assert.match(code, /^\d+$/)
  }
})

test('هش کد به شماره گره خورده — کد یک شماره برای شماره‌ی دیگر کار نمی‌کند', () => {
  assert.notEqual(hashCode('09151234567', '12345'), hashCode('09151234568', '12345'))
})

// ── محدودیت نرخ ─────────────────────────────────────────────────────
// بدون این، یک حلقه‌ی curl کل اعتبار پیامک را می‌سوزاند.

test('اولین درخواست مجاز است', () => {
  const d = canRequestCode(null)
  assert.equal(d.allowed, true)
})

test('درخواست دوباره قبل از پایان فاصله رد می‌شود', () => {
  const now = Date.now()
  const rec: OtpRecord = createOtpRecord('09151234567', '11111', [now], now)
  const d = canRequestCode(rec, now + 10_000)
  assert.equal(d.allowed, false)
  if (!d.allowed) assert.ok(d.retryAfterSec > 0)
})

test('بعد از پایان فاصله دوباره مجاز می‌شود', () => {
  const now = Date.now()
  const rec: OtpRecord = createOtpRecord('09151234567', '11111', [now], now)
  const d = canRequestCode(rec, now + (OTP_RESEND_COOLDOWN_SEC + 1) * 1000)
  assert.equal(d.allowed, true)
})

test('سقف ساعتی اعمال می‌شود', () => {
  const now = Date.now()
  // پنج درخواست، هرکدام با فاصله‌ی کافی، ولی همه داخل یک ساعت
  const stamps = Array.from({ length: OTP_MAX_PER_HOUR }, (_, i) => now - i * 100_000)
  const rec: OtpRecord = createOtpRecord('09151234567', '11111', stamps, now)
  const d = canRequestCode(rec, now + 200_000)
  assert.equal(d.allowed, false, 'باید به سقف ساعتی خورده باشد')
})

test('درخواست‌های قدیمی‌تر از یک ساعت شمرده نمی‌شوند', () => {
  const now = Date.now()
  const old = Array.from({ length: OTP_MAX_PER_HOUR }, (_, i) => now - 3600_000 - i * 1000)
  const rec: OtpRecord = createOtpRecord('09151234567', '11111', old, now)
  const d = canRequestCode(rec, now)
  assert.equal(d.allowed, true)
})

// ── تأیید کد ────────────────────────────────────────────────────────

test('کد درست پذیرفته می‌شود', () => {
  const now = Date.now()
  const rec = createOtpRecord('09151234567', '54321', [now], now)
  assert.deepEqual(verifyCode(rec, '09151234567', '54321', now), { ok: true })
})

test('کد غلط رد می‌شود و تلاش باقی‌مانده را می‌گوید', () => {
  const now = Date.now()
  const rec = createOtpRecord('09151234567', '54321', [now], now)
  const r = verifyCode(rec, '09151234567', '00000', now)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.burned, false)
})

test('کد منقضی رد می‌شود و می‌سوزد', () => {
  const now = Date.now()
  const rec = createOtpRecord('09151234567', '54321', [now], now)
  const r = verifyCode(rec, '09151234567', '54321', now + 10 * 60_000)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.burned, true)
})

test('بعد از سقف تلاش، کد می‌سوزد — جلوی brute-force', () => {
  const now = Date.now()
  const rec: OtpRecord = {
    ...createOtpRecord('09151234567', '54321', [now], now),
    attempts: OTP_MAX_ATTEMPTS,
  }
  // حتی با کد *درست* هم باید رد شود
  const r = verifyCode(rec, '09151234567', '54321', now)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.burned, true)
})

test('آخرین تلاش ناموفق، کد را می‌سوزاند', () => {
  const now = Date.now()
  const rec: OtpRecord = {
    ...createOtpRecord('09151234567', '54321', [now], now),
    attempts: OTP_MAX_ATTEMPTS - 1,
  }
  const r = verifyCode(rec, '09151234567', '99999', now)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.burned, true)
})

test('کد یک شماره برای شماره‌ی دیگر کار نمی‌کند', () => {
  const now = Date.now()
  const rec = createOtpRecord('09151234567', '54321', [now], now)
  const r = verifyCode(rec, '09159999999', '54321', now)
  assert.equal(r.ok, false)
})

test('نبود رکورد امن است', () => {
  const r = verifyCode(null, '09151234567', '54321')
  assert.equal(r.ok, false)
})

// ── سقف سراسری ──────────────────────────────────────────────────────
// سقف per-phone با عوض‌کردن شماره دور زده می‌شود؛ این لایه آن را می‌بندد.

test('سقف سراسری بعد از حد مجاز فعال می‌شود', () => {
  const now = Date.now()
  const under = Array.from({ length: OTP_MAX_GLOBAL_PER_HOUR - 1 }, (_, i) => now - i * 1000)
  assert.equal(isGlobalLimitReached(under, now), false)

  const at = Array.from({ length: OTP_MAX_GLOBAL_PER_HOUR }, (_, i) => now - i * 1000)
  assert.equal(isGlobalLimitReached(at, now), true)
})

test('درخواست‌های سراسریِ قدیمی‌تر از یک ساعت شمرده نمی‌شوند', () => {
  const now = Date.now()
  const old = Array.from({ length: OTP_MAX_GLOBAL_PER_HOUR * 2 }, () => now - 3700_000)
  assert.equal(isGlobalLimitReached(old, now), false)
  assert.equal(pruneGlobal(old, now).length, 0)
})
