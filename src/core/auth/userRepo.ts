import 'server-only'

/**
 * مخزن کاربران روی MySQL.
 *
 * جای `src/data/userStore.ts` (فایل JSON) را می‌گیرد. سطحِ توابع تقریباً
 * همان است تا کدِ احراز هویت دست‌نخورده بماند، ولی سه قابلیت اضافه شده که
 * فایل JSON نمی‌توانست بدهد:
 *
 *   ۱. **یوزرنیم** در کنار شماره — پنل کافه اعتبارنامه‌ای می‌گیرد که ادمین
 *      ساخته و ممکن است شماره نداشته باشد.
 *   ۲. **رمز دائمی** با پرچم «باید عوض شود» — تا وقتی پیامک در دسترس نیست،
 *      ورود با رمز مسیر اصلی است، نه راه فرار.
 *   ۳. **نقش روی مکان** در جدول `user_place_role` — یک کاربر می‌تواند چند
 *      کافه داشته باشد و هر انتساب رد پا (چه کسی داد، کِی) دارد.
 *
 * ═══ چرا قفل‌شدن ورود در دیتابیس است و نه در حافظه ═══
 *
 * شمارنده‌ی تلاش ناموفق در حافظه‌ی فرآیند، با ری‌استارت پاک می‌شود و روی چند
 * نود اصلاً کار نمی‌کند — یعنی حمله‌ی brute-force فقط باید صبر کند تا دیپلوی
 * بعدی. ستون `failed_logins` و `locked_until` روی ردیف کاربر است.
 */

import { randomUUID } from 'node:crypto'
import { and, desc, eq, gt, isNotNull, lt, or, sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import {
  appUser,
  otpCode,
  place as placeTable,
  userPlaceRole,
} from '@/db/schema'
import { ADMIN_PHONES } from '@/core/config/env'
import { DEFAULT_LOCKOUT, type LockoutPolicy } from './password'
import type { AppUser, Role } from './types'

// ═══════════════════════════════════════════════════════════════════════
// نگاشت ردیف به مدل دامنه
// ═══════════════════════════════════════════════════════════════════════

type UserRow = typeof appUser.$inferSelect

/**
 * مدل دامنه‌ی کاربر، غنی‌شده.
 *
 * `AppUser` قدیمی `ownedPlaceSlugs` داشت و همان نگه داشته شده تا کد موجود
 * نشکند، ولی `ownedPlaces` با شناسه و نام هم اضافه شده — پنل کافه به نام
 * نیاز دارد و گرفتنش با slug یک پرس‌وجوی اضافه می‌شد.
 */
export interface UserRecord extends AppUser {
  username: string | null
  email: string | null
  mustChangePassword: boolean
  status: 'active' | 'blocked'
  ownedPlaces: { id: number; slug: string; name: string }[]
  createdByUserId: string | null
  passwordUpdatedAt: string | null
}

function toRecord(row: UserRow, places: { id: number; slug: string; name: string }[]): UserRecord {
  return {
    id: row.id,
    phone: row.phone ?? '',
    name: row.name,
    role: row.role,
    username: row.username,
    email: row.email,
    ownedPlaceSlugs: places.map((place) => place.slug),
    ownedPlaces: places,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    blocked: row.status === 'blocked',
    status: row.status,
    passwordHash: row.passwordHash,
    passwordUpdatedAt: row.passwordUpdatedAt?.toISOString() ?? null,
    mustChangePassword: row.mustChangePassword,
    createdByUserId: row.createdByUserId,
    // شمارنده‌ی تلاش، دیگر آرایه‌ی زمان نیست بلکه عدد + زمان قفل است.
    // برای سازگاری با تایپ قدیمی، آرایه‌ی خالی برگردانده می‌شود.
    failedLogins: [],
  }
}

/** مکان‌های تحت مدیریت یک کاربر. */
async function loadOwnedPlaces(
  userId: string,
): Promise<{ id: number; slug: string; name: string }[]> {
  const db = getDb()
  return db
    .select({ id: placeTable.id, slug: placeTable.slug, name: placeTable.name })
    .from(userPlaceRole)
    .innerJoin(placeTable, eq(placeTable.id, userPlaceRole.placeId))
    .where(and(eq(userPlaceRole.userId, userId), eq(userPlaceRole.status, 'active')))
    .orderBy(placeTable.name)
}

async function hydrate(row: UserRow | undefined): Promise<UserRecord | null> {
  if (!row) return null
  return toRecord(row, await loadOwnedPlaces(row.id))
}

// ═══════════════════════════════════════════════════════════════════════
// خواندن
// ═══════════════════════════════════════════════════════════════════════

export async function findUserById(id: string): Promise<UserRecord | null> {
  if (!id) return null
  const db = getDb()
  const [row] = await db.select().from(appUser).where(eq(appUser.id, id)).limit(1)
  return hydrate(row)
}

export async function findUserByPhone(phone: string): Promise<UserRecord | null> {
  if (!phone) return null
  const db = getDb()
  const [row] = await db.select().from(appUser).where(eq(appUser.phone, phone)).limit(1)
  return hydrate(row)
}

export async function findUserByUsername(username: string): Promise<UserRecord | null> {
  const trimmed = username.trim().toLowerCase()
  if (!trimmed) return null
  const db = getDb()
  const [row] = await db.select().from(appUser).where(eq(appUser.username, trimmed)).limit(1)
  return hydrate(row)
}

/**
 * ورود با «شناسه» — شماره یا یوزرنیم.
 *
 * کاربر نمی‌داند حسابش با شماره ساخته شده یا با یوزرنیمِ صادرشده از پنل
 * ادمین، و نباید هم بداند. یک فیلد ورودی، دو مسیرِ جست‌وجو.
 */
export async function findUserByLogin(identifier: string): Promise<UserRecord | null> {
  const raw = identifier.trim()
  if (!raw) return null
  // شکل شماره: فقط رقم و حداقل ۱۰ رقم. وگرنه یوزرنیم فرض می‌شود.
  const digits = raw.replace(/\D/g, '')
  if (digits.length >= 10) {
    const byPhone = await findUserByPhone(digits.startsWith('0') ? digits : `0${digits}`)
    if (byPhone) return byPhone
  }
  return findUserByUsername(raw)
}

export interface ListUsersOptions {
  role?: Role
  query?: string
  limit?: number
  offset?: number
}

export async function listUsers(options: ListUsersOptions = {}): Promise<UserRecord[]> {
  const { role, query, limit = 100, offset = 0 } = options
  const db = getDb()
  const conditions = []
  if (role) conditions.push(eq(appUser.role, role))
  if (query?.trim()) {
    const term = `%${query.trim()}%`
    conditions.push(
      or(
        sql`${appUser.name} LIKE ${term}`,
        sql`${appUser.phone} LIKE ${term}`,
        sql`${appUser.username} LIKE ${term}`,
      ),
    )
  }

  const rows = await db
    .select()
    .from(appUser)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(appUser.createdAt))
    .limit(limit)
    .offset(offset)

  // مکان‌ها به‌صورت دسته‌ای خوانده می‌شوند، نه یکی‌یکی: با ۱۰۰ کاربر،
  // حالت N+1 صد پرس‌وجوی اضافه می‌شد.
  const roleRows = await db
    .select({
      userId: userPlaceRole.userId,
      id: placeTable.id,
      slug: placeTable.slug,
      name: placeTable.name,
    })
    .from(userPlaceRole)
    .innerJoin(placeTable, eq(placeTable.id, userPlaceRole.placeId))
    .where(eq(userPlaceRole.status, 'active'))

  const byUser = new Map<string, { id: number; slug: string; name: string }[]>()
  for (const row of roleRows) {
    const list = byUser.get(row.userId)
    const entry = { id: row.id, slug: row.slug, name: row.name }
    if (list) list.push(entry)
    else byUser.set(row.userId, [entry])
  }

  return rows.map((row) => toRecord(row, byUser.get(row.id) ?? []))
}

export async function countUsers(): Promise<{ total: number; byRole: Record<string, number> }> {
  const db = getDb()
  const rows = await db
    .select({ role: appUser.role, n: sql<number>`COUNT(*)` })
    .from(appUser)
    .groupBy(appUser.role)
  const byRole: Record<string, number> = {}
  let total = 0
  for (const row of rows) {
    byRole[row.role] = Number(row.n)
    total += Number(row.n)
  }
  return { total, byRole }
}

// ═══════════════════════════════════════════════════════════════════════
// ساخت و تغییر
// ═══════════════════════════════════════════════════════════════════════

/**
 * کاربر را برمی‌گرداند و اگر نبود می‌سازد — مسیر ورود با پیامک.
 *
 * نقش از `ADMIN_PHONES` تعیین می‌شود؛ هیچ رمز یا حساب پیش‌فرضی در کد نیست.
 * **تنزل خودکار نمی‌دهیم**: برداشتن دسترسی باید کار آگاهانه‌ی یک آدم باشد،
 * نه اثر جانبی ویرایش یک فایل env.
 */
export async function findOrCreateUser(phone: string): Promise<UserRecord> {
  const db = getDb()
  const existing = await findUserByPhone(phone)
  const shouldBeAdmin = ADMIN_PHONES.includes(phone)

  if (existing) {
    const nextRole: Role = shouldBeAdmin && existing.role !== 'admin' ? 'admin' : existing.role
    await db
      .update(appUser)
      .set({ role: nextRole, lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null })
      .where(eq(appUser.id, existing.id))
    return (await findUserById(existing.id))!
  }

  const id = randomUUID()
  await db.insert(appUser).values({
    id,
    phone,
    role: shouldBeAdmin ? 'admin' : 'customer',
    lastLoginAt: new Date(),
  })
  return (await findUserById(id))!
}

export interface CreateUserInput {
  phone?: string | null
  username?: string | null
  name?: string
  email?: string | null
  role?: Role
  passwordHash?: string | null
  mustChangePassword?: boolean
  createdByUserId?: string | null
}

/**
 * ساخت حساب — مسیر ثبت‌نام با رمز، و مسیر اعتبارنامه‌ی صادرشده از پنل ادمین.
 *
 * حداقل یکی از `phone` یا `username` لازم است. اجباری‌کردن شماره یعنی ادمین
 * برای هر کافه یک شماره‌ی جعلی بسازد.
 */
export async function createUser(input: CreateUserInput): Promise<UserRecord> {
  const phone = input.phone?.trim() || null
  const username = input.username?.trim().toLowerCase() || null
  if (!phone && !username) {
    throw new Error('برای ساخت حساب، شماره یا یوزرنیم لازم است.')
  }

  const db = getDb()
  const id = randomUUID()
  await db.insert(appUser).values({
    id,
    phone,
    username,
    name: input.name?.trim() ?? '',
    email: input.email?.trim() || null,
    role: input.role ?? 'customer',
    passwordHash: input.passwordHash ?? null,
    passwordUpdatedAt: input.passwordHash ? new Date() : null,
    mustChangePassword: input.mustChangePassword ?? false,
    createdByUserId: input.createdByUserId ?? null,
  })
  return (await findUserById(id))!
}

export async function updateUser(
  id: string,
  patch: Partial<{
    name: string
    email: string | null
    phone: string | null
    role: Role
    status: 'active' | 'blocked'
    lastLat: string | null
    lastLng: string | null
  }>,
): Promise<UserRecord | null> {
  const db = getDb()
  await db.update(appUser).set(patch).where(eq(appUser.id, id))
  return findUserById(id)
}

export async function setUserRole(id: string, role: Role): Promise<UserRecord | null> {
  return updateUser(id, { role })
}

export async function setUserBlocked(id: string, blocked: boolean): Promise<UserRecord | null> {
  return updateUser(id, { status: blocked ? 'blocked' : 'active' })
}

/**
 * تنظیم اعتبارنامه — همان چیزی که ادمین برای پنل کافه یا پنل کاربر صادر می‌کند.
 *
 * `mustChangePassword` برای رمزِ موقت است: کاربر با آن وارد می‌شود ولی تا
 * عوض‌نکردنش جلوتر نمی‌رود. بدون این پرچم، رمزی که ادمین در واتساپ فرستاده
 * تا ابد معتبر می‌ماند.
 */
export async function setCredentials(
  id: string,
  credentials: {
    username?: string | null
    passwordHash?: string | null
    mustChangePassword?: boolean
  },
): Promise<UserRecord | null> {
  const db = getDb()
  const patch: Record<string, unknown> = {}

  if (credentials.username !== undefined) {
    patch.username = credentials.username?.trim().toLowerCase() || null
  }
  if (credentials.passwordHash !== undefined) {
    patch.passwordHash = credentials.passwordHash
    patch.passwordUpdatedAt = credentials.passwordHash ? new Date() : null
    // رمز تازه، قفلِ ورود را باز می‌کند: ادمین رمز را عوض کرده چون کاربر
    // نمی‌توانست وارد شود؛ ماندنِ قفل یعنی همان مشکل ادامه دارد.
    patch.failedLogins = 0
    patch.lockedUntil = null
  }
  if (credentials.mustChangePassword !== undefined) {
    patch.mustChangePassword = credentials.mustChangePassword
  }

  if (Object.keys(patch).length === 0) return findUserById(id)
  await db.update(appUser).set(patch).where(eq(appUser.id, id))
  return findUserById(id)
}

export async function isUsernameTaken(username: string, exceptUserId?: string): Promise<boolean> {
  const trimmed = username.trim().toLowerCase()
  if (!trimmed) return false
  const found = await findUserByUsername(trimmed)
  return !!found && found.id !== exceptUserId
}

// ═══════════════════════════════════════════════════════════════════════
// قفل ورود
// ═══════════════════════════════════════════════════════════════════════

export interface LockState {
  locked: boolean
  /** ثانیه تا باز شدن قفل. */
  retryAfterSec: number
}

export async function getLockState(id: string): Promise<LockState> {
  const db = getDb()
  const [row] = await db
    .select({ lockedUntil: appUser.lockedUntil })
    .from(appUser)
    .where(eq(appUser.id, id))
    .limit(1)

  if (!row?.lockedUntil) return { locked: false, retryAfterSec: 0 }
  const remainingMs = row.lockedUntil.getTime() - Date.now()
  if (remainingMs <= 0) return { locked: false, retryAfterSec: 0 }
  return { locked: true, retryAfterSec: Math.ceil(remainingMs / 1000) }
}

/**
 * یک تلاش ناموفق را ثبت می‌کند و در صورت رسیدن به سقف، قفل می‌کند.
 *
 * ═══ چرا یک دستور SQL ═══
 *
 * بخوان-بعد-بنویس در برابر هم‌زمانی امن نیست: دو درخواست می‌توانستند هر دو
 * شمارنده‌ی ۴ را بخوانند و هر دو ۵ بنویسند، یعنی یک تلاش گم می‌شد.
 *
 * ═══ دو تله‌ای که تست گرفت ═══
 *
 * **۱. ترتیب انتساب در MySQL معنا دارد.** در یک `UPDATE`، سمت راستِ هر
 * انتساب مقادیرِ **به‌روزشده‌ی** انتساب‌های قبلی را می‌بیند. نسخه‌ی اول
 * `failed_logins` را اول زیاد می‌کرد و بعد در `CASE` به آن نگاه می‌کرد، پس
 * شرط `failed_logins + 1 >= 5` در تلاش **چهارم** درست می‌شد و حساب یک تلاش
 * زودتر قفل می‌شد. حالا `locked_until` **اول** محاسبه می‌شود، وقتی شمارنده
 * هنوز مقدار قبلی را دارد.
 *
 * **۲. `NOW()` را نباید برای زمانی که اپ می‌خواندش به‌کار برد.** سرور MySQL
 * منطقه‌ی زمانی `+03:30` دارد ولی درایور تایم‌استمپ‌ها را UTC می‌خواند
 * (`timezone: 'Z'`). قفلِ ۱۵ دقیقه‌ای که با `DATE_ADD(NOW(), …)` نوشته شد،
 * موقع خواندن **۳ ساعت و ۴۵ دقیقه** به‌نظر می‌رسید (۱۳٬۵۰۰ ثانیه به‌جای
 * ۹۰۰). زمان در جاوااسکریپت حساب و به‌عنوان پارامتر فرستاده می‌شود.
 */
export async function recordFailedLogin(
  id: string,
  policy: LockoutPolicy = DEFAULT_LOCKOUT,
): Promise<LockState> {
  const db = getDb()
  const lockedUntil = new Date(Date.now() + policy.lockoutMinutes * 60 * 1000)

  await db.execute(sql`
    UPDATE app_user
    SET
      locked_until = CASE
        WHEN failed_logins + 1 >= ${policy.maxAttempts}
        THEN ${lockedUntil}
        ELSE locked_until
      END,
      failed_logins = failed_logins + 1
    WHERE id = ${id}
  `)
  return getLockState(id)
}

export async function clearFailedLogins(id: string): Promise<void> {
  const db = getDb()
  await db
    .update(appUser)
    .set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(appUser.id, id))
}

// ═══════════════════════════════════════════════════════════════════════
// نقش روی مکان
// ═══════════════════════════════════════════════════════════════════════

export async function grantPlaceRole(
  userId: string,
  placeId: number,
  options: { role?: 'owner' | 'manager' | 'staff'; grantedByUserId?: string } = {},
): Promise<void> {
  const db = getDb()
  await db
    .insert(userPlaceRole)
    .values({
      userId,
      placeId,
      role: options.role ?? 'owner',
      status: 'active',
      grantedByUserId: options.grantedByUserId ?? null,
    })
    .onDuplicateKeyUpdate({
      set: { status: 'active', role: options.role ?? 'owner' },
    })

  // کاربری که کافه می‌گیرد، نقشش هم بالا می‌رود — وگرنه پنل کافه برایش
  // بسته می‌ماند و ادمین فکر می‌کند انتساب انجام نشده.
  await db
    .update(appUser)
    .set({ role: 'owner' })
    .where(and(eq(appUser.id, userId), eq(appUser.role, 'customer')))
}

export async function revokePlaceRole(userId: string, placeId: number): Promise<void> {
  const db = getDb()
  await db
    .update(userPlaceRole)
    .set({ status: 'revoked' })
    .where(and(eq(userPlaceRole.userId, userId), eq(userPlaceRole.placeId, placeId)))
}

/** آیا این کاربر اجازه‌ی مدیریت این مکان را دارد؟ */
export async function canManagePlace(userId: string, placeId: number): Promise<boolean> {
  const db = getDb()
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(userPlaceRole)
    .where(
      and(
        eq(userPlaceRole.userId, userId),
        eq(userPlaceRole.placeId, placeId),
        eq(userPlaceRole.status, 'active'),
      ),
    )
  return Number(row?.n ?? 0) > 0
}

/** مالکان یک مکان — برای پنل ادمین. */
export async function listPlaceManagers(
  placeId: number,
): Promise<{ userId: string; name: string; username: string | null; phone: string | null; role: string }[]> {
  const db = getDb()
  return db
    .select({
      userId: appUser.id,
      name: appUser.name,
      username: appUser.username,
      phone: appUser.phone,
      role: userPlaceRole.role,
    })
    .from(userPlaceRole)
    .innerJoin(appUser, eq(appUser.id, userPlaceRole.userId))
    .where(and(eq(userPlaceRole.placeId, placeId), eq(userPlaceRole.status, 'active')))
}

// ═══════════════════════════════════════════════════════════════════════
// کد یک‌بارمصرف
// ═══════════════════════════════════════════════════════════════════════

export interface StoredOtp {
  id: number
  phone: string
  codeHash: string
  attempts: number
  expiresAt: Date
  createdAt: Date
}

/** آخرین کدِ مصرف‌نشده‌ی یک شماره. */
export async function getActiveOtp(phone: string): Promise<StoredOtp | null> {
  const db = getDb()
  const [row] = await db
    .select()
    .from(otpCode)
    .where(and(eq(otpCode.phone, phone), sql`${otpCode.consumedAt} IS NULL`))
    .orderBy(desc(otpCode.createdAt))
    .limit(1)
  if (!row) return null
  return {
    id: row.id,
    phone: row.phone,
    codeHash: row.codeHash,
    attempts: row.attempts,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  }
}

export async function saveOtp(input: {
  phone: string
  codeHash: string
  ttlSec: number
}): Promise<void> {
  const db = getDb()
  // کدهای قبلیِ همان شماره باطل می‌شوند: دو کد معتبر هم‌زمان یعنی پنجره‌ی
  // حمله دو برابر می‌شود.
  await db
    .update(otpCode)
    .set({ consumedAt: new Date() })
    .where(and(eq(otpCode.phone, input.phone), sql`${otpCode.consumedAt} IS NULL`))

  await db.insert(otpCode).values({
    phone: input.phone,
    codeHash: input.codeHash,
    purpose: 'login',
    expiresAt: new Date(Date.now() + input.ttlSec * 1000),
  })
}

export async function bumpOtpAttempts(id: number): Promise<void> {
  const db = getDb()
  await db
    .update(otpCode)
    .set({ attempts: sql`${otpCode.attempts} + 1` })
    .where(eq(otpCode.id, id))
}

export async function consumeOtp(id: number): Promise<void> {
  const db = getDb()
  await db.update(otpCode).set({ consumedAt: new Date() }).where(eq(otpCode.id, id))
}

/**
 * زمان درخواست‌های اخیر یک شماره.
 *
 * **زمان** برمی‌گرداند نه تعداد، چون منطق محدودیت نرخ در `otp.ts` (که تست
 * دارد) به زمان‌ها نیاز دارد: هم برای سقف ساعتی و هم برای فاصله‌ی ارسال
 * دوباره. برگرداندن تعداد، ما را مجبور می‌کرد آن منطق را دوباره بنویسیم.
 */
export async function listRecentOtpTimes(phone: string, windowSec: number): Promise<number[]> {
  const db = getDb()
  const since = new Date(Date.now() - windowSec * 1000)
  const rows = await db
    .select({ createdAt: otpCode.createdAt })
    .from(otpCode)
    .where(and(eq(otpCode.phone, phone), gt(otpCode.createdAt, since)))
    .orderBy(otpCode.createdAt)
  return rows.map((row) => row.createdAt.getTime())
}

/** زمان همه‌ی درخواست‌های اخیر — پایه‌ی سقف سراسری. */
export async function listRecentOtpTimesGlobal(windowSec: number): Promise<number[]> {
  const db = getDb()
  const since = new Date(Date.now() - windowSec * 1000)
  const rows = await db
    .select({ createdAt: otpCode.createdAt })
    .from(otpCode)
    .where(gt(otpCode.createdAt, since))
    .orderBy(otpCode.createdAt)
  return rows.map((row) => row.createdAt.getTime())
}

/** تعداد کدهای درخواست‌شده‌ی یک شماره در بازه‌ی اخیر — پایه‌ی محدودیت نرخ. */
export async function countRecentOtps(phone: string, windowSec: number): Promise<number> {
  const db = getDb()
  const since = new Date(Date.now() - windowSec * 1000)
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(otpCode)
    .where(and(eq(otpCode.phone, phone), gt(otpCode.createdAt, since)))
  return Number(row?.n ?? 0)
}

/**
 * تعداد کل کدهای اخیر — سقف سراسری.
 *
 * بدون این، یک اسکریپت با هزار شماره‌ی مختلف می‌تواند کل اعتبار پیامک را در
 * چند دقیقه بسوزاند؛ محدودیت per-phone جلویش را نمی‌گیرد.
 */
export async function countRecentOtpsGlobal(windowSec: number): Promise<number> {
  const db = getDb()
  const since = new Date(Date.now() - windowSec * 1000)
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(otpCode)
    .where(gt(otpCode.createdAt, since))
  return Number(row?.n ?? 0)
}

/** پاک‌سازی کدهای منقضی — از یک کار زمان‌بندی‌شده یا پنل ادمین. */
export async function purgeExpiredOtps(): Promise<number> {
  const db = getDb()
  const result = await db
    .delete(otpCode)
    .where(and(lt(otpCode.expiresAt, new Date()), isNotNull(otpCode.expiresAt)))
  return (result as unknown as { affectedRows?: number }).affectedRows ?? 0
}
