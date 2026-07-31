/**
 * ساخت یا به‌روزرسانی حساب کاری با رمز عبور.
 *
 *   npm run user:create -- --phone 09151234567 --name "علیرضا" --role admin
 *   npm run user:create -- --phone 09151234567 --password "دلخواه"
 *   npm run user:create -- --phone 09121112222 --role owner --venue vien-cafe
 *
 * بدون `--password`، یک رمز قوی تصادفی ساخته و **یک‌بار** چاپ می‌شود.
 * رمز فقط به‌صورت هش (scrypt) ذخیره می‌شود، پس اگر گمش کنی باید دوباره
 * بسازی — قابل بازیابی نیست، و همین درست است.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { generatePassword, hashPassword } from '../src/core/auth/password.ts'
import { normalizePhone } from '../src/core/auth/phone.ts'

const ROOT = resolve(import.meta.dirname, '..')
const USERS = resolve(ROOT, 'src/data/users.json')

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}

const phoneRaw = arg('phone')
if (!phoneRaw) {
  console.error('✗ --phone لازم است')
  console.error('  مثال: npm run user:create -- --phone 09151234567 --role admin')
  process.exit(1)
}

const phone = normalizePhone(phoneRaw)
if (!phone) {
  console.error(`✗ شماره نامعتبر: ${phoneRaw}`)
  process.exit(1)
}

const role = (arg('role') ?? 'admin') as 'admin' | 'owner' | 'customer'
if (!['admin', 'owner', 'customer'].includes(role)) {
  console.error(`✗ نقش نامعتبر: ${role} (admin | owner | customer)`)
  process.exit(1)
}

const name = arg('name') ?? ''
const venue = arg('venue')
const password = arg('password') ?? generatePassword(16)

interface StoredUser {
  id: string
  phone: string
  name: string
  role: string
  ownedPlaceSlugs: string[]
  createdAt: string
  lastLoginAt: string | null
  passwordHash?: string | null
  failedLogins?: number[]
}

const users: StoredUser[] = existsSync(USERS)
  ? JSON.parse(readFileSync(USERS, 'utf8'))
  : []

const now = new Date().toISOString()
const existing = users.find((u) => u.phone === phone)

if (existing) {
  existing.role = role
  existing.passwordHash = hashPassword(password)
  existing.failedLogins = [] // قفلِ احتمالی باز شود
  if (name) existing.name = name
  if (venue && !existing.ownedPlaceSlugs.includes(venue)) {
    existing.ownedPlaceSlugs.push(venue)
  }
} else {
  users.push({
    id: randomUUID(),
    phone,
    name: name || 'کاربر',
    role,
    ownedPlaceSlugs: venue ? [venue] : [],
    createdAt: now,
    lastLoginAt: null,
    passwordHash: hashPassword(password),
    failedLogins: [],
  })
}

mkdirSync(dirname(USERS), { recursive: true })
writeFileSync(USERS, `${JSON.stringify(users, null, 2)}\n`, 'utf8')

console.log('')
console.log(existing ? '✓ حساب به‌روز شد' : '✓ حساب ساخته شد')
console.log(`  شماره : ${phone}`)
console.log(`  نقش   : ${role}`)
if (venue) console.log(`  کافه  : ${venue}`)
console.log(`  رمز   : ${password}`)
console.log('')
console.log('  ورود:  /auth  →  «ورود با رمز عبور»')
console.log('  رمز فقط هش‌شده ذخیره شد و دیگر قابل نمایش نیست.')
console.log('')
