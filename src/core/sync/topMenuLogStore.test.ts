import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('live progress counts the bounded full log, not only its 200 displayed lines', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kucafe-topmenu-log-'))
  const previousRoot = process.env.TOPMENU_SYNC_ROOT
  process.env.TOPMENU_SYNC_ROOT = root
  const runId = 'progress-fixture'
  const runDir = join(root, 'runs', runId)
  try {
    await mkdir(runDir, { recursive: true })
    await writeFile(join(root, 'state.json'), JSON.stringify({ runId, status: 'scraping' }))
    const lines = ['تعداد کافه/رستوران‌هایی که پردازش می‌شن: 210']
    for (let index = 1; index <= 210; index++) {
      lines.push(`[${index}/210] کافه ${index} (cafe-${index}) ...`)
      lines.push('    1 آیتم منو پیدا شد.')
      if (index === 1) lines.push('    خطا: hours: HTTP 403')
    }
    const logPath = join(runDir, 'scrape.log')
    await writeFile(logPath, lines.join('\n') + '\n')

    const { readTopMenuLogTail } = await import('./topMenuLogStore')
    const running = await readTopMenuLogTail()
    assert.ok(running)
    assert.equal(running.lines.length, 200)
    assert.equal(running.progress.itemsFound, 210)
    assert.equal(running.progress.failedCafes, 1)
    assert.equal(running.progress.done, 209)
    assert.equal(running.progress.total, 210)

    await writeFile(logPath, lines.join('\n') + '\nتمام شد.\n')
    const complete = await readTopMenuLogTail()
    assert.equal(complete?.progress.stage, 'done')
    assert.equal(complete?.progress.done, 210)
  } finally {
    if (previousRoot === undefined) delete process.env.TOPMENU_SYNC_ROOT
    else process.env.TOPMENU_SYNC_ROOT = previousRoot
    await rm(root, { recursive: true, force: true })
  }
})
