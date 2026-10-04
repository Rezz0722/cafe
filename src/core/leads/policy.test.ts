import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { canChangeLead, canLinkLead, leadDedupe, parseFollowUp, privateHash, validateLead, type LeadInput } from './policy'
const secret = 'test-only-secret-with-more-than-thirty-two-characters'
const input: LeadInput = { contactName: 'تست', contactPhone: '۰۹۱۲۳۴۵۶۷۸۹', cafeName: 'کافه تست', city: 'مشهد', branch: '', source: 'home', consent: true, requestKey: randomUUID() }
test('lead validates and canonicalizes Persian phone; consent required', () => {
  const valid = validateLead(input)
  assert.deepEqual(valid.errors, {})
  assert.equal(valid.data.contactPhone, '09123456789')
  const bad = validateLead({ ...input, contactPhone: '000', consent: false, cafeName: 'x', website: 'spam' })
  for (const key of ['contactPhone', 'consent', 'cafeName', 'website']) assert.ok(key in bad.errors)
})
test('oversized values rejected, not silently truncated; source allowlisted', () => {
  const bad = validateLead({ ...input, contactName: 'a'.repeat(121), source: 'https://private/?token=x' })
  assert.ok(bad.errors.contactName)
  assert.equal(bad.data.source, 'direct')
})
test('lead deduplication normalizes text; branches and phones stay separate', () => {
  const data = validateLead(input).data
  assert.equal(leadDedupe(secret, data), leadDedupe(secret, { ...data, cafeName: 'کافه  تست' }))
  assert.notEqual(leadDedupe(secret, data), leadDedupe(secret, { ...data, branch: 'شعبه دوم' }))
  assert.notEqual(leadDedupe(secret, data), leadDedupe(secret, { ...data, contactPhone: '09123456780' }))
  assert.throws(() => privateHash('short', 'phone'))
})
test('only own verified active account can bind lead; no cross-user or null-phone', () => {
  const account = { id: 'a', phone: '09123456789', status: 'active', phoneVerifiedAt: new Date() }
  const lead = { contactPhone: account.phone, userId: null }
  assert.equal(canLinkLead(account, lead), true)
  assert.equal(canLinkLead({ ...account, phoneVerifiedAt: null }, lead), false)
  assert.equal(canLinkLead({ ...account, phone: null }, lead), false)
  assert.equal(canLinkLead({ ...account, status: 'blocked' }, lead), false)
  assert.equal(canLinkLead(account, { ...lead, userId: 'b' }), false)
  assert.equal(canLinkLead(account, { ...lead, contactPhone: '09123456780' }), false)
})
test('CRM status cannot activate or revoke a panel; reopening allowed', () => {
  assert.equal(canChangeLead('new', 'active'), false)
  assert.equal(canChangeLead('review', 'active'), false)
  assert.equal(canChangeLead('active', 'closed'), false)
  assert.equal(canChangeLead('active', 'active'), true)
  assert.equal(canChangeLead('closed', 'new'), true)
})
test('follow-up uses explicit Tehran offset, empty clears, malformed rejects', () => {
  assert.equal(parseFollowUp('2026-10-05T10:30')?.toISOString(), '2026-10-05T07:00:00.000Z')
  assert.equal(parseFollowUp(''), null)
  assert.throws(() => parseFollowUp('not a date'))
  assert.throws(() => parseFollowUp('2026-02-31T10:30'))
})
