import assert from 'node:assert/strict'
import { test } from 'node:test'
import { safeAuthRedirect, withAuthRedirect } from './redirect.ts'

test('مقصد داخلی همراه query و hash حفظ می‌شود', () => {
  assert.equal(safeAuthRedirect('/cafe/ramouz-cafe?menu=1#item-2'), '/cafe/ramouz-cafe?menu=1#item-2')
})

test('مقصد خارجی، scheme-relative و خراب رد می‌شود', () => {
  for (const value of ['https://evil.test', '//evil.test/x', '/\\evil.test/x', '/\t/evil.test/x', 'javascript:alert(1)', '', null]) {
    assert.equal(safeAuthRedirect(value), '/profile')
  }
})

test('مقصد ثبت تجربه در رفت‌وبرگشت ورود و ثبت‌نام بدون گم‌شدن query/hash می‌ماند', () => {
  const destination = '/cafe/ramouz-cafe?authIntent=review#reviews'
  const login = new URL(withAuthRedirect('/auth', destination), 'https://kucafe.invalid')
  assert.equal(login.searchParams.get('redirect'), destination)
  assert.equal(withAuthRedirect('/auth', '//evil.test'), '/auth?redirect=%2Fprofile')
})
