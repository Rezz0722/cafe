import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, stat, utimes, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { gunzipSync } from 'node:zlib'

const script = resolve('scripts/archive-app-logs.sh')
const id = 'a'.repeat(64)
test('private deploy log archive: identity, permissions, retention and failure cleanup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kucafe-log-archive-test-'))
  try {
    const bin = join(root, 'bin'), backup = join(root, 'backup'), logs = join(backup, 'app-logs')
    await mkdir(bin); await mkdir(backup); await mkdir(logs)
    await writeFile(join(bin, 'docker'), '#!/bin/bash\nif [[ "$1" == inspect ]]; then echo "${TEST_IDENTITY:-kucafe/application}"; else echo private-log; exit "${TEST_LOG_EXIT:-0}"; fi\n', { mode: 0o700 })
    const run = (extra = {}, container = id) => spawnSync('bash', [script, container], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, KUCAFE_BACKUP_DIR: backup, ...extra }, encoding: 'utf8' })
    for (let i = 0; i < 6; i++) {
      const file = join(logs, `app-old-${i}.log.gz`)
      await writeFile(file, 'old'); await utimes(file, i + 1, i + 1)
    }
    const good = run()
    assert.equal(good.status, 0, good.stderr)
    assert.equal(good.stdout.includes('private-log'), false)
    const files = await readdir(logs)
    assert.equal(files.length, 5)
    assert.equal(files.includes('app-old-0.log.gz'), false)
    assert.equal(files.includes('app-old-1.log.gz'), false)
    const current = files.find(name => name.includes(id.slice(0, 12)))!
    assert.equal((await stat(join(logs, current))).mode & 0o777, 0o600)
    assert.equal((await stat(logs)).mode & 0o777, 0o700)
    assert.equal(gunzipSync(await readFile(join(logs, current))).toString().trim(), 'private-log')
    assert.notEqual(run({ TEST_IDENTITY: 'other/application' }).status, 0)
    assert.notEqual(run({}, 'invalid-id').status, 0)
    assert.notEqual(run({ TEST_LOG_EXIT: '1' }).status, 0)
    assert.deepEqual((await readdir(logs)).sort(), files.sort(), 'failed capture must not publish partial archives')
  } finally { await rm(root, { recursive: true, force: true }) }
})
