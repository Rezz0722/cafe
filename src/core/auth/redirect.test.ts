import assert from 'node:assert/strict'
import { test } from 'node:test'
import { safeAuthRedirect } from './redirect.ts'

test('مقصد داخلی همراه query و hash حفظ می‌شود', () => {
  assert.equal(safeAuthRedirect('/cafe/ramouz-cafe?menu=1#item-2'), '/cafe/ramouz-cafe?menu=1#item-2')
})

test('مقصد خارجی، scheme-relative و خراب رد می‌شود', () => {
  for (const value of ['https://evil.test', '//evil.test/x', 'javascript:alert(1)', '', null]) {
    assert.equal(safeAuthRedirect(value), '/profile')
  }
})
