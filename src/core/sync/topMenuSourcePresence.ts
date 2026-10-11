import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

interface FullSourceDirectory {
  version: number
  complete: boolean
  total: number
  sourceIds: number[]
}

function validatedIds(value: unknown): number[] | null {
  if (!value || typeof value !== 'object') return null
  const directory = value as FullSourceDirectory
  if (directory.version !== 1 || directory.complete !== true || !Array.isArray(directory.sourceIds)
    || !Number.isSafeInteger(directory.total) || directory.total <= 0
    || directory.sourceIds.length !== directory.total
    || directory.sourceIds.some(id => !Number.isSafeInteger(id) || id <= 0 || id > 2147483647)
    || new Set(directory.sourceIds).size !== directory.total) return null
  return directory.sourceIds
}

/** A worker must never substitute an older run's directory for its own scrape. */
export async function readTopMenuRunSourcePresence(root: string, runId: string): Promise<number[] | null> {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(runId)) return null
  try {
    return validatedIds(JSON.parse(await readFile(join(root, 'runs', runId, 'source_provider_ids_latest.json'), 'utf8')))
  } catch { return null }
}

/** Only a proven full directory may mark a cafe absent from the source. */
export async function readTopMenuSourcePresence(root: string, currentRunId?: string | null): Promise<number[] | null> {
  let entries: string[]
  try { entries = await readdir(join(root, 'runs')) } catch { return null }
  const safe = entries.filter(name => /^[A-Za-z0-9_-]{1,100}$/.test(name))
  const candidates = [...new Set([
    ...(currentRunId && /^[A-Za-z0-9_-]{1,100}$/.test(currentRunId) ? [currentRunId] : []),
    ...safe.sort().reverse(),
  ])]
  for (const runId of candidates) {
    const ids = await readTopMenuRunSourcePresence(root, runId)
    if (ids) return ids
  }
  return null
}
