import assert from 'node:assert/strict'
import test from 'node:test'
import { formatVisitDate, parseVisitDate } from './persian'

test('تاریخ شمسی فارسی به ISO دیتابیس تبدیل می‌شود', () => {
  assert.equal(parseVisitDate('۱۴۰۵/۰۱/۰۱'), '2026-03-21')
  assert.equal(parseVisitDate('۱۴۰۳-۱-۱'), '2024-03-20')
})

test('تاریخ ISO قدیمی همچنان پذیرفته می‌شود', () => {
  assert.equal(parseVisitDate('2026-09-12'), '2026-09-12')
})

test('تاریخ نامعتبر پذیرفته نمی‌شود', () => {
  assert.equal(parseVisitDate('۱۴۰۵/۱۳/۰۱'), null)
  assert.equal(parseVisitDate('not-a-date'), null)
})

test('تاریخ ذخیره‌شده به شمسی نمایش داده می‌شود', () => {
  assert.equal(formatVisitDate(new Date('2026-03-21T00:00:00Z')), '۱۴۰۵/۰۱/۰۱')
})
test('quick visit dates use Iran day while stored calendar dates remain UTC',()=>{
 const nearMidnight=new Date('2026-09-16T22:00:00Z')
 assert.notEqual(formatVisitDate(nearMidnight),formatVisitDate(nearMidnight,'Asia/Tehran'))
 assert.equal(formatVisitDate(nearMidnight,'Asia/Tehran'),formatVisitDate(new Date('2026-09-17T00:00:00Z')))
})
