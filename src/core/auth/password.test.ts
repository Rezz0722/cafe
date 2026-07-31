import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  generatePassword,
  hashPassword,
  isLockedOut,
  pruneFailed,
  verifyPassword,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_LOCKOUT_MIN,
} from './password.ts'

test('رمز درست تأیید می‌شود', () => {
  const h = hashPassword('correct horse battery staple')
  assert.equal(verifyPassword('correct horse battery staple', h), true)
})

test('رمز غلط رد می‌شود', () => {
  const h = hashPassword('secret123')
  assert.equal(verifyPassword('secret124', h), false)
  assert.equal(verifyPassword('', h), false)
})

/** salt یکتا یعنی rainbow table بی‌فایده است. */
test('دو بار هش‌کردن یک رمز، دو نتیجه‌ی متفاوت می‌دهد', () => {
  const a = hashPassword('same')
  const b = hashPassword('same')
  assert.notEqual(a, b)
  assert.equal(verifyPassword('same', a), true)
  assert.equal(verifyPassword('same', b), true)
})

test('ورودی خراب کرش نمی‌کند', () => {
  for (const bad of [null, undefined, '', 'x', 'scrypt$', 'a$b$c$d', 'md5$1$aa$bb']) {
    assert.equal(verifyPassword('any', bad as string | null), false)
  }
})

test('رمز تولیدی طول درست دارد و حروف مبهم ندارد', () => {
  const p = generatePassword(20)
  assert.equal(p.length, 20)
  assert.equal(/[0O1lI]/.test(p), false)
})

test('رمزهای تولیدی تکراری نیستند', () => {
  const set = new Set(Array.from({ length: 50 }, () => generatePassword()))
  assert.equal(set.size, 50)
})

// ── قفل شدن بعد از تلاش‌های ناموفق ──────────────────────────────────
// رمز عبور منقضی نمی‌شود، پس brute-force رویش ارزش دارد.

test('زیر سقف، قفل نمی‌شود', () => {
  const now = Date.now()
  const f = Array.from({ length: LOGIN_MAX_ATTEMPTS - 1 }, () => now - 1000)
  assert.equal(isLockedOut(f, now), false)
})

test('روی سقف، قفل می‌شود', () => {
  const now = Date.now()
  const f = Array.from({ length: LOGIN_MAX_ATTEMPTS }, () => now - 1000)
  assert.equal(isLockedOut(f, now), true)
})

test('تلاش‌های قدیمی‌تر از پنجره شمرده نمی‌شوند', () => {
  const now = Date.now()
  const old = Array.from({ length: LOGIN_MAX_ATTEMPTS * 2 }, () => now - (LOGIN_LOCKOUT_MIN + 1) * 60_000)
  assert.equal(isLockedOut(old, now), false)
  assert.equal(pruneFailed(old, now).length, 0)
})
