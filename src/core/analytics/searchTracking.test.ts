import test from 'node:test'
import assert from 'node:assert/strict'
import { detectDevice, trackSearch } from './track'

test('crawler zero-result requests return before acquiring a database connection', async () => {
  for (const userAgent of [
    'Mozilla/5.0 (compatible; ClaudeBot/1.0)',
    'Mozilla/5.0 (compatible; Googlebot/2.1)',
    'Mozilla/5.0 (compatible; SemrushBot/7)',
    'HeadlessChrome/140.0.7339.186',
    'KuCafe-SEO-Smoke/1.0 crawler',
  ]) {
    await assert.doesNotReject(trackSearch({ userAgent, query: 'ناموجود', facetIds: [], resultCount: 0 }))
  }
})

test('ordinary desktop, mobile and unspecified agents are not classified as crawlers', () => {
  assert.equal(detectDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/153.0.0.0 Safari/537.36'), 'desktop')
  assert.equal(detectDevice('Mozilla/5.0 (Linux; Android 15) Chrome/140.0 Mobile Safari/537.36'), 'mobile')
  assert.equal(detectDevice(null), 'unknown')
})
