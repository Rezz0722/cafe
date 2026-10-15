import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { eq, inArray } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { appUser, authSession, menuItem, menuSection, place, userPlaceRole } from '@/db/schema'
import { SESSION_SECRET } from '@/core/config/env'
import { createAuthSession } from './userRepo'
import { createSessionToken, SESSION_COOKIE } from './session'
import { signClaims } from './token'
import { VIEW_AS_COOKIE, type ViewAsClaims } from './impersonation'

async function freePort(): Promise<number> {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const port = address.port
  server.close()
  await once(server, 'close')
  return port
}

test('isolated HTTP export denies foreign, staff, manager, revoked and view-as sessions', {
  skip: process.env.KUCAFE_AUTHZ_HTTP_TEST !== '1',
  timeout: 90_000,
}, async () => {
  const url = new URL(process.env.DATABASE_URL || '')
  assert.ok(url.hostname === '127.0.0.1' &&
    (url.pathname === '/kucafe_authz_test' || (process.env.GITHUB_ACTIONS === 'true' && url.pathname === '/kucafe')),
  'Disposable database required; production forbidden')
  assert.ok(SESSION_SECRET.length >= 32)
  const db = getDb()
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const userIds = Object.fromEntries(['admin', 'owner', 'manager', 'staff', 'foreign', 'revoked']
    .map(role => [role, randomUUID()])) as Record<string, string>
  const allUserIds = Object.values(userIds)
  const placeIds: number[] = []
  const cookies: Record<string, string> = {}
  let child: ReturnType<typeof spawn> | null = null
  try {
    await db.insert(appUser).values(Object.entries(userIds).map(([role, id]) => ({
      id, name: `QA ${role}`, role: role === 'admin' ? 'admin' as const : 'owner' as const,
    })))
    for (const branch of ['owned', 'foreign']) {
      const [row] = await db.insert(place).values({
        slug: `qa-export-http-${suffix}-${branch}`, name: `QA ${branch}`,
        nameNormalized: `QA ${branch}`, status: 'published',
      })
      placeIds.push(row.insertId)
    }
    const own = placeIds[0]!, foreign = placeIds[1]!
    await db.insert(userPlaceRole).values([
      { userId: userIds.owner!, placeId: own, role: 'owner' },
      { userId: userIds.manager!, placeId: own, role: 'manager' },
      { userId: userIds.staff!, placeId: own, role: 'staff' },
      { userId: userIds.foreign!, placeId: foreign, role: 'owner' },
      { userId: userIds.revoked!, placeId: own, role: 'owner', status: 'revoked' },
    ])
    for (const [index, placeId] of placeIds.entries()) {
      const [section] = await db.insert(menuSection).values({ placeId, name: index ? 'Other branch' : 'قهوه', branchScope: 'branch', sortOrder: 0 })
      await db.insert(menuItem).values({
        placeId, sectionId: section.insertId, publicId: `qahttp_${suffix}_${index}`,
        name: index ? 'Foreign secret' : 'اسپرسو', nameNormalized: index ? 'Foreign secret' : 'اسپرسو', price: 100000,
      })
    }
    for (const [role, userId] of Object.entries(userIds)) {
      const sessionId = await createAuthSession({ userId, method: 'password', expiresAt: new Date(Date.now() + 60_000) })
      cookies[role] = `${SESSION_COOKIE}=${createSessionToken({ sessionId, userId, phone: '', role: role === 'admin' ? 'admin' : 'owner' })}`
    }

    const port = await freePort()
    const origin = `http://127.0.0.1:${port}`
    let serverOutput = ''
    child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port), '-H', '127.0.0.1'], {
      cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: origin }, stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout?.on('data', data => { serverOutput = (serverOutput + String(data)).slice(-4000) })
    child.stderr?.on('data', data => { serverOutput = (serverOutput + String(data)).slice(-4000) })
    const endpoint = (placeId: number, format: string) => `${origin}/api/admin/venue/menu-export?placeId=${placeId}&format=${format}`
    let ready = false
    for (let attempt = 0; attempt < 80; attempt++) {
      if (child.exitCode !== null) break
      try {
        const response = await fetch(endpoint(own, 'json'), { signal: AbortSignal.timeout(1000) })
        if (response.status === 401) { ready = true; break }
      } catch { /* server still starting */ }
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    assert.ok(ready, `isolated Next server did not start: ${serverOutput}`)
    const request = (role: string, placeId: number, format: string, extraCookie = '') => fetch(endpoint(placeId, format), {
      headers: { cookie: [cookies[role], extraCookie].filter(Boolean).join('; ') }, signal: AbortSignal.timeout(5000),
    })

    for (const role of ['owner', 'admin']) {
      for (const format of ['json', 'csv']) {
        const response = await request(role, own, format)
        assert.equal(response.status, 200, `${role}/${format}`)
        assert.match(response.headers.get('content-disposition') || '', new RegExp(`\\.${format}"`))
        assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0')
        const raw = new Uint8Array(await response.arrayBuffer())
        const body = new TextDecoder().decode(raw)
        assert.ok(body.includes('اسپرسو'))
        assert.ok(!body.includes('Foreign secret'))
        if (format === 'csv') assert.deepEqual(Array.from(raw.slice(0, 3)), [0xef, 0xbb, 0xbf])
      }
    }
    for (const role of ['manager', 'staff', 'foreign', 'revoked']) {
      assert.equal((await request(role, own, 'json')).status, 403, role)
    }
    assert.equal((await request('owner', foreign, 'json')).status, 403)
    assert.equal((await request('owner', Number.MAX_SAFE_INTEGER, 'json')).status, 403)
    const viewAs = signClaims<ViewAsClaims>({ actorId: userIds.admin!, targetId: userIds.owner!, exp: Math.floor(Date.now() / 1000) + 300 }, SESSION_SECRET)
    assert.equal((await request('admin', own, 'json', `${VIEW_AS_COOKIE}=${viewAs}`)).status, 403)
  } finally {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM')
      await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))])
      if (child.exitCode === null) child.kill('SIGKILL')
    }
    if (placeIds.length) {
      await db.delete(menuItem).where(inArray(menuItem.placeId, placeIds))
      await db.delete(menuSection).where(inArray(menuSection.placeId, placeIds))
      await db.delete(userPlaceRole).where(inArray(userPlaceRole.placeId, placeIds))
    }
    await db.delete(authSession).where(inArray(authSession.userId, allUserIds))
    if (placeIds.length) await db.delete(place).where(inArray(place.id, placeIds))
    await db.delete(appUser).where(inArray(appUser.id, allUserIds))
    await closeDb()
  }
})
