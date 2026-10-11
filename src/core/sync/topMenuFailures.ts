import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { isTopMenuSourceExcluded } from './topMenuExclusions'
import type { TopMenuSelection } from './topMenuSelection'

export interface TopMenuSourceFailure {
  id: number
  name: string
  reasons: string[]
}

const STAGE_NAMES: Record<string, string> = {
  menu: 'منو', hours: 'ساعات کاری', profile: 'پروفایل',
  provider_row: 'اطلاعات مجموعه', full_record: 'رکورد مجموعه',
}

/** Give admins a bounded explanation without exposing raw exception payloads. */
function readableFailureReason(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const clean = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  if (!clean) return null
  const parts = /^(menu|hours|profile|provider_row|full_record):\s*(.*)$/i.exec(clean)
  const stage = parts ? STAGE_NAMES[parts[1].toLowerCase()] : 'منبع'
  const detail = parts ? parts[2] : clean
  const http = /(?:->\s*)?HTTP\s+(\d{3}):?\s*(.*)$/i.exec(detail)
  if (http) {
    const message = http[2].trim().slice(0, 180)
    return `${stage}: HTTP ${http[1]}${message ? ` — ${message}` : ''}`
  }
  if (/timeout|timed out/i.test(detail)) return `${stage}: مهلت پاسخ منبع تمام شد.`
  if (/connection|network|dns|resolve/i.test(detail)) return `${stage}: ارتباط با منبع برقرار نشد.`
  return `${stage}: خطای دریافت اطلاعات؛ لاگ اجرا را بررسی کنید.`
}

/** Source failures are evidence of incomplete data, never an empty valid menu. */
export async function readTopMenuFailures(runDir: string): Promise<TopMenuSourceFailure[]> {
  const files = (await readdir(runDir)).filter(name => /^failed_\d{8}_\d{6}\.json$/.test(name))
  const failures = new Map<number, TopMenuSourceFailure>()
  for (const file of files) {
    const rows: unknown = JSON.parse(await readFile(join(runDir, file), 'utf8'))
    if (!Array.isArray(rows)) throw new Error(`فایل خطاهای اسکرپ معتبر نیست: ${file}`)
    for (const row of rows) {
      const id = row && typeof row === 'object' ? (row as { id?: unknown }).id : undefined
      if (!Number.isSafeInteger(id) || Number(id) <= 0) throw new Error(`شناسهٔ خطای اسکرپ معتبر نیست: ${file}`)
      const value = row as { name?: unknown; errors?: unknown }
      const existing = failures.get(Number(id)) ?? { id: Number(id), name: '', reasons: [] }
      if (!existing.name && typeof value.name === 'string') existing.name = value.name.trim().slice(0, 100)
      if (Array.isArray(value.errors)) for (const error of value.errors) {
        const reason = readableFailureReason(error)
        if (reason && !existing.reasons.includes(reason) && existing.reasons.length < 5) existing.reasons.push(reason)
      }
      failures.set(Number(id), existing)
    }
  }
  return [...failures.values()].sort((a, b) => a.id - b.id)
}

export async function failedTopMenuSourceIds(runDir: string): Promise<number[]> {
  return (await readTopMenuFailures(runDir)).map(failure => failure.id)
}

export function failedTopMenuSelectionIds(failed: readonly number[], selection: TopMenuSelection): number[] {
  const selected = selection.scope === 'selected' ? new Set(selection.sourceIds) : null
  return failed.filter(id => !isTopMenuSourceExcluded(id) && (!selected || selected.has(id)))
}

/** A missing/truncated failure manifest must never make a partial report look safe. */
export function assertTopMenuFailureManifest(expected: number, ids: readonly number[]): void {
  if (!Number.isSafeInteger(expected) || expected < 0 || expected !== ids.length) {
    throw new Error('جزئیات خطاهای اسکرپ با گزارش هم‌خوان نیست؛ هیچ داده‌ای اعمال نشد. اسکرپ تازه اجرا کنید.')
  }
}
