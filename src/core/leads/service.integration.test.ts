import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { appUser, auditLog, place, placeClaim, userPlaceRole, venueLead, venueLeadRate } from '@/db/schema'
import { approveVenueClaim, consumeLeadQuota, createVenueLead, listMyVenueLeads, submitVenueClaim, updateVenueLead } from './service'
import { privateHash, type LeadInput } from './policy'

test('real MariaDB sales intake, duplicate race, authorization and atomic activation', { skip: process.env.KUCAFE_LEAD_DB_TEST !== '1' }, async t => {
  const url = new URL(process.env.DATABASE_URL || '')
  assert.ok(url.hostname === '127.0.0.1' && (url.pathname === '/kucafe_phase1_test' || (process.env.GITHUB_ACTIONS === 'true' && url.pathname === '/kucafe')), 'Disposable DB required; production forbidden')
  const db = getDb(), secret = `test-only-${randomUUID()}`
  const admin = randomUUID(), owner = randomUUID(), other = randomUUID(), unverified = randomUUID()
  const fixture = randomUUID().slice(0, 8), leadIds: string[] = [], venueIds: number[] = []
  const phone = '09123456789', phone2 = '09123456780'
  const input: LeadInput = { contactName: 'تست', contactPhone: phone, cafeName: `کافه تست ${fixture}`, city: 'مشهد', branch: '', source: 'home', consent: true, requestKey: randomUUID() }
  try {
    await db.insert(appUser).values([
      { id: admin, name: 'QA admin', username: `qa-admin-${fixture}`, role: 'admin' },
      { id: owner, name: 'QA owner', phone, phoneVerifiedAt: new Date() },
      { id: other, name: 'QA other', phone: phone2, phoneVerifiedAt: new Date() },
      { id: unverified, name: 'QA unverified', username: `qa-unverified-${fixture}` },
    ])
    for (const branch of ['a', 'b']) {
      const [insert] = await db.insert(place).values({ slug: `qa-${fixture}-${branch}`, name: `QA ${branch}`, nameNormalized: `QA ${branch}`, status: 'published' })
      venueIds.push(insert.insertId)
    }
    let leadId = '', secondId = ''
    const current = async (id: string) => (await db.select().from(venueLead).where(eq(venueLead.id, id)))[0]!
    await t.test('six concurrent identical submits create one lead and one audit event', async () => {
      const results = await Promise.all(Array.from({ length: 6 }, () => createVenueLead(input, secret)))
      assert.equal(results.filter(r => !r.duplicate).length, 1)
      assert.equal(new Set(results.map(r => r.trackingCode)).size, 1)
      const rows = await db.select().from(venueLead).where(eq(venueLead.requestHash, privateHash(secret, input.requestKey)))
      assert.equal(rows.length, 1); leadId = rows[0]!.id; leadIds.push(leadId)
      const events = await db.select().from(auditLog).where(and(eq(auditLog.entity, 'venue_lead'), eq(auditLog.entityId, leadId)))
      assert.equal(events.length, 1); assert.equal(events[0]!.action, 'lead.created')
    })
    await t.test('new form key cannot reveal somebody else’s existing receipt', async () => {
      const duplicate = await createVenueLead({ ...input, requestKey: randomUUID() }, secret)
      assert.equal(duplicate.duplicate, true); assert.equal(duplicate.trackingCode, undefined)
    })
    await t.test('second branch stays distinct; malicious source becomes direct', async () => {
      const requestKey = randomUUID()
      await createVenueLead({ ...input, branch: 'شعبه دوم', source: 'private-token', requestKey }, secret)
      const [row] = await db.select().from(venueLead).where(eq(venueLead.requestHash, privateHash(secret, requestKey)))
      secondId = row!.id; leadIds.push(secondId); assert.equal(row!.source, 'direct')
    })
    await t.test('public creation neither binds user nor grants place role', async () => {
      assert.equal((await current(leadId)).userId, null)
      assert.equal((await db.select().from(userPlaceRole).where(eq(userPlaceRole.userId, owner))).length, 0)
    })
    await t.test('foreign and unverified accounts cannot see or claim request', async () => {
      assert.equal((await listMyVenueLeads(other)).length, 0)
      assert.equal((await listMyVenueLeads(unverified)).length, 0)
      await assert.rejects(submitVenueClaim(other, leadId, venueIds[0]!))
      await assert.rejects(submitVenueClaim(unverified, leadId, venueIds[0]!))
      assert.equal((await listMyVenueLeads(owner)).length, 2)
    })
    await t.test('duplicate claim is idempotent and still gives no access', async () => {
      await Promise.all([submitVenueClaim(owner, leadId, venueIds[0]!), submitVenueClaim(owner, leadId, venueIds[0]!)])
      const row = await current(leadId)
      assert.equal(row.status, 'review'); assert.equal(row.userId, owner)
      assert.equal((await db.select().from(placeClaim).where(eq(placeClaim.userId, owner))).length, 1)
      assert.equal((await db.select().from(userPlaceRole).where(eq(userPlaceRole.userId, owner))).length, 0)
      await assert.rejects(submitVenueClaim(owner, leadId, venueIds[1]!))
    })
    await t.test('customer and direct CRM status cannot activate a panel', async () => {
      const row = await current(leadId)
      await assert.rejects(approveVenueClaim(other, leadId, row.revision, 'human review test'))
      await assert.rejects(updateVenueLead(admin, leadId, row.revision, { status: 'active', assignedToUserId: admin, nextFollowUpAt: null, internalNote: '' }))
      await assert.rejects(approveVenueClaim(admin, leadId, row.revision, 'short'))
    })
    await t.test('stale revision rejected; notes stay private in customer projection', async () => {
      const row = await current(leadId)
      await updateVenueLead(admin, leadId, row.revision, { status: 'review', assignedToUserId: admin, nextFollowUpAt: new Date(), internalNote: 'PRIVATE_INTERNAL_NOTE' })
      await assert.rejects(updateVenueLead(admin, leadId, row.revision, { status: 'review', assignedToUserId: admin, nextFollowUpAt: null, internalNote: '' }))
      assert.ok(!JSON.stringify(await listMyVenueLeads(owner)).includes('PRIVATE_INTERNAL_NOTE'))
    })
    await t.test('audit write failure rolls back role, account, claim and status together', async () => {
      const row = await current(leadId)
      // A scoped trigger on disposable DB proves rollback at the last mutation.
      await db.execute(sql`CREATE TRIGGER qa_lead_audit_failure BEFORE INSERT ON audit_log FOR EACH ROW BEGIN IF NEW.action = 'lead.panel_activated' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'QA forced audit failure'; END IF; END`)
      try { await assert.rejects(approveVenueClaim(admin, leadId, row.revision, 'human checked correct branch')) } finally { await db.execute(sql`DROP TRIGGER qa_lead_audit_failure`) }
      assert.equal((await current(leadId)).status, 'review')
      assert.equal((await db.select().from(appUser).where(eq(appUser.id, owner)))[0]!.role, 'customer')
      assert.equal((await db.select().from(userPlaceRole).where(eq(userPlaceRole.userId, owner))).length, 0)
      assert.equal((await db.select().from(placeClaim).where(eq(placeClaim.id, row.claimId!)))[0]!.status, 'pending')
    })
    await t.test('two simultaneous approvals have one success; branch B never granted', async () => {
      const row = await current(leadId)
      const results = await Promise.allSettled([approveVenueClaim(admin, leadId, row.revision, 'human checked correct branch'), approveVenueClaim(admin, leadId, row.revision, 'human checked correct branch')])
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
      assert.equal((await current(leadId)).status, 'active')
      assert.equal((await db.select().from(appUser).where(eq(appUser.id, owner)))[0]!.role, 'owner')
      const roles = await db.select().from(userPlaceRole).where(eq(userPlaceRole.userId, owner))
      assert.equal(roles.length, 1); assert.equal(roles[0]!.placeId, venueIds[0]); assert.equal(roles[0]!.grantedByUserId, admin)
    })
    await t.test('close rejects pending claim; reopening allows new branch selection', async () => {
      await submitVenueClaim(owner, secondId, venueIds[1]!)
      let row = await current(secondId)
      await updateVenueLead(admin, secondId, row.revision, { status: 'closed', assignedToUserId: admin, nextFollowUpAt: null, internalNote: 'closed on request' })
      assert.equal((await db.select().from(placeClaim).where(eq(placeClaim.id, row.claimId!)))[0]!.status, 'rejected')
      row = await current(secondId)
      await updateVenueLead(admin, secondId, row.revision, { status: 'new', assignedToUserId: admin, nextFollowUpAt: null, internalNote: 'reopened' })
      assert.equal((await current(secondId)).claimId, null)
      await submitVenueClaim(owner, secondId, venueIds[1]!)
      assert.equal((await current(secondId)).status, 'review')
    })
    await t.test('persistent hourly phone quota survives concurrent requests', async () => {
      const now = new Date('2030-01-01T00:01:00Z')
      const requests = await Promise.all(Array.from({ length: 6 }, () => consumeLeadQuota(secret, 'qa-shared-ip', phone, now)))
      assert.equal(requests.filter(Boolean).length, 3)
      assert.equal(await consumeLeadQuota(secret, 'qa-shared-ip', phone, new Date('2030-01-01T01:01:00Z')), true)
    })
  } finally {
    if (leadIds.length) { await db.delete(venueLead).where(inArray(venueLead.id, leadIds)); await db.delete(auditLog).where(and(eq(auditLog.entity, 'venue_lead'), inArray(auditLog.entityId, leadIds))) }
    await db.delete(appUser).where(inArray(appUser.id, [admin, owner, other, unverified]))
    if (venueIds.length) await db.delete(place).where(inArray(place.id, venueIds))
    // Only this isolated DB is allowed above. Its transient rate fixtures are disposable.
    await db.delete(venueLeadRate)
    await closeDb()
  }
})
