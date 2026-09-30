/** Run the page smoke with a short-lived, revocable test session in memory. */
import { spawnSync } from 'node:child_process'
import { createSessionToken, SESSION_COOKIE } from '../src/core/auth/session'
import { createAuthSession, findUserByLogin, revokeSession } from '../src/core/auth/userRepo'
import { closeDb } from '../src/db/connection'

const identifier = process.argv[2]
const base = process.argv[3] ?? 'http://127.0.0.1:9091'
if (!identifier) {
  console.error('استفاده: npm run pages:auth-smoke -- <شماره یا یوزرنیم> [baseUrl]')
  process.exit(1)
}

let sessionId: string | null = null
try {
  const user = await findUserByLogin(identifier)
  if (!user || user.status !== 'active') throw new Error('حساب فعال پیدا نشد.')
  const maxAgeSec = 10 * 60
  sessionId = await createAuthSession({
    userId: user.id,
    method: 'password',
    expiresAt: new Date(Date.now() + maxAgeSec * 1000),
    userAgent: 'pages-auth-smoke',
  })
  const token = createSessionToken(
    { sessionId, userId: user.id, phone: user.phone, role: user.role },
    maxAgeSec,
  )
  const result = spawnSync(process.execPath, ['scripts/pages-smoke.mjs', base], {
    cwd: process.cwd(),
    env: { ...process.env, SESSION_COOKIE: `${SESSION_COOKIE}=${token}` },
    stdio: 'inherit',
  })
  process.exitCode = result.status ?? 1
} finally {
  if (sessionId) await revokeSession(sessionId)
  await closeDb()
}
