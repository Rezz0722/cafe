import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../../../public/sw.js', import.meta.url), 'utf8')
type WorkerEvent = { request?: Record<string, unknown>; source?: object; data?: object; waitUntil(value: Promise<unknown>): void; respondWith(value: Promise<Response>): void }

function worker(fetcher: (request: unknown, options?: RequestInit) => Promise<Response> = async () => new Response('live')) {
  const listeners = new Map<string, (event: WorkerEvent) => void>()
  const storage = new Map<string, Response>(), cacheNames = new Set(['kucafe-pwa-obsolete', 'another-app-cache'])
  const precached: string[] = [], deleted: string[] = [], fetched: { request: unknown; options?: RequestInit }[] = []
  let skipped = 0, claimed = 0
  const self = { location: { origin: 'https://kucafe.ir' }, addEventListener: (type: string, listener: (event: WorkerEvent) => void) => listeners.set(type, listener),
    skipWaiting: async () => { skipped++ }, clients: { claim: async () => { claimed++ } } }
  const caches = { open: async (name: string) => {
    cacheNames.add(name)
    return { addAll: async (requests: Request[]) => { for (const request of requests) { precached.push(new URL(request.url).pathname); storage.set(new URL(request.url).pathname, new Response('<html>generic offline</html>')) } },
      match: async (path: string) => storage.get(path)?.clone() }
  }, keys: async () => [...cacheNames], delete: async (name: string) => { deleted.push(name); return cacheNames.delete(name) } }
  class RelativeRequest extends Request { constructor(path: string, options?: RequestInit) { super(new URL(path, self.location.origin), options) } }
  runInNewContext(source, { self, caches, URL, Request: RelativeRequest, Headers, Response, fetch: async (request: unknown, options?: RequestInit) => { fetched.push({ request, options }); return fetcher(request, options) } })
  async function send(type: string, data: Partial<WorkerEvent> = {}) {
    let pending: Promise<unknown> = Promise.resolve(), response: Promise<Response> | undefined
    listeners.get(type)!({ ...data, waitUntil(value) { pending = value }, respondWith(value) { response = value } })
    await pending
    return response ? await response : undefined
  }
  const request = (path: string, mode = 'cors', method = 'GET') => ({ url: new URL(path, self.location.origin).href, mode, method })
  return { send, request, precached, deleted, fetched, storage, skipped: () => skipped, claimed: () => claimed }
}

test('PWA precaches only generic offline identity assets and does not force activation', async () => {
  const w = worker(); await w.send('install')
  assert.deepEqual(w.precached, ['/offline.html', '/brand/app-icon-192.png', '/fonts/Dana-Regular.woff2'])
  assert.equal(w.skipped(), 0)
})

test('PWA activation deletes only its own obsolete caches', async () => {
  const w = worker(); await w.send('install'); await w.send('activate')
  assert.deepEqual(w.deleted, ['kucafe-pwa-obsolete']); assert.equal(w.claimed(), 1)
})

test('PWA navigation always uses live network without storing HTML or prices', async () => {
  const w = worker(); await w.send('install')
  const response = await w.send('fetch', { request: w.request('/cafe/ramouz-cafe?menu=1', 'navigate') })
  assert.equal(await response!.text(), 'live'); assert.equal(w.fetched[0].options?.cache, 'no-store')
  assert.equal(w.storage.size, 3)
})

test('PWA offline navigation returns generic 503/noindex/no-store without private page content', async () => {
  const w = worker(async () => { throw new Error('offline') }); await w.send('install')
  const response = await w.send('fetch', { request: w.request('/profile?private=secret', 'navigate') })
  assert.equal(response!.status, 503); assert.equal(response!.headers.get('Cache-Control'), 'no-store')
  assert.equal(response!.headers.get('X-Robots-Tag'), 'noindex, nofollow')
  assert.ok(!(await response!.text()).includes('secret')); assert.equal(w.storage.size, 3)
})

test('PWA preserves 404/login redirects and uses generic fallback for server failure', async () => {
  for (const status of [302, 404, 503]) {
    const w = worker(async () => new Response('server', { status })); await w.send('install')
    const response = await w.send('fetch', { request: w.request('/cafe/missing', 'navigate') })
    assert.equal(response!.status, status); assert.equal(await response!.text(), status === 503 ? '<html>generic offline</html>' : 'server')
  }
})

test('PWA does not intercept JSON, RSC, writes, private data, cross-origin or chunk/map assets', async () => {
  const w = worker()
  for (const path of ['/api/admin/topmenu-sync', '/search?_rsc=abc', '/profile', '/auth', '/admin', '/_next/static/chunks/app.js', '/maplibre/maplibre-gl-worker.mjs', '/media/user.webp', 'https://outside.example/offline.html'])
    assert.equal(await w.send('fetch', { request: w.request(path) }), undefined)
  for (const method of ['POST', 'PUT', 'DELETE']) assert.equal(await w.send('fetch', { request: w.request('/api/reviews', 'navigate', method) }), undefined)
  assert.equal(w.fetched.length, 0)
})

test('PWA serves only exact static allowlist and requires explicit message for waiting update', async () => {
  const w = worker(); await w.send('install')
  assert.equal((await w.send('fetch', { request: w.request('/brand/app-icon-192.png') }))!.status, 200)
  assert.equal(await w.send('fetch', { request: w.request('/brand/app-icon-192.png?user=private') }), undefined)
  await w.send('message', { source: {}, data: { type: 'OTHER' } }); assert.equal(w.skipped(), 0)
  await w.send('message', { source: {}, data: { type: 'SKIP_WAITING' } }); assert.equal(w.skipped(), 1)
})
