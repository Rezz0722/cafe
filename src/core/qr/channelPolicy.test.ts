import test from 'node:test'
import assert from 'node:assert/strict'
import { qrLabel, validQrToken, qrSeenCookie, qrRecentlySeen, qrRequestCountable, QR_WINDOW } from './channelPolicy'
const token = 'a'.repeat(32), secret = 'unit-test-secret-000000000000000000000', now = 1000000
test('QR labels: normalize Persian digits, trim, reject long/empty input', () => {
  assert.equal(qrLabel(' میز ۱ ').key, qrLabel('میز 1').key)
  assert.equal(qrLabel('استند   ورودی').label, 'استند ورودی')
  for (const raw of ['', ' ', 'a'.repeat(81)]) assert.throws(() => qrLabel(raw))
})
test('QR token exact random-hex shape, no traversal or guessable integers', () => {
  assert.equal(validQrToken(token), true)
  for (const raw of ['1', '../auth', 'a'.repeat(33), 'A'.repeat(32)]) assert.equal(validQrToken(raw), false)
})
test('QR dedupe cookie bound to token/secret and expires; altered or oversized deadline rejected', () => {
  const value = qrSeenCookie(token, secret, now)
  assert.equal(qrRecentlySeen(value, token, secret, now), true)
  assert.equal(qrRecentlySeen(value, token, secret, now + QR_WINDOW), false)
  for (const bad of [value + '.x', value.slice(0,-1) + 'x', value.replace(String(now + QR_WINDOW), '99999999999999'), undefined]) assert.equal(qrRecentlySeen(bad, token, secret, now), false)
  assert.equal(qrRecentlySeen(value, 'b'.repeat(32), secret, now), false)
  assert.equal(qrRecentlySeen(value, token, secret + 'x', now), false)
})
test('QR count policy excludes HEAD, bots, prefetch and privacy preference', () => {
  const headers = new Headers({ 'user-agent': 'Mozilla/5.0 Android' })
  assert.equal(qrRequestCountable(headers, 'GET'), true)
  assert.equal(qrRequestCountable(headers, 'HEAD'), false)
  assert.equal(qrRequestCountable(new Headers(), 'GET'), false)
  for (const [name, value] of [['user-agent','Googlebot'], ['purpose','prefetch'], ['sec-purpose','prefetch;prerender'], ['dnt','1'], ['sec-gpc','1']]) {
    const input = new Headers(headers); input.set(name!,value!); assert.equal(qrRequestCountable(input,'GET'),false)
  }
})
