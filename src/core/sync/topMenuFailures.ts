import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { isTopMenuSourceExcluded } from './topMenuExclusions'
import type { TopMenuSelection } from './topMenuSelection'

/** Source failures are evidence of incomplete data, never an empty valid menu. */
export async function failedTopMenuSourceIds(runDir: string): Promise<number[]> {
  const files = (await readdir(runDir)).filter(name => /^failed_\d{8}_\d{6}\.json$/.test(name))
  const ids = new Set<number>()
  for (const file of files) {
    const rows: unknown = JSON.parse(await readFile(join(runDir, file), 'utf8'))
    if (!Array.isArray(rows)) throw new Error(`فایل خطاهای اسکرپ معتبر نیست: ${file}`)
    for (const row of rows) {
      const id = row && typeof row === 'object' ? (row as { id?: unknown }).id : undefined
      if (!Number.isSafeInteger(id) || Number(id) <= 0) throw new Error(`شناسهٔ خطای اسکرپ معتبر نیست: ${file}`)
      ids.add(Number(id))
    }
  }
  return [...ids].sort((a, b) => a - b)
}

export function failedTopMenuSelectionIds(failed: readonly number[], selection: TopMenuSelection): number[] {
  const selected = selection.scope === 'selected' ? new Set(selection.sourceIds) : null
  return failed.filter(id => !isTopMenuSourceExcluded(id) && (!selected || selected.has(id)))
}
