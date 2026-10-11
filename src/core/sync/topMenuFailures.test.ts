import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertTopMenuFailureManifest, failedTopMenuSourceIds, failedTopMenuSelectionIds, readTopMenuFailures } from './topMenuFailures'

test('failed source responses block only affected selected cafes and full sync', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kucafe-topmenu-failures-'))
  try {
    await writeFile(join(dir, 'failed_20261010_120000.json'), JSON.stringify([
      { id: 326, name: 'رستوران ارم', errors: ['menu: /providers/326/menu -> HTTP 403: مجموعه مورد نظر فاقد منو دیجیتال می باشد', 'hours: /providers/326/hours -> HTTP 403: مجموعه مورد نظر فاقد منو دیجیتال می باشد'] },
      { id: 171, errors: ['hours: ReadTimeout while fetching source'] },
      { id: 2, errors: ['excluded non-cafe'] },
    ]))
    const ids = await failedTopMenuSourceIds(dir)
    assert.deepEqual(ids, [2, 171, 326])
    const failures = await readTopMenuFailures(dir)
    assert.deepEqual(failures.find(failure => failure.id === 326), {
      id: 326, name: 'رستوران ارم', reasons: [
        'منو: HTTP 403 — مجموعه مورد نظر فاقد منو دیجیتال می باشد',
        'ساعات کاری: HTTP 403 — مجموعه مورد نظر فاقد منو دیجیتال می باشد',
      ],
    })
    assert.deepEqual(failures.find(failure => failure.id === 171)?.reasons, ['ساعات کاری: مهلت پاسخ منبع تمام شد.'])
    assert.deepEqual(failedTopMenuSelectionIds(ids, { scope: 'all', sourceIds: [] }), [171, 326])
    assert.deepEqual(failedTopMenuSelectionIds(ids, { scope: 'selected', sourceIds: [171] }), [171])
    assert.deepEqual(failedTopMenuSelectionIds(ids, { scope: 'selected', sourceIds: [500] }), [])
    assert.doesNotThrow(() => assertTopMenuFailureManifest(3, ids))
    assert.throws(() => assertTopMenuFailureManifest(4, ids), /هم‌خوان نیست/)
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
