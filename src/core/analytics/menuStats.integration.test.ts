import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { and, eq, inArray, like } from 'drizzle-orm'
import { getDb, closeDb } from '@/db/client'
import { appUser, dailyStat, menuItem, menuSection, place, setting, userPlaceRole } from '@/db/schema'
import { invalidateSettings } from '@/core/settings/store'
import { recordMenuView, getMenuStats } from './menuStats'
import { POST } from '@/app/api/track/menu/route'

test('disposable MariaDB menu aggregation, eligibility, privacy and owner scope', { skip: process.env.KUCAFE_MENU_STATS_DB_TEST !== '1' }, async t => {
  const url = new URL(process.env.DATABASE_URL || '')
  assert.ok(url.hostname === '127.0.0.1' && (url.pathname === '/kucafe_menu_stats_test' || (process.env.GITHUB_ACTIONS === 'true' && url.pathname === '/kucafe')), 'Disposable DB only')
  const db = getDb(), owner = randomUUID(), other = randomUUID(), ids: number[] = [], actor = { userId: owner, label: 'QA owner' }
  const settings = await db.select().from(setting).where(eq(setting.key, 'trackPageViews'))
  let sectionId = 0, itemId = 0
  const view = (kind: 'section' | 'item' = 'section') => ({ placeId: ids[0]!, targetId: kind === 'section' ? sectionId : itemId, kind, eventId: randomUUID() })
  const request = (body: unknown, headers: Record<string, string> = {}) => new Request(`${process.env.NEXT_PUBLIC_SITE_URL}/api/track/menu`, { method: 'POST', body: JSON.stringify(body), headers: { origin: new URL(process.env.NEXT_PUBLIC_SITE_URL!).origin, 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 Android', ...headers } })
  try {
    await db.insert(appUser).values([{ id: owner, name: 'QA owner', role: 'owner' }, { id: other, name: 'QA other', role: 'owner' }])
    for (const suffix of ['a', 'b']) { const [r] = await db.insert(place).values({ slug: `qa-stats-${owner}-${suffix}`, name: 'QA stats', nameNormalized: 'qa', status: 'published' }); ids.push(r.insertId) }
    await db.insert(userPlaceRole).values({ userId: owner, placeId: ids[0]!, role: 'owner' })
    const [s] = await db.insert(menuSection).values({ placeId: ids[0]!, name: 'QA category' }); sectionId = s.insertId
    const [i] = await db.insert(menuItem).values({ placeId: ids[0]!, sectionId, publicId: `mi_${owner.replaceAll('-', '').slice(0, 24)}`, name: 'QA item', nameNormalized: 'qa' }); itemId = i.insertId
    await db.insert(setting).values({ key: 'trackPageViews', value: true }).onDuplicateKeyUpdate({ set: { value: true } }); invalidateSettings()
    await t.test('atomic concurrent increments and distinct metrics', async () => {
      await Promise.all(Array.from({ length: 20 }, () => recordMenuView(view())))
      await recordMenuView(view('item'))
      const stats = await getMenuStats(ids[0]!, actor, true)
      assert.equal(stats.sectionViews, 20); assert.equal(stats.itemViews, 1); assert.equal(stats.items[0]!.name, 'QA item')
    })
    await t.test('foreign, quarantine, archived and unpublished targets cannot count', async () => {
      await recordMenuView({ ...view(), placeId: ids[1]! })
      for (const branchScope of ['other_branch', 'unverified'] as const) { await db.update(menuSection).set({ branchScope }).where(eq(menuSection.id, sectionId)); await recordMenuView(view()); await recordMenuView(view('item')) }
      await db.update(menuSection).set({ branchScope: 'shared' }).where(eq(menuSection.id, sectionId))
      await db.update(menuItem).set({ archivedAt: new Date() }).where(eq(menuItem.id, itemId)); await recordMenuView(view()); await recordMenuView(view('item'))
      await db.update(menuItem).set({ archivedAt: null }).where(eq(menuItem.id, itemId))
      await db.update(place).set({ status: 'draft' }).where(eq(place.id, ids[0]!)); await recordMenuView(view())
      await db.update(place).set({ status: 'published' }).where(eq(place.id, ids[0]!))
      assert.equal((await getMenuStats(ids[0]!, actor, true)).sectionViews, 20)
      assert.equal((await getMenuStats(ids[0]!, actor, true)).itemViews, 1)
    })
    await t.test('foreign/view-as/revoked/blocked/temp password access denied', async () => {
      await assert.rejects(getMenuStats(ids[1]!, actor, true)); await assert.rejects(getMenuStats(ids[0]!, { userId: other, label: 'other' }, true))
      await assert.rejects(getMenuStats(ids[0]!, { ...actor, onBehalfOf: other }, true))
      await db.update(userPlaceRole).set({ status: 'revoked' }).where(eq(userPlaceRole.userId, owner)); await assert.rejects(getMenuStats(ids[0]!, actor, true))
      await db.update(userPlaceRole).set({ status: 'active' }).where(eq(userPlaceRole.userId, owner))
      for (const patch of [{ status: 'blocked' as const }, { mustChangePassword: true }]) {
        await db.update(appUser).set(patch).where(eq(appUser.id, owner)); await assert.rejects(getMenuStats(ids[0]!, actor, true))
        await db.update(appUser).set({ status: 'active', mustChangePassword: false }).where(eq(appUser.id, owner))
      }
    })
    await t.test('route nonce retry suppression, privacy, body limit and disabled setting', async () => {
      const payload = view(); const first = await POST(request(payload)); assert.equal(first.status, 204); assert.equal(first.headers.get('set-cookie'), null)
      await POST(request(payload))
      const privateHeaders: Record<string, string>[] = [{ dnt: '1' }, { 'sec-gpc': '1' }, { 'user-agent': 'Googlebot' }, { origin: 'https://evil.example' }, { purpose: 'prefetch' }]
      for (const headers of privateHeaders) await POST(request(view(), headers))
      await POST(request({ ...view(), padding: 'x'.repeat(700) })); await POST(request({ ...view(), targetId: 'invalid' }))
      await db.update(setting).set({ value: false }).where(eq(setting.key, 'trackPageViews')); invalidateSettings(); await POST(request(view()))
      const stats = await getMenuStats(ids[0]!, actor, false); assert.equal(stats.sectionViews, 21); assert.equal(stats.enabled, false)
    })
    await t.test('old data excluded; removed target totals retained without leaking foreign names', async () => {
      await recordMenuView(view(), new Date('2020-01-01'))
      await db.update(menuItem).set({ archivedAt: new Date() }).where(eq(menuItem.id, itemId))
      const stats = await getMenuStats(ids[0]!, actor, true); assert.equal(stats.sectionViews, 21); assert.equal(stats.itemViews, 1)
      assert.match(stats.items[0]!.name, /حذف‌شده/)
    })
  } finally {
    for (const id of ids) await db.delete(dailyStat).where(and(like(dailyStat.refId, `${id}:%`), inArray(dailyStat.metric, ['menu_section_views', 'menu_item_views'])))
    if (ids.length) await db.delete(place).where(inArray(place.id, ids))
    await db.delete(appUser).where(inArray(appUser.id, [owner, other]))
    await db.delete(setting).where(eq(setting.key, 'trackPageViews')); if (settings.length) await db.insert(setting).values(settings)
    invalidateSettings(); await closeDb()
  }
})
