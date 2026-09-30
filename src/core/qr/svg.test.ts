import assert from 'node:assert/strict'
import test from 'node:test'
import { qrModulesToSvg } from './svg'

test('ماژول QR به مربع fill تبدیل می‌شود نه stroke حساس به renderer', () => {
  const svg = qrModulesToSvg({ size: 2, data: Uint8Array.from([1, 0, 0, 1]) })
  assert.match(svg, /viewBox="0 0 10 10"/)
  assert.match(svg, /M4 4h1v1h-1z/)
  assert.match(svg, /M5 5h1v1h-1z/)
  assert.doesNotMatch(svg, /stroke=/)
})
