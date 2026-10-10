import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { failedTopMenuSourceIds, failedTopMenuSelectionIds } from './topMenuFailures'

test('failed source responses block only affected selected cafes and full sync', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kucafe-topmenu-failures-'))
  try {
    await writeFile(join(dir, 'failed_20261010_120000.json'), JSON.stringify([
      { id: 326, errors: ['menu: 403 Client Error'] },
      { id: 171, errors: ['hours: 403 Client Error'] },
      { id: 2, errors: ['excluded non-cafe'] },
    ]))
    const ids = await failedTopMenuSourceIds(dir)
    assert.deepEqual(ids, [2, 171, 326])
    assert.deepEqual(failedTopMenuSelectionIds(ids, { scope: 'all', sourceIds: [] }), [171, 326])
    assert.deepEqual(failedTopMenuSelectionIds(ids, { scope: 'selected', sourceIds: [171] }), [171])
    assert.deepEqual(failedTopMenuSelectionIds(ids, { scope: 'selected', sourceIds: [500] }), [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('malformed failure manifest cannot be treated as a clean scrape', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kucafe-topmenu-failures-'))
  try {
    await writeFile(join(dir, 'failed_20261010_120000.json'), '[{"id":"326"}]')
    await assert.rejects(failedTopMenuSourceIds(dir), /شناسهٔ خطای اسکرپ معتبر نیست/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
