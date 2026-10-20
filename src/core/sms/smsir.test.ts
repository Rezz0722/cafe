import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SMSIR } from '../config/env'
import { sendVerificationCode } from './smsir'

test('SMS acceptance retains the provider reference and does not report delivery', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    status: 1, data: { messageId: 12345, cost: 1 },
  }), { status: 200 }))
  const before = { ...SMSIR }
  Object.assign(SMSIR, { apiKey: 'fake-test-key', templateId: '123456', templateParam: 'CODE' })
  try {
    const result = await sendVerificationCode('09120000000', '12345', { devMode: false })
    assert.deepEqual(result, { ok: true, method: 'template', messageId: 12345 })
  } finally { Object.assign(SMSIR, before) }
})

test('HTTP success with provider rejection stays a failure with diagnostic HTTP status', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    status: 113, message: 'قالب یافت نشد',
  }), { status: 200 }))
  const before = { ...SMSIR }
  Object.assign(SMSIR, { apiKey: 'fake-test-key', templateId: '123456' })
  try {
    const result = await sendVerificationCode('09120000000', '12345', { devMode: false })
    assert.equal(result.ok, false)
    assert.equal(result.messageId, undefined)
    assert.match(result.detail!, /http=200 status=113/)
    assert.doesNotMatch(result.error!, /113|fake-test-key|12345/)
  } finally { Object.assign(SMSIR, before) }
})
