import 'server-only'

/**
 * خواندن دنباله‌ی لاگ یک اجرای TopMenuMarket — تنها لایه‌ای که به فایل‌سیستم
 * دست می‌زند. منطقِ تجزیه در `topMenuLog.ts` است تا در کلاینت هم قابل استفاده بماند.
 *
 * ═══ چرا دنباله، نه کل فایل ═══
 *
 * یک اسکرپ کامل ۳۵۲ مجموعه است و هر مجموعه ۳ تا ۵ خط می‌نویسد؛ یعنی چند هزار خط.
 * پنل هر ۱۲ ثانیه وضعیت را می‌گیرد، پس خواندنِ کل فایل در هر بار هم پرهزینه است
 * هم بی‌فایده — کاربر فقط چند خط آخر را می‌بیند. `MAX_LOG_BYTES` هم جلوی یک فایل
 * غیرمنتظره‌ی چندگیگابایتی را می‌گیرد.
 */

import { open, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { estimateRemainingMs, parseTopMenuLog, type TopMenuProgress } from './topMenuLog'
import { readTopMenuSyncState, topMenuSyncRoot, type TopMenuSyncState } from './topMenuSync'

/** بیشتر از این مقدار از انتهای فایل خوانده نمی‌شود. */
const MAX_LOG_BYTES = 64 * 1024
/** تعداد خطی که به مرورگر می‌رود. */
const MAX_LINES = 200

/**
 * نام فایل‌های مجاز. مسیر هرگز از سمت مرورگر نمی‌آید: `runId` با regexp اعتبارسنجی
 * می‌شود و نام فایل از این فهرستِ ثابت انتخاب می‌شود.
 */
const LOG_FILES = {
  scrape: 'scrape.log',
  reindex: 'reindex.log',
  media: 'media-download.log',
} as const

export type TopMenuLogName = keyof typeof LOG_FILES

export interface TopMenuLogTail {
  runId: string
  status: TopMenuSyncState['status']
  /** `null` یعنی این فایل برای این اجرا وجود ندارد — نه «خالی است». */
  log: TopMenuLogName
  lines: string[]
  truncated: boolean
  bytes: number
  updatedAt: string | null
  progress: TopMenuProgress
  remainingMs: number | null
  /** فایل‌های موجود برای این اجرا، تا UI بتواند بین‌شان جابه‌جا شود. */
  available: TopMenuLogName[]
}

async function readTail(
  runId: string,
  name: TopMenuLogName,
): Promise<{ lines: string[]; truncated: boolean; bytes: number; updatedAt: string | null } | null> {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(runId)) return null
  const path = join(topMenuSyncRoot, 'runs', runId, LOG_FILES[name])
  let size: number
  let updatedAt: string
  try {
    const info = await stat(path)
    size = info.size
    updatedAt = info.mtime.toISOString()
  } catch {
    return null
  }

  const length = Math.min(size, MAX_LOG_BYTES)
  if (length === 0) return { lines: [], truncated: false, bytes: 0, updatedAt }

  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, size - length)
    return {
      lines: buffer.toString('utf8').split('\n').map(line => line.replace(/\r$/, '')).filter(Boolean).slice(-MAX_LINES),
      truncated: size > length,
      bytes: size,
      updatedAt,
    }
  } finally {
    await handle.close()
  }
}

/**
 * دنباله‌ی لاگ به‌همراه وضعیتِ ترجمه‌شده.
 *
 * اگر فایلِ درخواستی نبود ولی فایل دیگری بود، به آن fallback می‌کند: در فازِ
 * `applying` لاگِ scrape قدیمی است و `reindex.log`/`media-download.log` تازه‌اند.
 * نمایش یک لاگِ چند ساعته به‌جای لاگِ جاری، بدترین حالت است چون بی‌صدا دروغ
 * می‌گوید که کار متوقف شده.
 */
export async function readTopMenuLogTail(requested?: TopMenuLogName): Promise<TopMenuLogTail | null> {
  const state = await readTopMenuSyncState()
  const runId = state.runId
  if (!runId || !/^[A-Za-z0-9_-]{1,100}$/.test(runId)) return null

  const order: TopMenuLogName[] = requested
    ? [requested]
    : state.status === 'applying'
      ? ['media', 'reindex', 'scrape']
      : ['scrape']

  const available: TopMenuLogName[] = []
  const read: Record<string, Awaited<ReturnType<typeof readTail>>> = {}
  for (const name of order) {
    const tail = await readTail(runId, name)
    if (tail) { available.push(name); read[name] = tail }
  }
  if (!available.length) return null

  const log = available[0]!
  const tail = read[log]!
  const progress = parseTopMenuLog(tail.lines.join('\n'))
  return {
    runId,
    status: state.status,
    log,
    lines: tail.lines,
    truncated: tail.truncated,
    bytes: tail.bytes,
    updatedAt: tail.updatedAt,
    progress,
    remainingMs: state.startedAt ? estimateRemainingMs(Date.parse(state.startedAt), progress.done, progress.total) : null,
    available,
  }
}
