import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimateRemainingMs, parseTopMenuLog } from './topMenuLog'

test('an empty log yields unknown, never a fabricated zero', () => {
  for (const text of ['', '   ', '\n\n']) {
    const progress = parseTopMenuLog(text)
    assert.equal(progress.stage, 'unknown')
    assert.equal(progress.done, null)
    assert.equal(progress.total, null)
    assert.equal(progress.itemsFound, 0)
  }
})

test('current café and totals come from the real progress lines', () => {
  const progress = parseTopMenuLog([
    'در حال گرفتن لیست کامل کافه/رستوران\u200cها ...',
    '  صفحه 1/18 از providerها گرفته شد (مجموع تاکنون: 20 از 355)',
    'تعداد کافه/رستوران\u200cهایی که پردازش می\u200cشن: 3',
    '[2/3] کافه ونگوگ (vangogh) ...',
    '    62 آیتم منو پیدا شد.',
    '[3/3] باغ مهستان (mahestan) ...',
  ].join('\n'))
  assert.equal(progress.stage, 'scraping')
  assert.equal(progress.done, 3)
  assert.equal(progress.total, 3)
  assert.equal(progress.currentName, 'باغ مهستان')
  assert.equal(progress.currentUsername, 'mahestan')
  assert.equal(progress.itemsFound, 62)
})

test('a truncated tail still reports the café it stopped on', () => {
  // دقیقاً همان چیزی که هنگام اسکرپِ زنده به ما می‌رسد: لاگ وسط یک مجموعه بریده.
  const progress = parseTopMenuLog(['[1/3] اول (one) ...', '    10 آیتم منو پیدا شد.', '[2/3] دوم (two) ...'].join('\n'))
  assert.equal(progress.done, 2)
  assert.equal(progress.currentName, 'دوم')
  assert.equal(progress.itemsFound, 10)
})

test('errors are counted per café, not per line', () => {
  const progress = parseTopMenuLog([
    '[1/2] الف (a) ...',
    '    خطا: hours: 403 Client Error',
    '    خطا: menu: 403 Client Error',
    '[2/2] ب (b) ...',
  ].join('\n'))
  assert.equal(progress.failedCafes, 1)
  assert.match(progress.lastFailure ?? '', /menu: 403/)
})

test('the café in progress is not counted before it finishes', () => {
  // ب (b) هنوز تمام نشده، ولی خطا داده. شمردنش یعنی عددی که بعداً از هوا کم می‌شود.
  const progress = parseTopMenuLog(['[1/2] الف (a) ...', '[2/2] ب (b) ...', '    خطا: menu: 403'].join('\n'))
  assert.equal(progress.stage, 'scraping')
  assert.equal(progress.failedCafes, 1)
})

test('the last index is not mistaken for completion', () => {
  // `[3/3]` یعنی مجموعه‌ی آخر شروع شده. فایل‌های خروجی بعد از حلقه نوشته
  // می‌شوند، پس «در حال نوشتن خروجی» ادعایی است که این لاگ پشتیبانی‌اش نمی‌کند.
  const progress = parseTopMenuLog(['[1/3] الف (a) ...', '[2/3] ب (b) ...', '[3/3] ج (c) ...'].join('\n'))
  assert.equal(progress.stage, 'scraping')
  assert.equal(progress.done, 3)
})

test('completion is detected and moves the stage past scraping', () => {
  const progress = parseTopMenuLog(['[2/2] ب (b) ...', 'تمام شد.', 'تعداد کافه/رستوران\u200cهایی که پردازش شد: 2'].join('\n'))
  assert.equal(progress.stage, 'done')
  assert.equal(progress.done, 2)
})

test('the scraper\u2019s own error line is a failure, not a progress row', () => {
  // این خط از argparse می\u200cآید و با «خطا:» شروع نمی\u200cشود، پس نباید خطا شمرده شود.
  const progress = parseTopMenuLog('topmarket.py: error: بعضی کافه\u200cهای انتخاب\u200cشده در فهرست منبع موجود نیستند')
  assert.equal(progress.failedCafes, 0)
})

test('remaining time needs a real rate', () => {
  // `now` تزریق می‌شود تا assert قطعی باشد؛ با `Date.now()` این تست بین دو اجرا
  // چند میلی‌ثانیه اختلاف می‌گرفت و تصادفی پاس/رد می‌شد.
  const now = 1_000_000, start = now - 60_000
  // ۱۰ از ۱۰۰ در ۶۰ ثانیه ⇒ ۹۰ تای باقی ⇒ ۵۴۰ ثانیه
  assert.equal(estimateRemainingMs(start, 10, 100, now), 540_000)
  assert.equal(estimateRemainingMs(start, 100, 100, now), 0)
  for (const [done, total] of [[0, 100], [null, 100], [10, null], [10, 0]] as const)
    assert.equal(estimateRemainingMs(start, done, total, now), null)
  // آینده‌ای که هنوز نرسیده، نرخِ منفی می‌دهد — عدد الکی نباید نشان داده شود.
  assert.equal(estimateRemainingMs(now + 60_000, 10, 100, now), null)
})

test('a rate measured over a second is not shown as a time', () => {
  // اجرای تازه: «۱ از ۱۰۰ در ۰.۵ ثانیه» یعنی ۵۰ ثانیه باقی که کاملاً الکی است.
  const now = 1_000_000
  assert.equal(estimateRemainingMs(now - 500, 1, 100, now), null)
})
