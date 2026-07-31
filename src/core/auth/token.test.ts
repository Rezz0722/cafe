import assert from 'node:assert/strict'
import { test } from 'node:test'
import { signToken, verifyToken, type SessionPayload } from './token.ts'

const SECRET = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)

function payload(over: Partial<SessionPayload> = {}): SessionPayload {
  return {
    userId: 'u-1',
    phone: '09151234567',
    role: 'customer',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...over,
  }
}

test('توکن امضاشده دوباره خوانده می‌شود', () => {
  const p = payload()
  const decoded = verifyToken(signToken(p, SECRET), SECRET)
  assert.deepEqual(decoded, p)
})

/** مهم‌ترین خاصیت: کاربر نتواند نقش خودش را ارتقا دهد. */
test('دستکاری نقش در بدنه، توکن را باطل می‌کند', () => {
  const token = signToken(payload({ role: 'customer' }), SECRET)
  const [body, sig] = token.split('.')

  const tampered = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  tampered.role = 'admin'
  const forgedBody = Buffer.from(JSON.stringify(tampered), 'utf8').toString('base64url')

  // بدنه‌ی عوض‌شده با امضای قدیمی
  assert.equal(verifyToken(`${forgedBody}.${sig}`, SECRET), null)
})

test('امضای دستکاری‌شده رد می‌شود', () => {
  const token = signToken(payload(), SECRET)
  const [body] = token.split('.')
  assert.equal(verifyToken(`${body}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`, SECRET), null)
})

test('توکنِ امضاشده با راز دیگر رد می‌شود', () => {
  assert.equal(verifyToken(signToken(payload(), OTHER), SECRET), null)
})

test('عوض‌کردن راز همه‌ی نشست‌ها را باطل می‌کند', () => {
  const token = signToken(payload(), SECRET)
  assert.notEqual(verifyToken(token, SECRET), null)
  assert.equal(verifyToken(token, 'rotated-secret'), null)
})

test('توکن منقضی رد می‌شود', () => {
  const past = Math.floor(Date.now() / 1000) - 10
  assert.equal(verifyToken(signToken(payload({ exp: past }), SECRET), SECRET), null)
})

test('ورودی‌های خراب کرش نمی‌کنند', () => {
  for (const bad of [undefined, '', 'x', 'a.b', '....', 'notbase64.notbase64']) {
    assert.equal(verifyToken(bad as string | undefined, SECRET), null)
  }
})

test('بدون راز، هیچ توکنی معتبر نیست', () => {
  assert.equal(verifyToken(signToken(payload(), SECRET), ''), null)
})
