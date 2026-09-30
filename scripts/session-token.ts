/**
 * ساخت یک توکن نشست معتبر برای تست دستی.
 *
 *   npx tsx --conditions=react-server scripts/session-token.ts 09151234567
 *
 * خروجی را به‌عنوان کوکی `cafegard_session` بگذارید تا صفحات پشتِ ورود را
 * بدون طی‌کردن جریان پیامک ببینید.
 *
 * ⚠️  فقط برای توسعه. توکن با `SESSION_SECRET` امضا می‌شود، پس روی سرور
 *     تولیدی همان اعتبارِ ورود واقعی را دارد.
 */

import { createSessionToken, SESSION_COOKIE } from '../src/core/auth/session'
import { createAuthSession, findUserByLogin } from '../src/core/auth/userRepo'
import { closeDb } from '../src/db/connection'

async function main() {
  const identifier = process.argv[2]
  if (!identifier) {
    console.error('استفاده: scripts/session-token.ts <شماره یا یوزرنیم>')
    process.exit(1)
  }

  const user = await findUserByLogin(identifier)
  if (!user) {
    console.error(`کاربری با «${identifier}» پیدا نشد.`)
    await closeDb()
    process.exit(1)
  }

  const maxAgeSec = 30 * 24 * 3600
  const sessionId = await createAuthSession({
    userId: user.id,
    method: 'password',
    expiresAt: new Date(Date.now() + maxAgeSec * 1000),
    userAgent: 'scripts/session-token.ts',
  })
  const token = createSessionToken({ sessionId, userId: user.id, phone: user.phone, role: user.role }, maxAgeSec)
  console.log(`${SESSION_COOKIE}=${token}`)
  console.error(`(${user.name || 'بی‌نام'} · ${user.role})`)
  await closeDb()
}

main().catch(async (error) => {
  console.error(error)
  await closeDb()
  process.exit(1)
})
