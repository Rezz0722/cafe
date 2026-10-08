/** Execute only from the protected released maintenance image after a verified backup.
 * Dry-run default; --apply archives, NEVER permanently deletes. Active owner-authorized admin ID required.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import mysql, { type RowDataPacket } from 'mysql2/promise'
import { catalogArchiveAction, type CatalogArchiveBaseline, type CatalogArchiveCurrent } from '../src/core/experience/catalogArchiveGuard'

const args = process.argv.slice(2)
assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--apply'))
const apply = args.includes('--apply')
assert.ok(Date.now() >= Date.parse('2026-10-08T00:00:00Z') && Date.now() < Date.parse('2026-10-16T00:00:00Z'), 'Packet needs renewed review')
const packet = JSON.parse(readFileSync(new URL('../docs/research/KUCAFE_SERVICE_CLEANUP_20261008.json', import.meta.url), 'utf8'))
assert.equal(packet.batchId, 'non-venue-cleanup-20261008')
assert.equal(packet.operation, 'archive-only')
const targets: (CatalogArchiveBaseline & { reason: string; sourceUrls: string[] })[] = packet.targets
assert.deepEqual(targets.map(t => t.id), [92, 172, 403, 425])
const actorId = process.env.KUCAFE_RESEARCH_ACTOR_ID
assert.ok(actorId, 'Existing authorized admin ID required')
if (apply) assert.equal(process.env.KUCAFE_BACKUP_VERIFIED, '1', 'Verify fresh gzip backup before apply')
const db = await mysql.createConnection({ uri: process.env.DATABASE_URL, timezone: 'Z' })
try {
  await db.query("SET time_zone='+00:00'")
  await db.beginTransaction()
  const [actors] = await db.query<RowDataPacket[]>('SELECT role,status,must_change_password FROM app_user WHERE id=? FOR UPDATE', [actorId])
  assert.ok(actors.length === 1 && actors[0]!.role === 'admin' && actors[0]!.status === 'active' && !actors[0]!.must_change_password, 'Unauthorized/inactive admin')
  const plans = []
  // Validate every row before writing anything; locks and audit are in one transaction.
  for (const t of targets) {
    const [places] = await db.query<RowDataPacket[]>('SELECT id,slug,name,source_id,status,revision FROM place WHERE id=? FOR UPDATE', [t.id])
    assert.equal(places.length, 1)
    const p = places[0]!
    const [items] = await db.query<RowDataPacket[]>('SELECT * FROM menu_item WHERE place_id=? ORDER BY id FOR UPDATE', [t.id])
    const hash = createHash('sha256').update(JSON.stringify(items)).digest('hex')
    const [owners] = await db.query<RowDataPacket[]>('SELECT user_id FROM user_place_role WHERE place_id=? FOR UPDATE', [t.id])
    const [audits] = await db.query<RowDataPacket[]>("SELECT action,`after` FROM audit_log WHERE entity='place' AND entity_id=? AND action IN ('place.archive','place.restore') ORDER BY id DESC LIMIT 1 FOR UPDATE", [String(t.id)])
    const latest = audits[0]
    const after = latest ? (typeof latest.after === 'string' ? JSON.parse(latest.after) : latest.after) : null
    const batch = latest ? (latest.action === 'place.archive' ? after?.batchId ?? 'other' : 'restored') : null
    const action = catalogArchiveAction(t, p as CatalogArchiveCurrent, items.length, hash, owners.length, batch)
    plans.push({ t, p, action })
  }
  if (apply) for (const { t, p, action } of plans) if (action === 'archive') {
    const [result] = await db.execute<mysql.ResultSetHeader>("UPDATE place SET status='draft',revision=revision+1 WHERE id=? AND revision=?", [t.id, t.revision])
    assert.equal(result.affectedRows, 1)
    await db.execute("INSERT INTO audit_log (actor_user_id,actor_label,action,entity,entity_id,`before`,`after`) VALUES (?,?,'place.archive','place',?,?,?)", [actorId, 'Authorized non-venue catalogue cleanup', String(t.id), JSON.stringify({ name: p.name, slug: p.slug, status: p.status, revision: p.revision }), JSON.stringify({ status: 'draft', batchId: packet.batchId, reason: t.reason, sourceUrls: t.sourceUrls })])
  }
  if (apply) await db.commit(); else await db.rollback()
  console.log(JSON.stringify({ batchId: packet.batchId, mode: apply ? 'apply' : 'dry-run', permanentDeletes: 0, results: plans.map(({ t, action }) => ({ id: t.id, action, applied: apply && action === 'archive' })) }))
} catch (error) { await db.rollback(); throw error }
finally { await db.end() }
