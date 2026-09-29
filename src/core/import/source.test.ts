import assert from 'node:assert/strict'
import test from 'node:test'
import { extractSourceImages, flattenCafeItems, flattenSectionItems, type RawCafe } from './source'

const cafe: RawCafe = {
  'شناسه': 42,
  'نام مجموعه': 'کافه تست',
  'لوگو': 'https://cdn.example/logo.webp',
  'منو': [{
    'دسته‌بندی': 'قهوه',
    'تصویر': 'https://cdn.example/section.webp',
    'آیتم‌ها': [{ 'شناسه': 1, 'نام': 'اسپرسو', 'تصویر': 'https://cdn.example/espresso.webp' }],
    'زیردسته‌ها': [{
      'دسته‌بندی': 'قهوه سرد',
      'آیتم‌ها': [{ 'شناسه': 2, 'نام': 'آیس لاته', 'تصویر': 'https://cdn.example/ice.webp' }],
      'زیردسته‌ها': [{
        'دسته‌بندی': 'ویژه',
        'آیتم‌ها': [{ 'شناسه': 3, 'نام': 'کلد برو' }],
      }],
    }],
  }],
}

test('flattenSectionItems تمام عمق منو را با ترتیب منبع نگه می‌دارد', () => {
  const items = flattenSectionItems(cafe['منو']![0]!)
  assert.deepEqual(items.map((item) => item['شناسه']), [1, 2, 3])
  assert.deepEqual(flattenCafeItems(cafe).map((item) => item['نام']), ['اسپرسو', 'آیس لاته', 'کلد برو'])
})

test('extractSourceImages تصویر آیتم‌های زیردسته را هم ثبت می‌کند', () => {
  const images = extractSourceImages([cafe])
  assert.deepEqual(images.map((image) => image.url), [
    'https://cdn.example/logo.webp',
    'https://cdn.example/section.webp',
    'https://cdn.example/espresso.webp',
    'https://cdn.example/ice.webp',
  ])
})
