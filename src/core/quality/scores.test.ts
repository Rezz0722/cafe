import test from 'node:test'
import assert from 'node:assert/strict'
import { completenessBreakdown, computeQualityFromFacts } from './scores'

const complete = {
  hasCoords: true,
  hasHours: true,
  hasAddress: true,
  hasPhone: true,
  hasInstagram: true,
  hasDescription: true,
  hasMenu: true,
  photoCount: 3,
  attributeCount: 6,
}

test('پروفایل واقعاً کامل دقیقاً ۱۰۰ درصد است', () => {
  assert.equal(computeQualityFromFacts(complete), 100)
  assert.ok(completenessBreakdown(complete).every((part) => part.complete))
})

test('لوگو به‌تنهایی جای تصاویر محیط را نمی‌گیرد', () => {
  const facts = { ...complete, photoCount: 0 }
  assert.equal(computeQualityFromFacts(facts), 86)
  assert.equal(completenessBreakdown(facts).find((part) => part.id === 'photos')?.earned, 0)
})

test('تصویر و ویژگی امتیاز مرحله‌ای و قابل توضیح دارند', () => {
  const facts = { ...complete, photoCount: 1, attributeCount: 3 }
  assert.equal(computeQualityFromFacts(facts), 84)
  const parts = completenessBreakdown(facts)
  assert.match(parts.find((part) => part.id === 'photos')?.detail ?? '', /1 از 3/)
  assert.match(parts.find((part) => part.id === 'attributes')?.detail ?? '', /3 از 6/)
})
