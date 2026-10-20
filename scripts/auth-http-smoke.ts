import assert from 'node:assert/strict'

const base = process.env.KUCAFE_OTP_QA_URL || 'http://127.0.0.1:3197'
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Use an isolated local server')
const status = await fetch(`${base}/api/auth/otp?purpose=login`)
assert.equal(status.status, 200)
assert.equal((await status.json()).ok, false)
assert.match(status.headers.get('cache-control') ?? '', /no-store/)
assert.equal((await fetch(`${base}/api/auth/otp?purpose=bad`)).status, 400)
assert.equal((await fetch(`${base}/api/auth/otp?purpose=login`, { method: 'DELETE', headers: { Origin: 'https://evil.invalid' } })).status, 403)
assert.equal((await fetch(`${base}/api/auth/otp?purpose=login`, { method: 'DELETE', headers: { Origin: base } })).status, 204)
const completion = await fetch(`${base}/auth/complete?redirect=${encodeURIComponent('//evil.invalid/x')}`, { redirect: 'manual' })
assert.equal(completion.status, 307)
assert.equal(completion.headers.get('location'), '/auth?redirect=%2Fprofile')
console.log('✓ HTTP challenge privacy/no-store, purpose validation, public-origin clearing and external return rejection')
