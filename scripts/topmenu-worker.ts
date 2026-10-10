/** Dedicated, single-owner consumer for admin-approved TopMenu jobs. */
import { spawn } from 'node:child_process'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  readTopMenuSyncState,
  topMenuSyncRoot,
  writeTopMenuSyncState,
  type TopMenuSyncState,
} from '../src/core/sync/topMenuSync.ts'

if (process.env.TOPMENU_SYNC_EXECUTION_MODE !== 'worker') {
  throw new Error('TopMenu worker requires TOPMENU_SYNC_EXECUTION_MODE=worker')
}

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const heartbeat = join(topMenuSyncRoot, 'worker-heartbeat')
let stopping = false
process.on('SIGTERM', () => { stopping = true })
process.on('SIGINT', () => { stopping = true })

async function markFailed(state: TopMenuSyncState, message: string): Promise<void> {
  const current = await readTopMenuSyncState()
  if (current.runId !== state.runId || current.status !== state.status) return
  await writeTopMenuSyncState({ ...current, status: 'failed', pid: undefined,
    finishedAt: new Date().toISOString(), error: message })
}

async function execute(state: TopMenuSyncState): Promise<void> {
  const mode = state.status === 'scraping' ? 'scrape' : 'apply'
  if (!state.runId || !/^[A-Za-z0-9_-]{1,100}$/.test(state.runId)) {
    await markFailed(state, 'شناسهٔ اجرای اسکرپ نامعتبر است.')
    return
  }
  const child = spawn(process.execPath,
    ['--import', 'tsx', '--conditions=react-server', 'scripts/topmenu-sync.ts', mode, state.runId],
    { cwd: process.cwd(), stdio: 'inherit', env: process.env })
  if (child.pid) await writeTopMenuSyncState({ ...state, pid: child.pid })
  let exitCode: number
  try {
    exitCode = await new Promise<number>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', code => resolve(code ?? 1))
    })
  } catch (error) {
    await markFailed(state, `پردازش اسکرپر شروع نشد: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  if (exitCode !== 0) await markFailed(state, `پردازش اسکرپر با کد ${exitCode} پایان یافت؛ گزارش اجرا را بررسی کنید.`)
  else await markFailed(state, 'پردازش پایان یافت ولی وضعیت نهایی ثبت نشد؛ داده‌ای را اعمال نکنید.')
}

await mkdir(topMenuSyncRoot, { recursive: true })
const startup = await readTopMenuSyncState()
if ((startup.status === 'scraping' || startup.status === 'applying') && startup.pid) {
  await markFailed(startup, 'worker هنگام اجرای قبلی متوقف شد. برای جلوگیری از اعمال تکراری، عملیات خودکار ادامه نیافت؛ دوباره بررسی و اجرا کنید.')
}
const updateHeartbeat = async () => writeFile(heartbeat, String(Date.now()), { mode: 0o644 })
await updateHeartbeat()
await chmod(heartbeat, 0o644)
const timer = setInterval(() => { updateHeartbeat().catch(error => console.error('[topmenu-worker] heartbeat', error)) }, 10_000)
try {
  while (!stopping) {
    const state = await readTopMenuSyncState()
    if ((state.status === 'scraping' || state.status === 'applying') && !state.pid) {
      await execute(state)
    }
    await pause(2_000)
  }
} finally {
  clearInterval(timer)
}
