import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('production mode persists a job and never spawns from the web process', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kucafe-topmenu-queue-'))
  process.env.TOPMENU_SYNC_ROOT = root
  process.env.TOPMENU_SYNC_EXECUTION_MODE = 'worker'
  try {
    const { startTopMenuSync, readTopMenuSyncState, readTopMenuFailureDetails } = await import('./topMenuSync')
    const actor = { userId: 'test', label: 'test' }
    const selection = { scope: 'all' as const, sourceIds: [] }
    assert.equal((await startTopMenuSync('scrape', actor, { selection })).ok, false)
    await writeFile(join(root, 'worker-heartbeat'), String(Date.now()))
    assert.match((await startTopMenuSync('scrape', actor, { selection: { scope: 'selected', sourceIds: [2] } })).error ?? '', /غیرکافه یا دمو/)
    assert.deepEqual(await startTopMenuSync('scrape', actor, { selection }), { ok: true })
    const state = await readTopMenuSyncState()
    assert.equal(state.status, 'scraping')
    assert.equal(state.pid, undefined)
    assert.ok(state.runId)
    if (process.getuid?.() === 0) {
      assert.equal((await stat(join(root, 'state.json'))).uid, 10001)
      assert.equal((await stat(join(root, 'runs', state.runId!, 'job.json'))).uid, 10001)
    }
    assert.deepEqual(JSON.parse(await readFile(join(root, 'runs', state.runId!, 'scrape-selection.json'), 'utf8')), selection)
    await writeFile(join(root, 'runs', state.runId!, 'failed_20261011_160841.json'), JSON.stringify([
      { id: 326, name: 'رستوران ارم', errors: ['menu: /providers/326/menu -> HTTP 403: مجموعه مورد نظر فاقد منو دیجیتال می باشد'] },
    ]))
    assert.equal((await readTopMenuFailureDetails(state.runId, 1)).failedSources[0]?.reasons[0], 'منو: HTTP 403 — مجموعه مورد نظر فاقد منو دیجیتال می باشد')
    assert.equal((await readTopMenuFailureDetails(state.runId, 2)).failureManifestError, true)
    assert.equal((await startTopMenuSync('scrape', actor, { selection })).ok, false)
    await writeFile(join(root, 'state.json'), JSON.stringify({ runId: null, status: 'idle' }))
    const lockPath = join(root, 'start.lock')
    await writeFile(lockPath, String(process.pid))
    const stale = new Date(Date.now() - 90_000)
    await utimes(lockPath, stale, stale)
    assert.equal((await startTopMenuSync('scrape', actor, { selection })).ok, true)
  } finally {
    delete process.env.TOPMENU_SYNC_ROOT
    delete process.env.TOPMENU_SYNC_EXECUTION_MODE
    await rm(root, { recursive: true, force: true })
  }
})
