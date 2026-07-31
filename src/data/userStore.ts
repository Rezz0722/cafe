import 'server-only'

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AppUser, Role } from '@/core/auth/types'
import type { OtpRecord } from '@/core/auth/otp'
import { ADMIN_PHONES } from '@/core/config/env'

/**
 * ذخیره‌سازی کاربران و کدهای یک‌بارمصرف روی فایل.
 *
 * مثل `placeStore`، این لایه پشت یک interface ساده است تا جایگزینی‌اش با
 * Postgres هیچ صفحه‌ای را نشکند. جدول `app_user` در `src/db/schema.ts`
 * از قبل تعریف شده.
 *
 * ⚠️  محدودیت‌ها که باید بدانید:
 *   • نوشتن هم‌زمان از چند فرآیند امن نیست (بدون قفل). برای یک سرور تک‌نودی
 *     مشکلی نیست؛ برای چند نود حتماً Postgres.
 *   • هیچ‌کدام از این دو فایل در git نمی‌روند (در .gitignore).
 */

const DATA_DIR = resolve(process.cwd(), 'src/data')
const USERS = resolve(DATA_DIR, 'users.json')
const OTPS = resolve(DATA_DIR, 'otp.json')

async function readJson<T>(path: string, fallback: T): Promise<T> {
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

// ── کاربران ──────────────────────────────────────────────────────────

export async function listUsers(): Promise<AppUser[]> {
  return readJson<AppUser[]>(USERS, [])
}

export async function findUserByPhone(phone: string): Promise<AppUser | null> {
  const users = await listUsers()
  return users.find((u) => u.phone === phone) ?? null
}

export async function findUserById(id: string): Promise<AppUser | null> {
  const users = await listUsers()
  return users.find((u) => u.id === id) ?? null
}

/**
 * کاربر را برمی‌گرداند و اگر نبود می‌سازد.
 *
 * نقش از `ADMIN_PHONES` تعیین می‌شود — هیچ رمز یا حساب پیش‌فرضی در کد
 * نیست. برای ادمین‌شدن، شماره را در env بگذارید و وارد شوید.
 */
export async function findOrCreateUser(phone: string): Promise<AppUser> {
  const users = await listUsers()
  const existing = users.find((u) => u.phone === phone)
  const shouldBeAdmin = ADMIN_PHONES.includes(phone)
  const now = new Date().toISOString()

  if (existing) {
    // ارتقا به ادمین اگر شماره به ADMIN_PHONES اضافه شده باشد.
    // تنزل خودکار نمی‌دهیم: برداشتن دسترسی باید کار آگاهانه‌ی یک آدم باشد،
    // نه اثر جانبی ویرایش یک فایل env.
    const patched: AppUser = {
      ...existing,
      role: shouldBeAdmin && existing.role !== 'admin' ? 'admin' : existing.role,
      lastLoginAt: now,
    }
    await writeJson(USERS, users.map((u) => (u.id === patched.id ? patched : u)))
    return patched
  }

  const created: AppUser = {
    id: randomUUID(),
    phone,
    name: '',
    role: shouldBeAdmin ? 'admin' : 'customer',
    ownedPlaceSlugs: [],
    createdAt: now,
    lastLoginAt: now,
  }
  await writeJson(USERS, [...users, created])
  return created
}

export async function updateUser(
  id: string,
  patch: Partial<Omit<AppUser, 'id' | 'phone'>>,
): Promise<AppUser | null> {
  const users = await listUsers()
  const idx = users.findIndex((u) => u.id === id)
  if (idx === -1) return null

  const next: AppUser = { ...users[idx], ...patch }
  users[idx] = next
  await writeJson(USERS, users)
  return next
}

export async function setUserRole(id: string, role: Role): Promise<AppUser | null> {
  return updateUser(id, { role })
}

export async function grantPlaceOwnership(
  userId: string,
  slug: string,
): Promise<AppUser | null> {
  const user = await findUserById(userId)
  if (!user) return null
  if (user.ownedPlaceSlugs.includes(slug)) return user

  return updateUser(userId, {
    ownedPlaceSlugs: [...user.ownedPlaceSlugs, slug],
    // مالک‌شدن، مشتری را به مالک ارتقا می‌دهد ولی ادمین را تنزل نمی‌دهد.
    role: user.role === 'customer' ? 'owner' : user.role,
  })
}

export async function revokePlaceOwnership(
  userId: string,
  slug: string,
): Promise<AppUser | null> {
  const user = await findUserById(userId)
  if (!user) return null
  return updateUser(userId, {
    ownedPlaceSlugs: user.ownedPlaceSlugs.filter((s) => s !== slug),
  })
}

// ── کدهای یک‌بارمصرف ─────────────────────────────────────────────────

type OtpMap = Record<string, OtpRecord>

export async function getOtp(phone: string): Promise<OtpRecord | null> {
  const map = await readJson<OtpMap>(OTPS, {})
  return map[phone] ?? null
}

export async function saveOtp(record: OtpRecord): Promise<void> {
  const map = await readJson<OtpMap>(OTPS, {})
  map[record.phone] = record
  await writeJson(OTPS, pruneExpired(map))
}

export async function deleteOtp(phone: string): Promise<void> {
  const map = await readJson<OtpMap>(OTPS, {})
  // تاریخچه‌ی نرخ را نگه می‌داریم حتی بعد از مصرف کد، وگرنه ورود موفق،
  // شمارنده را صفر می‌کرد و سقف ساعتی دور زدنی می‌شد.
  const existing = map[phone]
  if (existing) {
    map[phone] = {
      ...existing,
      codeHash: '',
      expiresAt: 0,
      attempts: 0,
    }
  }
  await writeJson(OTPS, pruneExpired(map))
}

export async function bumpOtpAttempts(phone: string): Promise<void> {
  const map = await readJson<OtpMap>(OTPS, {})
  if (map[phone]) {
    map[phone] = { ...map[phone], attempts: map[phone].attempts + 1 }
    await writeJson(OTPS, map)
  }
}

/** رکوردهایی که هم کدشان مرده و هم تاریخچه‌ی نرخشان قدیمی است، حذف می‌شوند. */
function pruneExpired(map: OtpMap): OtpMap {
  const hourAgo = Date.now() - 3600_000
  const out: OtpMap = {}
  for (const [phone, rec] of Object.entries(map)) {
    const recent = (rec.recentRequests ?? []).filter((t) => t > hourAgo)
    if (recent.length === 0 && rec.expiresAt < Date.now()) continue
    out[phone] = { ...rec, recentRequests: recent }
  }
  return out
}

// ── شمارنده‌ی سراسری ارسال ───────────────────────────────────────────
// جدا از رکورد هر شماره، چون سقف per-phone با عوض‌کردن شماره دور زده می‌شود.

const GLOBAL_KEY = '__global__'

export async function getGlobalOtpRequests(): Promise<number[]> {
  const map = await readJson<Record<string, OtpRecord>>(OTPS, {})
  return map[GLOBAL_KEY]?.recentRequests ?? []
}

export async function recordGlobalOtpRequest(pruned: number[]): Promise<void> {
  const map = await readJson<Record<string, OtpRecord>>(OTPS, {})
  map[GLOBAL_KEY] = {
    phone: GLOBAL_KEY,
    codeHash: '',
    expiresAt: 0,
    attempts: 0,
    createdAt: Date.now(),
    recentRequests: [...pruned, Date.now()],
  }
  await writeFile(OTPS, `${JSON.stringify(map, null, 2)}\n`, 'utf8')
}
