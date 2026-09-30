import test from 'node:test'
import assert from 'node:assert/strict'
import { installPlatform, inAppBrowser } from './install'

test('installation platform includes iPad desktop user agent without confusing Mac', () => {
  assert.equal(installPlatform('Mozilla iPhone Safari'), 'ios')
  assert.equal(installPlatform('Mozilla iPad'), 'ios')
  assert.equal(installPlatform('Mozilla Macintosh Safari', 5), 'ios')
  assert.equal(installPlatform('Mozilla Macintosh Safari', 0), 'desktop')
  assert.equal(installPlatform('Mozilla Android Chrome'), 'android')
  assert.equal(installPlatform('Mozilla Windows Chrome'), 'desktop')
})

test('embedded browsers get external-browser guidance, not fake install promises', () => {
  for (const ua of ['Instagram 300', 'FBAN/FBIOS', 'FBAV/1', 'Android; wv)', 'TikTok', 'Line/14']) assert.ok(inAppBrowser(ua))
  assert.equal(inAppBrowser('Mozilla Android Chrome/140 Mobile Safari'), false)
  assert.equal(inAppBrowser('Mozilla iPhone Version/26 Safari'), false)
})
