import test from 'node:test'
import assert from 'node:assert/strict'
import { samePlaceRevision } from './revision'

test('revision همان فرم پذیرفته می‌شود', () => {
  assert.equal(samePlaceRevision(12, '12'), true)
})

test('فرم قدیمی و نسخه مخدوش رد می‌شوند', () => {
  assert.equal(samePlaceRevision(13, '12'), false)
  assert.equal(samePlaceRevision(13, ''), false)
  assert.equal(samePlaceRevision(13, '13.0'), false)
  assert.equal(samePlaceRevision(13, 'not-a-number'), false)
})
