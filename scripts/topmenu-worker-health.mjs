import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.env.TOPMENU_SYNC_ROOT
if (!root) process.exit(1)
const last = Number(await readFile(join(root, 'worker-heartbeat'), 'utf8').catch(() => '0'))
process.exit(Number.isFinite(last) && Date.now() - last < 60_000 ? 0 : 1)
