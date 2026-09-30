/**
 * تست لینک‌های مسیریابی.
 *
 * ═══ چرا این تست وجود دارد ═══
 *
 * لینک بلد ماه‌ها ۴۰۴ می‌داد و هیچ‌کس متوجه نشد: دکمه رندر می‌شد، کلیک می‌خورد،
 * و مرورگر صفحه‌ی خطای *سرویس دیگری* را نشان می‌داد — پس نه تستی می‌شکست و نه
 * لاگی می‌آمد. این تست شکلِ هر لینک را قفل می‌کند.
 *
 * تست شبکه نمی‌زند (سرعت و پایداری CI)، ولی هر شکلی که اینجا قفل شده یک بار
 * دستی با `curl` بررسی شده و ۲۰۰ یا ۳۰۱ داده.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildDirectionLinks,
  geoUri,
  neshanIosRouteLink,
  neshanPointLink,
  neshanRouteLink,
  primaryDirectionLinks,
} from './directions'

/** مختصات یک کافه‌ی واقعی در مشهد. */
const TARGET = { lat: 36.316, lng: 59.567, name: 'کافه نمونه' }

const byId = (id: string) => {
  const link = buildDirectionLinks(TARGET).find((item) => item.id === id)
  assert.ok(link, `سرویس ${id} در فهرست نیست`)
  return link
}

test('هر پنج سرویس ساخته می‌شوند', () => {
  const links = buildDirectionLinks(TARGET)
  assert.deepEqual(
    links.map((link) => link.id),
    ['neshan', 'balad', 'google', 'waze', 'osm'],
  )
})

test('همه‌ی لینک‌ها https هستند', () => {
  // اسکیمای اختصاصی اپ (`neshan://`) اگر اپ نصب نباشد بی‌صدا شکست می‌خورد.
  for (const link of buildDirectionLinks(TARGET)) {
    assert.ok(link.href.startsWith('https://'), `${link.id}: ${link.href}`)
    assert.ok(link.viewHref.startsWith('https://'), `${link.id} view: ${link.viewHref}`)
  }
})

test('مختصات با ترتیب درست و دقت ۶ رقم می‌آید', () => {
  // جابه‌جایی عرض و طول، کاربر را به وسط بیابان می‌فرستد.
  assert.match(byId('neshan').href, /lat=36\.316000&lng=59\.567000/)
  assert.match(byId('google').href, /destination=36\.316000,59\.567000/)
  assert.match(byId('waze').href, /ll=36\.316000,59\.567000/)
  assert.match(byId('balad').href, /latitude=36\.316000&longitude=59\.567000/)
})

test('نشان از لینک رسمی کوتاه برای بازکردن اپ و fallback وب استفاده می‌کند', () => {
  assert.equal(
    neshanPointLink(TARGET),
    'https://nshn.ir/?lat=36.316000&lng=59.567000',
  )
  assert.equal(byId('neshan').href, neshanPointLink(TARGET))
})

test('لینک رسمی نشان مبدأ، مقصد و نوع خودرو را درست می‌فرستد', () => {
  const origin = { lat: 36.3, lng: 59.5 }
  assert.equal(
    neshanRouteLink(origin, TARGET),
    'https://nshn.ir?origin=36.300000,59.500000&destination=36.316000,59.567000&vehicle=d',
  )
  assert.equal(
    neshanIosRouteLink(origin, TARGET),
    'neshan://?origin=36.300000,59.500000&destination=36.316000,59.567000&vehicle=d',
  )
})

test('بلد به `location` می‌رود، نه به `directions`', () => {
  /*
    `balad.ir/directions?…` قطعاً ۴۰۴ می‌دهد — و `/routing`، `/direction`،
    `/navigation`، `/route` و `/directions/car` هم همین‌طور. تنها شکلی که
    ۲۰۰ می‌دهد `/location` است.
  */
  const balad = byId('balad')
  assert.ok(balad.href.includes('/location?'), balad.href)
  assert.ok(!balad.href.includes('/directions'), 'مسیرِ ۴۰۴ برنگشته باشد')
})

test('ویز با `www` می‌آید تا یک ۳۰۱ اضافه نخورد', () => {
  assert.ok(byId('waze').href.startsWith('https://www.waze.com/ul'), byId('waze').href)
})

test('گوگل مپس از شکل رسمی `api=1` استفاده می‌کند', () => {
  const google = byId('google')
  assert.ok(google.href.includes('api=1'), 'شکل‌های قدیمی بی‌هشدار از کار می‌افتند')
  assert.ok(google.href.includes('travelmode=driving'))
})

test('سرویس‌های ایرانی «محلی» علامت خورده‌اند', () => {
  assert.equal(byId('neshan').local, true)
  assert.equal(byId('balad').local, true)
  assert.equal(byId('google').local, false)
  assert.equal(byId('waze').local, false)
})

test('مختصات بیرون از بازه محدود می‌شود', () => {
  const links = buildDirectionLinks({ lat: 999, lng: -999 })
  assert.match(links[0]!.href, /lat=90\.000000&lng=-180\.000000/)
})

test('نامِ مکان در آدرس امن می‌شود', () => {
  // نامِ فارسی با فاصله، اگر encode نشود آدرس را می‌شکند.
  const osm = buildDirectionLinks({ ...TARGET, name: 'کافه رُف من' })
  assert.ok(!osm.find((link) => link.id === 'osm')!.viewHref.includes(' '))
})

test('primaryDirectionLinks نشان و گوگل را می‌دهد', () => {
  const primary = primaryDirectionLinks(TARGET)
  assert.deepEqual(
    primary.map((link) => link.id),
    ['neshan', 'google'],
  )
})

test('geoUri شکل استانداردِ سیستم‌عامل را می‌سازد', () => {
  const uri = geoUri(TARGET)
  assert.ok(uri.startsWith('geo:36.316000,59.567000'))
  assert.ok(uri.includes('q=36.316000,59.567000'))
})
