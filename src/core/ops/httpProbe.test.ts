import { test } from 'node:test'
import assert from 'node:assert/strict'
import { drainResponse } from '../../../scripts/lib/drain-response.mjs'

test('HTTP probe fully drains chunks without changing failure status', async () => {
  let read = 0
  const response = new Response(new ReadableStream({
    pull(controller) {
      if (read === 3) controller.close()
      else { read++; controller.enqueue(new Uint8Array(1024)) }
    },
  }), { status: 503 })
  await drainResponse(response)
  assert.equal(read, 3)
  assert.equal(response.bodyUsed, true)
  assert.equal(response.status, 503)
})

test('HTTP probe handles no body and propagates truncated body errors', async () => {
  await drainResponse(new Response(null, { status: 204 }))
  const broken = new Response(new ReadableStream({ start(c) { c.error(new Error('truncated')) } }))
  await assert.rejects(drainResponse(broken), /truncated/)
})
