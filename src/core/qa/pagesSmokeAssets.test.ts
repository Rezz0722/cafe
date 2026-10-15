import assert from 'node:assert/strict'
import test from 'node:test'
import { extractStaticAssetUrls } from '../../../scripts/pages-smoke-assets.mjs'

test('asset smoke reads real resource attributes but not split RSC payloads', () => {
  const html = [
    '<link rel="stylesheet" href="/_next/static/css/a1f81227779468cb.css?dpl=sha-abc&amp;x=1">',
    '<script src="/_next/static/chunks/app.js?dpl=sha-abc"></script>',
    '<script>self.__next_f.push([1,"/_next/static/css/a1f812"])</script>',
    '<script>self.__next_f.push([1,"27779468cb.css?dpl=sha-abc"])</script>',
  ].join('')

  assert.deepEqual([...extractStaticAssetUrls(html)], [
    '/_next/static/css/a1f81227779468cb.css?dpl=sha-abc&x=1',
    '/_next/static/chunks/app.js?dpl=sha-abc',
  ])
})
