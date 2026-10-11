import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readTopMenuSourcePresence } from './topMenuSourcePresence'

test('a selected snapshot cannot masquerade as the complete source directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kucafe-source-presence-'))
  try {
    const run = join(root, 'runs', 'selected-run')
    await mkdir(run, { recursive: true })
    await writeFile(join(run, 'providers_info_latest.json'), JSON.stringify([{ 'شناسه': 22 }]))
    await writeFile(join(run, 'cafes_full_latest.json'), JSON.stringify([{ 'شناسه': 22 }]))
    assert.equal(await readTopMenuSourcePresence(root, 'selected-run'), null)

    await writeFile(join(run, 'source_provider_ids_latest.json'), JSON.stringify({
      version: 1, complete: true, total: 3, sourceIds: [11, 22, 33],
    }))
    assert.deepEqual(await readTopMenuSourcePresence(root, 'selected-run'), [11, 22, 33])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('incomplete newest directory is ignored in favor of an older complete one', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kucafe-source-presence-'))
  try {
    const older = join(root, 'runs', '2026-10-10')
    const newer = join(root, 'runs', '2026-10-11')
    await mkdir(older, { recursive: true })
    await mkdir(newer, { recursive: true })
    await writeFile(join(older, 'source_provider_ids_latest.json'), JSON.stringify({
      version: 1, complete: true, total: 2, sourceIds: [11, 22],
    }))
    for (const malformed of [
      { version: 1, complete: true, total: 3, sourceIds: [11] },
      { version: 1, complete: true, total: 2, sourceIds: [11, 11] },
      { version: 1, complete: false, total: 1, sourceIds: [11] },
    ]) {
      await writeFile(join(newer, 'source_provider_ids_latest.json'), JSON.stringify(malformed))
      assert.deepEqual(await readTopMenuSourcePresence(root, '2026-10-11'), [11, 22])
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})
