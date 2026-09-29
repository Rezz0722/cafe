import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanUserText, normalizeInstagram, normalizeInstagramContentUrl, safeExternalUrl } from './input.ts'

test('کنترل‌های پنهان و bidi override حذف می‌شوند', () => {
  assert.equal(cleanUserText('  کافه\u202E<script>  ', 100), 'کافه<script>')
})

test('اینستاگرام فقط از دامنه و handle معتبر پذیرفته می‌شود', () => {
  assert.equal(normalizeInstagram('https://www.instagram.com/ramouz_cafe/'), 'ramouz_cafe')
  assert.equal(normalizeInstagram('@ramouz.cafe'), 'ramouz.cafe')
  assert.equal(normalizeInstagram('https://instagram.com.evil.test/name'), null)
  assert.equal(normalizeInstagram('bad..name'), null)
})

test('لینک javascript و data رد می‌شود', () => {
  assert.equal(safeExternalUrl('javascript:alert(1)'), null)
  assert.equal(safeExternalUrl('data:text/html,x'), null)
  assert.equal(safeExternalUrl('https://kucafe.ir/x'), 'https://kucafe.ir/x')
})

test('لینک بررسی بلاگر فقط محتوای مستقیم اینستاگرام است', () => {
  assert.equal(
    normalizeInstagramContentUrl('https://instagram.com/reel/ABC_123/?utm_source=test'),
    'https://www.instagram.com/reel/ABC_123/',
  )
  assert.equal(normalizeInstagramContentUrl('https://www.instagram.com/p/POST42/'), 'https://www.instagram.com/p/POST42/')
  assert.equal(normalizeInstagramContentUrl('http://instagram.com/reel/ABC/'), null)
  assert.equal(normalizeInstagramContentUrl('https://instagram.com/ramouz_cafe/'), null)
  assert.equal(normalizeInstagramContentUrl('https://instagram.com.evil.test/reel/ABC/'), null)
})
