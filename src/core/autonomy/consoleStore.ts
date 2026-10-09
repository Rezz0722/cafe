import 'server-only'

import { randomUUID } from 'node:crypto'
import { access, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { MESSAGE_FILE } from './consolePolicy'
import type { ConsoleMessageKind } from './consolePolicy'

const publicDir = '/app/autonomy-public'
const privateDir = '/app/autonomy-console'

export type ConsoleMessage = {
  id: string
  text: string
  createdAt: string
  answer: string | null
  answeredAt: string | null
  kind: ConsoleMessageKind
  workStatus: string | null
  taskId: string | null
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

export async function readConsole() {
  const snapshot = await readJson(join(publicDir, 'status.json'))
  const activity = await readJson(join(publicDir, 'activity.json')).catch(() => ({ events: [] }))
  const files = (await readdir(join(privateDir, 'messages'))).filter(name => MESSAGE_FILE.test(name)).sort().slice(-50)
  const messages: ConsoleMessage[] = []
  for (const name of files) {
    try {
      const original = await readJson(join(privateDir, 'messages', name)) as Record<string, unknown>
      if (original.id !== name.slice(0, -5) || typeof original.text !== 'string' || typeof original.createdAt !== 'string') continue
      const reply = await readJson(join(privateDir, 'replies', name)).catch(() => null) as Record<string, unknown> | null
      messages.push({
        id: original.id, text: original.text, createdAt: original.createdAt,
        answer: reply?.id === original.id && typeof reply.answer === 'string' ? reply.answer : null,
        answeredAt: reply?.id === original.id && typeof reply.answeredAt === 'string' ? reply.answeredAt : null,
        kind: original.kind === 'work' ? 'work' : 'question',
        workStatus: reply?.id === original.id && typeof reply.workStatus === 'string' ? reply.workStatus : null,
        taskId: reply?.id === original.id && typeof reply.taskId === 'string' ? reply.taskId : null,
      })
    } catch { /* Skip malformed or incomplete files; never show fabricated data. */ }
  }
  return { snapshot, activity, messages: messages.reverse(), fetchedAt: new Date().toISOString() }
}

export async function queueConsoleMessage(text: string, actorId: string, kind: ConsoleMessageKind = 'question') {
  const files = (await readdir(join(privateDir, 'messages'))).filter(name => MESSAGE_FILE.test(name))
  let pending = 0
  for (const name of files) {
    try { await access(join(privateDir, 'replies', name)); }
    catch { pending += 1 }
  }
  if (pending >= 5) throw new Error('too-many-pending')
  const id = `${Date.now()}-${randomUUID()}`
  const record = { id, text, kind, createdAt: new Date().toISOString(), actorId }
  await writeFile(join(privateDir, 'messages', `${id}.json`), JSON.stringify(record) + '\n', { flag: 'wx', mode: 0o600 })
  return { id, createdAt: record.createdAt }
}
