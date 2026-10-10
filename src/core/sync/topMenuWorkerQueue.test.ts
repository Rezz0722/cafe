import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('production mode persists a job and never spawns from the web process', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kucafe-topmenu-queue-'))
  process.env.TOPMENU_SYNC_ROOT = root
  process.env.TOPMENU_SYNC_EXECUTION_MODE = 'worker'
  try {
    const { startTopMenuSync, readTopMenuSyncState } = await import('./topMenuSync')
    const actor = { userId: 'test', label: 'test' }
    const selection = { scope: 'all' as const, sourceIds: [] }
    assert.deepEqual(await startTopMenuSync('scrape', actor, { selection }), { ok: true })
    const state = await readTopMenuSyncState()
    assert.equal(state.status, 'scraping')
    assert.equal(state.pid, undefined)
    assert.ok(state.runId)
    assert.deepEqual(JSON.parse(await readFile(join(root, 'runs', state.runId!, 'scrape-selection.json'), 'utf8')), selection)
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
