import assert from 'node:assert/strict'
import { test } from 'node:test'
import { serializeJsonLd } from './jsonLd.ts'

test('داده نمی‌تواند تگ script دادهٔ ساختاریافته را ببندد', () => {
  const output = serializeJsonLd({ name: '</script><script>alert(1)</script>' })
  assert.equal(output.includes('</script>'), false)
  assert.match(output, /\\u003c\/script>/)
})
