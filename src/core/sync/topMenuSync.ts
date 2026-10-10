import 'server-only'

import { spawn } from 'node:child_process'
import { chown, mkdir, open, readFile, rename, stat, unlink, writeFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { isNotNull } from 'drizzle-orm'
import { getDb } from '@/db/connection'
import { place } from '@/db/schema'
import { flattenCafeItems, type RawCafe } from '@/core/import/source'
import {
  annotateSourceAvailability,
  parseTopMenuSelection,
  selectTopMenuCafes,
  staleSelectionIds,
  type TopMenuSelection,
  type TopMenuTarget,
} from './topMenuSelection'
import { failedTopMenuSourceIds, failedTopMenuSelectionIds } from './topMenuFailures'

export type TopMenuSyncStatus = 'idle' | 'scraping' | 'ready' | 'applying' | 'completed' | 'failed'

export interface TopMenuPriceChange {
  itemId: number
  sourceItemId: number
  placeId: number
  placeName: string
  itemName: string
  oldPrice: number | null
  newPrice: number | null
  oldAvailable: boolean
  newAvailable: boolean
}

export interface TopMenuSyncReport {
  totalChanges: number
  totalNewCafes: number
  totalNewItems: number
  totalNewSections: number
  totalUpdatedItems: number
  totalMovedItems: number
  totalReactivatedItems: number
  totalArchivedItems: number
  totalConflicts: number
  priceChanges: number
  priceIncreases: number
  priceDecreases: number
  availabilityChanges: number
  sourceCafes: number
  matchedCafes: number
  matchedItems: number
  unchangedItems: number
  failedCafes: number
  newCafes: { sourceId: number; name: string; username: string; sections: number; items: number }[]
  newItems: { sourceId: number; sourceCafeId?: number; placeName: string; sectionName: string; name: string; price: number | null }[]
  conflicts: { sourceId: number; sourceCafeId?: number; placeName: string; name: string; reason: string }[]
  changes: TopMenuPriceChange[]
  cafes: { placeId: number; name: string; priceChanges: number; priceIncreases: number; priceDecreases: number; availabilityChanges: number; newItems: number; movedItems: number; archivedItems: number }[]
  reportVersion?: number
}

export interface TopMenuSyncState {
  runId: string | null
  status: TopMenuSyncStatus
  pid?: number
  startedAt?: string
  finishedAt?: string
  appliedAt?: string
  actorUserId?: string
  actorLabel?: string
  error?: string
  selection?: TopMenuSelection
  applySelection?: TopMenuSelection
  catalog?: TopMenuTarget[]
  reportTargets?: TopMenuTarget[]
  report?: TopMenuSyncReport
  applied?: {
    createdCafes: number
    createdSections: number
    insertedItems: number
    updatedItems: number
    movedItems: number
    reactivatedItems: number
    archivedItems: number
    mediaRegistered: number
    skipped: number
    affectedCafes: number
    backup: string
  }
}

const ROOT = process.env.TOPMENU_SYNC_ROOT
  ? resolve(process.env.TOPMENU_SYNC_ROOT)
  : join(process.cwd(), 'var', 'topmenu-sync')
const STATE = join(ROOT, 'state.json')

export async function readTopMenuSyncState(): Promise<TopMenuSyncState> {
  try {
    return JSON.parse(await readFile(STATE, 'utf8')) as TopMenuSyncState
  } catch {
    return { runId: null, status: 'idle' }
  }
}

/** نسخهٔ سبک برای ارسال به مرورگر؛ گزارش کامل فقط روی سرور و برای apply می‌ماند. */
export async function readTopMenuSyncSummary(): Promise<TopMenuSyncState> {
  const state = await readTopMenuSyncState()
  const { catalog, reportTargets } = await readTopMenuTargets(state)
  if (!state.report) return { ...state, catalog, reportTargets }
  return {
    ...state,
    catalog,
    reportTargets,
    report: {
      ...state.report,
      changes: state.report.changes.slice(0, 200),
      newCafes: state.report.newCafes.slice(0, 100),
      newItems: state.report.newItems.slice(0, 200),
      conflicts: (state.report.conflicts ?? []).slice(0, 200),
      cafes: state.report.cafes,
    },
  }
}

async function readSnapshot(state: TopMenuSyncState): Promise<RawCafe[]> {
  if (!state.runId || !/^[A-Za-z0-9_-]{1,100}$/.test(state.runId)) return []
  try {
    const value = JSON.parse(await readFile(join(ROOT, 'runs', state.runId, 'cafes_full_latest.json'), 'utf8'))
    if (!Array.isArray(value)) return []
    return value.filter((cafe): cafe is RawCafe => {
      if (!cafe || typeof cafe !== 'object' || typeof cafe['نام مجموعه'] !== 'string'
        || !Number.isSafeInteger(cafe['شناسه']) || cafe['شناسه'] <= 0) return false
      try { flattenCafeItems(cafe); return true } catch { return false }
    })
  } catch { return [] }
}

/**
 * شناسه‌های مجموعه‌هایی که آخرین فهرستِ کاملِ منبع در آن‌ها دیده شده‌اند.
 *
 * snapshotِ اجرای جاری «فهرست کامل» نیست — نتیجه‌ی انتخاب ادمین است. اگر ادمین
 * ۳ کافه را تیک زده باشد، snapshot فقط همان ۳ تا را دارد و بقیه‌ی ۳۴۹ کافه در آن
 * غایب‌اند. پس برای پاسخ به «آیا این کافه هنوز در منبع هست؟» باید فایلی خوانده
 * شود که *همه‌ی* providerها را دارد: `providers_info_latest.json` یا
 * `cafes_full_latest.json` از آخرین اجرایی که چنین فایلی ساخته.
 *
 * بین چند run، تازه‌ترین را می‌گیریم. `null` یعنی هیچ فهرست کاملی پیدا نشد یا
 * خوانده نشد — و `null` یعنی «نمی‌دانیم»، نه «همه پاک شده‌اند».
 */
async function readSourcePresenceIds(state: TopMenuSyncState): Promise<number[] | null> {
  const candidates: string[] = []
  if (state.runId && /^[A-Za-z0-9_-]{1,100}$/.test(state.runId)) {
    candidates.push(join(ROOT, 'runs', state.runId, 'providers_info_latest.json'))
  }
  let entries: string[] = []
  try { entries = (await readdir(join(ROOT, 'runs'))).filter(name => /^[A-Za-z0-9_-]{1,100}$/.test(name)) } catch { return null }
  candidates.push(...entries.sort().reverse().map(name => join(ROOT, 'runs', name, 'providers_info_latest.json')))
  candidates.push(...entries.sort().reverse().map(name => join(ROOT, 'runs', name, 'cafes_full_latest.json')))

  for (const path of candidates) {
    try {
      const value = JSON.parse(await readFile(path, 'utf8'))
      if (!Array.isArray(value) || !value.length) continue
      const ids = value
        .map((row: unknown) => (row && typeof row === 'object' ? Number((row as Record<string, unknown>)['شناسه']) : NaN))
        .filter((id: number) => Number.isSafeInteger(id) && id > 0)
      if (ids.length) return [...new Set(ids)]
    } catch { continue }
  }
  return null
}

/** Complete lightweight catalog, independent of the truncated price-change sample. */
export async function readTopMenuTargets(state: TopMenuSyncState) {
  const rows = await getDb().select({ placeId: place.id, sourceId: place.sourceId, name: place.name, username: place.sourceUsername }).from(place).where(isNotNull(place.sourceId))
  const catalog = new Map<number, TopMenuTarget>(rows.filter(row => row.sourceId! > 0).map(row => [row.sourceId!, { ...row, sourceId: row.sourceId!, username: row.username ?? '' }]))
  const snapshot = await readSnapshot(state)
  const reportTargets = snapshot.map(cafe => ({ sourceId: Number(cafe['شناسه']), placeId: catalog.get(Number(cafe['شناسه']))?.placeId ?? null,
    name: catalog.get(Number(cafe['شناسه']))?.name ?? cafe['نام مجموعه'], username: cafe['یوزرنیم'] ?? '', items: flattenCafeItems(cafe).length, inSource: true as const }))
  for (const target of reportTargets) if (!catalog.has(target.sourceId)) catalog.set(target.sourceId, target)

  /*
   * کاتالوگِ اسکرپ از دیتابیس می‌آید، ولی منبع هم مستقل است و مجموعه حذف می‌کند.
   * بدون این علامت‌گذاری، مجموعه‌ای که منبع حذفش کرده در انتخاب ادمین می‌ماند و
   * `topmarket.py` کل اجرا را می‌کشد — یعنی چند مجموعه‌ی حذف‌شده، صدها مجموعه‌ی
   * سالم را هم قفل می‌کنند. اینجا فقط *نشان‌دهی* می‌کنیم؛ گاردِ خودِ اسکرپر و
   * `selectTopMenuCafes` دست‌نخورده می‌مانند.
   */
  const presence = await readSourcePresenceIds(state)
  const sorted = [...catalog.values()]
    .map(target => annotateSourceAvailability([target], presence ?? [])[0]!)
    .sort((a, b) => a.name.localeCompare(b.name, 'fa'))
  return { catalog: sorted, reportTargets }
}

export async function writeTopMenuSyncState(state: TopMenuSyncState): Promise<void> {
  await mkdir(ROOT, { recursive: true })
  const temporary = join(ROOT, `.state-${randomUUID()}.json`)
  await writeFile(temporary, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 })
  // The worker needs root only for the existing root-owned media tree. Its
  // atomic state snapshots must remain readable/writable by the web UID.
  if (process.env.TOPMENU_SYNC_EXECUTION_MODE === 'worker' && process.getuid?.() === 0) {
    await chown(temporary, 10001, 10001)
  }
  await rename(temporary, STATE)
  if(state.runId && /^[a-zA-Z0-9_-]{1,100}$/.test(state.runId)){
    try{
    const directory=join(ROOT,'runs',state.runId)
    await mkdir(directory,{recursive:true})
    const snapshot=join(directory,`.job-${randomUUID()}.json`)
    await writeFile(snapshot,JSON.stringify(state),{encoding:'utf8',mode:0o600})
    if(process.env.TOPMENU_SYNC_EXECUTION_MODE==='worker'&&process.getuid?.()===0)await chown(snapshot,10001,10001)
    await rename(snapshot,join(directory,'job.json'))
    }catch{console.warn('[topmenu-sync] job history snapshot could not be saved; primary state is intact')}
  }
}

/** Admin-only callers. Never resolve a path supplied by a browser. */
export async function readTopMenuJobs(){
  let entries:string[]=[];try{entries=await readdir(join(ROOT,'runs'))}catch{return []}
  const jobs=await Promise.all(entries.filter(name=>/^[a-zA-Z0-9_-]{1,100}$/.test(name)).sort().reverse().slice(0,100).map(async runId=>{
    try{const state=JSON.parse(await readFile(join(ROOT,'runs',runId,'job.json'),'utf8')) as TopMenuSyncState;return {runId,status:state.status,hasReport:!!state.report,startedAt:state.startedAt,finishedAt:state.finishedAt,appliedAt:state.appliedAt,selection:state.selection,changes:state.report?.totalChanges??0,applied:state.applied?{affectedCafes:state.applied.affectedCafes,backupCreated:!!state.applied.backup}:null}}
    catch{const info=await stat(join(ROOT,'runs',runId)).catch(()=>null);return info?{runId,status:'legacy',startedAt:info.mtime.toISOString(),changes:null,applied:null}:null}
  }))
  return jobs.filter(Boolean)
}

export async function readTopMenuReport(runId:string){
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(runId))return null
 const current=await readTopMenuSyncState()
 if(current.runId===runId)return current.report??null
 try{return (JSON.parse(await readFile(join(ROOT,'runs',runId,'job.json'),'utf8')) as TopMenuSyncState).report??null}catch{return null}
}

function processIsAlive(pid?: number): boolean {
  if (!pid) return false
  try { process.kill(pid, 0); return true } catch { return false }
}

export async function startTopMenuSync(
  mode: 'scrape' | 'apply',
  actor: { userId: string; label: string },
  options: { selection: TopMenuSelection; expectedRunId?: string } = { selection: { scope: 'all', sourceIds: [] } },
): Promise<{ ok: boolean; error?: string }> {
  await mkdir(ROOT, { recursive: true })
  const lockPath = join(ROOT, 'start.lock')
  try {
    const lock = await open(lockPath, 'wx', 0o600)
    await lock.writeFile(String(process.pid)); await lock.close()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const owner = Number(await readFile(lockPath, 'utf8').catch(() => '0'))
    const age = Date.now() - (await stat(lockPath)).mtimeMs
    // In worker mode the lock survives container replacement, while process IDs
    // are recycled in the new PID namespace. Never trust a matching PID there.
    if (age > 30000 && (process.env.TOPMENU_SYNC_EXECUTION_MODE === 'worker' || !processIsAlive(owner))) {
      await unlink(lockPath).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error })
      return startTopMenuSync(mode, actor, options)
    }
    return { ok: false, error: 'شروع عملیات دیگری در جریان است؛ چند لحظه بعد دوباره بررسی کنید.' }
  }
  try {
  const current = await readTopMenuSyncState()
  if ((current.status === 'scraping' || current.status === 'applying') &&
    (process.env.TOPMENU_SYNC_EXECUTION_MODE === 'worker' || processIsAlive(current.pid))) {
    return { ok: false, error: 'یک عملیات همگام‌سازی هنوز در حال اجراست.' }
  }
  if (mode === 'apply' && (current.status !== 'ready' || !current.report || !current.runId)) {
    return { ok: false, error: 'ابتدا اسکرپ را اجرا کنید و منتظر آماده‌شدن گزارش بمانید.' }
  }
  if (mode === 'apply' && options.expectedRunId !== undefined && options.expectedRunId !== current.runId)
    return { ok: false, error: 'گزارش عوض شده است؛ صفحه را تازه و کافه‌ها را دوباره انتخاب کنید.' }
  const selection = parseTopMenuSelection(options.selection.scope, options.selection.sourceIds)
  if (selection.scope === 'selected') {
    const targets = await readTopMenuTargets(current)
    const pool = mode === 'apply' ? targets.reportTargets : targets.catalog
    const known = new Set(pool.map(target => target.sourceId))
    if (selection.sourceIds.some(id => !known.has(id))) return { ok: false, error: 'کافهٔ انتخاب‌شده در فهرست معتبر این عملیات نیست؛ صفحه را تازه کنید.' }
    /*
     * مجموعه‌ای که در آخرین فهرست منبع نبوده، اسکرپ‌شدنی نیست و
     * `topmarket.py` به همین دلیل کل اجرا را می‌کشد. الان — پیش از پنج دقیقه
     * اسکرپ — با *نام* می‌گوییم کدام‌ها را باید از انتخاب برداشت.
     *
     * فقط `inSource === false` جلوی درخواست را می‌گیرد. حالت نامعلوم
     * (`undefined`) عبور می‌دهد و تصمیم را به گاردِ خودِ اسکرپر می‌سپارد — این
     * گارد عمداً سخت‌گیر است و نباید دور زده شود.
     */
    const stale = staleSelectionIds(pool, selection.sourceIds)
    if (stale.length) {
      const names = stale
        .map(id => pool.find(target => target.sourceId === id))
        .filter((target): target is TopMenuTarget => Boolean(target))
        .map(target => target.name)
      return {
        ok: false,
        error: `${stale.length.toLocaleString('fa-IR')} کافه دیگر در فهرست TopMenuMarket نیست: ${names.join('، ')}. از انتخاب بردارشان و دوباره اجرا کن.`,
      }
    }
  }
  if (mode === 'apply') {
    const snapshot = await readSnapshot(current)
    if (!snapshot.length) return { ok: false, error: 'فایل کامل گزارش در دسترس نیست؛ اسکرپ تازه اجرا کنید.' }
    selectTopMenuCafes(snapshot, selection)
    const failed = await failedTopMenuSourceIds(join(ROOT, 'runs', current.runId!))
    const blocked = failedTopMenuSelectionIds(failed, selection)
    if (blocked.length) return { ok: false, error: `اطلاعات ${blocked.length.toLocaleString('fa-IR')} کافه از منبع کامل دریافت نشده است (${blocked.slice(0, 10).join('، ')}). این کافه‌ها را از انتخاب بردارید یا پس از رفع خطای منبع دوباره اسکرپ کنید؛ هیچ داده‌ای اعمال نشد.` }
  }
  const runId = mode === 'scrape'
    ? `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${randomUUID().slice(0, 8)}`
    : current.runId!
  const runDir = join(ROOT, 'runs', runId)
  await mkdir(runDir, { recursive: true })
  await writeFile(join(runDir, mode === 'scrape' ? 'scrape-selection.json' : 'apply-selection.json'), JSON.stringify(selection), { mode: 0o600 })
  const next: TopMenuSyncState = {
    ...(mode === 'apply' ? current : { runId }), runId,
    status: mode === 'scrape' ? 'scraping' : 'applying', pid: undefined,
    startedAt: mode === 'scrape' ? new Date().toISOString() : current.startedAt,
    actorUserId: actor.userId, actorLabel: actor.label, error: undefined,
    ...(mode === 'scrape' ? { selection } : { applySelection: selection }),
  }
  await writeTopMenuSyncState(next)
  if (process.env.TOPMENU_SYNC_EXECUTION_MODE === 'worker') return { ok: true }
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', '--conditions=react-server', 'scripts/topmenu-sync.ts', mode, runId],
    { cwd: process.cwd(), detached: true, stdio: 'ignore', env: process.env },
  )
  try { await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject) }) }
  catch { await writeTopMenuSyncState({ ...current, error: 'پردازش همگام‌سازی شروع نشد.' }); return { ok: false, error: 'پردازش همگام‌سازی شروع نشد؛ گزارش محفوظ است.' } }
  child.unref()
  await writeTopMenuSyncState({ ...next, pid: child.pid })
  return { ok: true }
  } finally { await unlink(lockPath).catch(() => {}) }
}

export const topMenuSyncRoot = ROOT
