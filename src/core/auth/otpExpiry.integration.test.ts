import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { getDb, closeDb, withDbNamedLock } from '@/db/client'
import { sql } from 'drizzle-orm'
import { saveOtp, getActiveOtp } from './userRepo'
import { hashCode, DEFAULT_OTP_POLICY } from './otp'
import { verifyStoredOtp } from './otpVerification'

test('legacy MariaDB expiry, wrong then correct, concurrent replay and idempotent migration', { skip: process.env.KUCAFE_AUTH_DB_TEST !== '1' }, async () => {
  const url = new URL(process.env.DATABASE_URL!)
  const qa = url.hostname === '127.0.0.1' && url.pathname === '/kucafe_auth_qa_20261020'
  const ci = process.env.GITHUB_ACTIONS === 'true' && url.hostname === '127.0.0.1' && url.pathname === '/kucafe' && url.username === 'kucafe' && url.password === 'ci-only-password'
  assert.ok(qa || ci, 'Only an explicitly disposable authentication QA/CI database is allowed')
  const db = getDb()
  const phone = process.env.KUCAFE_AUTH_QA_PHONE || '09990000001' // Database-only fixture; no provider import/call.
  const policy = { ...DEFAULT_OTP_POLICY, ttlSeconds: 60 }
  try {
    await db.execute(sql`DELETE FROM otp_code`)
    await db.execute(sql`ALTER TABLE otp_code MODIFY expires_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
    const row = await saveOtp({ phone, codeHash: hashCode(phone, '12345'), ttlSec: 60 })
    const wrong = await verifyStoredOtp(phone, '00000', 'login', policy, row.id)
    assert.equal(wrong.ok, false)
    const afterWrong = await getActiveOtp(phone)
    assert.equal(afterWrong?.attempts, 1)
    assert.equal(afterWrong?.expiresAt.getTime(), row.expiresAt.getTime(), 'Attempt update must preserve expiry even before migration')
    assert.deepEqual(await verifyStoredOtp(phone, '12345', 'login', policy, row.id), { ok: true })
    assert.equal((await verifyStoredOtp(phone, '12345', 'login', policy, row.id)).ok, false, 'Consumed code cannot be replayed')
    const race = await saveOtp({ phone, codeHash: hashCode(phone, '23456'), ttlSec: 60 })
    const concurrent = await Promise.all([verifyStoredOtp(phone, '23456', 'login', policy, race.id), verifyStoredOtp(phone, '23456', 'login', policy, race.id)])
    assert.equal(concurrent.filter(result => result.ok).length, 1, 'Concurrent verification creates one successful consumption')
    const fresh = await saveOtp({ phone, codeHash: hashCode(phone, '34567'), ttlSec: 60 })
    for (let i = 0; i < 2; i++) execFileSync(process.execPath, ['scripts/run-sql.mjs', 'drizzle/0020_auth_otp_expiry_integrity.sql'], { env: process.env, stdio: 'pipe' })
    const stable = await getActiveOtp(phone)
    assert.equal(stable?.expiresAt.getTime(), fresh.expiresAt.getTime(), 'Migration must not extend or shorten existing codes')
    const [cols] = await db.execute(sql`SELECT EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'otp_code' AND COLUMN_NAME = 'expires_at'`)
    assert.doesNotMatch(JSON.stringify(cols), /on update/i)
    for (let i = 0; i < policy.maxAttempts; i++) assert.equal((await verifyStoredOtp(phone, '00000', 'login', policy, fresh.id)).ok, false)
    assert.equal((await verifyStoredOtp(phone, '34567', 'login', policy, fresh.id)).ok, false, 'Attempt limit remains enforced')
    const expired = await saveOtp({ phone, codeHash: hashCode(phone, '45678'), ttlSec: -1 })
    assert.equal((await verifyStoredOtp(phone, '45678', 'login', policy, expired.id)).ok, false, 'An expired code is never revived')
    const replaced = await saveOtp({ phone, codeHash: hashCode(phone, '56789'), ttlSec: 60 })
    const replacement = await saveOtp({ phone, codeHash: hashCode(phone, '67890'), ttlSec: 60 })
    assert.equal((await verifyStoredOtp(phone, '56789', 'login', policy, replaced.id)).ok, false, 'A stale challenge cannot consume or increment the replacement')
    assert.equal((await getActiveOtp(phone))?.attempts, 0)
    assert.deepEqual(await verifyStoredOtp(phone, '67890', 'login', policy, replacement.id), { ok: true })
    let enter!: () => void, release!: () => void
    const entered = new Promise<void>(resolve => { enter = resolve })
    const barrier = new Promise<void>(resolve => { release = resolve })
    const first = withDbNamedLock('auth-qa-issuance', async () => { enter(); await barrier; return 'issued' })
    await entered
    try {
      assert.deepEqual(await withDbNamedLock('auth-qa-issuance', async () => 'duplicate'), { acquired: false }, 'A parallel send cannot reach the provider callback')
    } finally { release() }
    assert.deepEqual(await first, { acquired: true, value: 'issued' })
    assert.deepEqual(await withDbNamedLock('auth-qa-issuance', async () => 'released'), { acquired: true, value: 'released' })
  } finally {
    await db.execute(sql`DELETE FROM otp_code`)
    await closeDb()
  }
})
