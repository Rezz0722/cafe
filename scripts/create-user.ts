/**
 * ساخت یا به‌روزرسانی حساب با رمز عبور — روی MySQL.
 *
 *   npm run user:create -- --phone 09151234567 --role admin --name "نگار"
 *   npm run user:create -- --username shayer_cafe --role owner --place shayer
 *   npm run user:create -- --phone 09151234567 --password "..."   (رمز دلخواه)
 *   npm run user:create -- --username x --temp                    (رمز موقت)
 *
 * ═══ چرا این اسکریپت لازم است ═══
 *
 * اولین ادمین را نمی‌شود از داخل سایت ساخت — هیچ ادمینی وجود ندارد که
 * بسازدش. `ADMIN_PHONES` هم فقط با ورود پیامکی کار می‌کند و اگر سرویس پیامک
 * در دسترس نباشد بی‌فایده است. این اسکریپت آن گره را باز می‌کند.
 *
 * بعد از اولین ادمین، ساختن حساب و صدور اعتبارنامه از پنل ادمین انجام
 * می‌شود؛ این اسکریپت فقط برای bootstrap و کار عملیاتی است.
 *
 * ⚠️  رمز **یک‌بار** در ترمینال چاپ می‌شود و هیچ‌جا ذخیره نمی‌شود (فقط هشش).
 */

import { eq } from 'drizzle-orm'
import { generatePassword, hashPassword } from '../src/core/auth/password'
import { normalizePhone } from '../src/core/auth/phone'
import { closeDb, getDb } from '../src/db/connection'
import { appUser, place as placeTable, userPlaceRole } from '../src/db/schema'
import { randomUUID } from 'node:crypto'

type Role = 'customer' | 'owner' | 'admin'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  return value && !value.startsWith('--') ? value : undefined
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

async function main() {
  const db = getDb()

  const phoneRaw = arg('phone')
  const username = arg('username')?.trim().toLowerCase()
  const name = arg('name') ?? ''
  const roleArg = (arg('role') ?? 'admin') as Role
  const placeSlug = arg('place')
  const explicitPassword = arg('password')
  const temporary = flag('temp')

  if (!['customer', 'owner', 'admin'].includes(roleArg)) {
    throw new Error(`نقش نامعتبر: ${roleArg}. یکی از customer | owner | admin`)
  }

  const phone = phoneRaw ? normalizePhone(phoneRaw) : null
  if (phoneRaw && !phone) {
    throw new Error(`شماره نامعتبر: ${phoneRaw}`)
  }
  if (!phone && !username) {
    throw new Error('حداقل یکی از --phone یا --username لازم است.')
  }

  const password = explicitPassword ?? generatePassword(14)
  const passwordHash = hashPassword(password)

  // ── کاربر موجود؟ (با شماره یا یوزرنیم)
  let existingId: string | null = null
  if (phone) {
    const [row] = await db
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.phone, phone))
      .limit(1)
    existingId = row?.id ?? null
  }
  if (!existingId && username) {
    const [row] = await db
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.username, username))
      .limit(1)
    existingId = row?.id ?? null
  }

  let userId: string
  if (existingId) {
    userId = existingId
    await db
      .update(appUser)
      .set({
        role: roleArg,
        passwordHash,
        passwordUpdatedAt: new Date(),
        mustChangePassword: temporary,
        status: 'active',
        failedLogins: 0,
        lockedUntil: null,
        ...(username ? { username } : {}),
        ...(phone ? { phone } : {}),
        ...(name ? { name } : {}),
      })
      .where(eq(appUser.id, userId))
    console.log('حساب موجود به‌روزرسانی شد.')
  } else {
    userId = randomUUID()
    await db.insert(appUser).values({
      id: userId,
      phone,
      username: username ?? null,
      name,
      role: roleArg,
      passwordHash,
      passwordUpdatedAt: new Date(),
      mustChangePassword: temporary,
    })
    console.log('حساب تازه ساخته شد.')
  }

  // ── انتساب کافه، اگر خواسته شده
  if (placeSlug) {
    const [target] = await db
      .select({ id: placeTable.id, name: placeTable.name })
      .from(placeTable)
      .where(eq(placeTable.slug, placeSlug))
      .limit(1)

    if (!target) {
      console.warn(`⚠️  کافه با slug «${placeSlug}» پیدا نشد — انتساب انجام نشد.`)
    } else {
      await db
        .insert(userPlaceRole)
        .values({ userId, placeId: target.id, role: 'owner', status: 'active' })
        .onDuplicateKeyUpdate({ set: { status: 'active', role: 'owner' } })
      console.log(`کافه «${target.name}» به این حساب متصل شد.`)
    }
  }

  console.log('\n── اعتبارنامه ──')
  if (phone) console.log(`شماره:    ${phone}`)
  if (username) console.log(`یوزرنیم:  ${username}`)
  console.log(`رمز:      ${password}`)
  console.log(`نقش:      ${roleArg}`)
  if (temporary) console.log('حالت:     رمز موقت — کاربر باید در ورود اول عوضش کند')
  console.log('\n⚠️  این رمز جای دیگری ذخیره نشده. همین حالا جایی امن نگهش دارید.')
  console.log('ورود از /auth → «ورود با رمز عبور»')

  await closeDb()
}

main().catch(async (error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : error}`)
  await closeDb()
  process.exit(1)
})
