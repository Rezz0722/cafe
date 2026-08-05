/**
 * دود-تست احراز هویت روی MySQL.
 *
 * هر بررسی یک قاعده‌ی امنیتی یا یک مسیر ورود را ثابت می‌کند. اکشن‌های
 * Next (که به کوکی و `revalidatePath` نیاز دارند) اینجا اجرا نمی‌شوند؛
 * چیزی که تست می‌شود **مخزن و منطق** است، یعنی همان‌جایی که باگ‌های امنیتی
 * می‌نشینند.
 */

import { hashPassword, verifyPassword, LOGIN_MAX_ATTEMPTS } from '../src/core/auth/password'
import { generateCode, hashCode, verifyCode, type OtpRecord } from '../src/core/auth/otp'
import {
  clearFailedLogins,
  consumeOtp,
  createUser,
  findUserById,
  findUserByLogin,
  findUserByPhone,
  findUserByUsername,
  getActiveOtp,
  getLockState,
  grantPlaceRole,
  canManagePlace,
  isUsernameTaken,
  listRecentOtpTimes,
  recordFailedLogin,
  revokePlaceRole,
  saveOtp,
  setCredentials,
  setUserBlocked,
} from '../src/core/auth/userRepo'
import { closeDb, getDb } from '../src/db/connection'
import { appUser, otpCode, place as placeTable, userPlaceRole } from '../src/db/schema'
import { eq, like, or } from 'drizzle-orm'

const TEST_PHONE = '09990001122'
const TEST_USERNAME = '__smoke_cafe__'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function cleanup() {
  const db = getDb()
  await db.delete(otpCode).where(eq(otpCode.phone, TEST_PHONE))
  await db
    .delete(appUser)
    .where(or(eq(appUser.phone, TEST_PHONE), like(appUser.username, '__smoke%')))
}

async function main() {
  const db = getDb()
  await cleanup()

  // ═══ ثبت‌نام با رمز ═══
  const password = 'Correct-Horse-9'
  const user = await createUser({
    phone: TEST_PHONE,
    username: TEST_USERNAME,
    name: 'کاربر آزمایشی',
    passwordHash: hashPassword(password),
    role: 'customer',
  })
  check('ساخت حساب با رمز', !!user.id && user.passwordHash !== null)
  check('یوزرنیم کوچک ذخیره شد', user.username === TEST_USERNAME)

  // ═══ ورود با هر دو شکل شناسه ═══
  const byPhone = await findUserByLogin(TEST_PHONE)
  const byUsername = await findUserByLogin(TEST_USERNAME)
  check('ورود با شماره پیدا می‌شود', byPhone?.id === user.id)
  check('ورود با یوزرنیم پیدا می‌شود', byUsername?.id === user.id)
  check('یوزرنیم با حروف بزرگ هم پیدا می‌شود', (await findUserByLogin(TEST_USERNAME.toUpperCase()))?.id === user.id)

  check('رمز درست تأیید می‌شود', verifyPassword(password, user.passwordHash))
  check('رمز غلط رد می‌شود', !verifyPassword('wrong-password', user.passwordHash))
  check('رمز خالی رد می‌شود', !verifyPassword('', user.passwordHash))

  // ═══ قفل ورود ═══
  let lock = await getLockState(user.id)
  check('حساب تازه قفل نیست', !lock.locked)

  for (let attempt = 1; attempt < LOGIN_MAX_ATTEMPTS; attempt++) {
    lock = await recordFailedLogin(user.id)
  }
  check(`بعد از ${LOGIN_MAX_ATTEMPTS - 1} تلاش هنوز باز است`, !lock.locked)

  lock = await recordFailedLogin(user.id)
  check(`با تلاش ${LOGIN_MAX_ATTEMPTS}ام قفل می‌شود`, lock.locked, `${lock.retryAfterSec} ثانیه`)

  await clearFailedLogins(user.id)
  check('پاک‌کردن تلاش‌ها قفل را باز می‌کند', !(await getLockState(user.id)).locked)

  // ═══ رمز تازه، قفل را باز می‌کند ═══
  await recordFailedLogin(user.id)
  await recordFailedLogin(user.id)
  await recordFailedLogin(user.id)
  await recordFailedLogin(user.id)
  await recordFailedLogin(user.id)
  check('قفل شد (برای بررسی بعدی)', (await getLockState(user.id)).locked)
  await setCredentials(user.id, { passwordHash: hashPassword('Brand-New-Pass-1'), mustChangePassword: true })
  check(
    'رمز تازه‌ی ادمین قفل را باز می‌کند',
    !(await getLockState(user.id)).locked,
    'وگرنه همان مشکلی که ادمین می‌خواست حل کند باقی می‌ماند',
  )
  const withTemp = await findUserById(user.id)
  check('پرچم «رمز باید عوض شود» ثبت شد', withTemp?.mustChangePassword === true)
  check('رمز جدید کار می‌کند', verifyPassword('Brand-New-Pass-1', withTemp!.passwordHash))
  check('رمز قدیمی دیگر کار نمی‌کند', !verifyPassword(password, withTemp!.passwordHash))

  // ═══ یوزرنیم تکراری ═══
  check('یوزرنیم گرفته‌شده تشخیص داده می‌شود', await isUsernameTaken(TEST_USERNAME))
  check('یوزرنیم خودِ کاربر تکراری حساب نمی‌شود', !(await isUsernameTaken(TEST_USERNAME, user.id)))
  check('یوزرنیم آزاد، آزاد است', !(await isUsernameTaken('__smoke_free__')))

  // ═══ مسدودسازی ═══
  await setUserBlocked(user.id, true)
  check('حساب مسدود شد', (await findUserById(user.id))?.blocked === true)
  await setUserBlocked(user.id, false)
  check('رفع مسدودی', (await findUserById(user.id))?.blocked === false)

  // ═══ نقش روی مکان ═══
  const [somePlace] = await db
    .select({ id: placeTable.id, slug: placeTable.slug, name: placeTable.name })
    .from(placeTable)
    .limit(1)

  if (somePlace) {
    check('قبل از انتساب، اجازه‌ی مدیریت ندارد', !(await canManagePlace(user.id, somePlace.id)))
    await grantPlaceRole(user.id, somePlace.id, { role: 'owner' })
    check('بعد از انتساب، اجازه دارد', await canManagePlace(user.id, somePlace.id))

    const owner = await findUserById(user.id)
    check('نقش به owner ارتقا یافت', owner?.role === 'owner', 'وگرنه پنل کافه بسته می‌ماند')
    check('کافه در فهرست کاربر آمد', owner?.ownedPlaces.some((p) => p.id === somePlace.id) === true)
    check('slug کافه هم هست', owner?.ownedPlaceSlugs.includes(somePlace.slug) === true)

    await revokePlaceRole(user.id, somePlace.id)
    check('لغو انتساب اجازه را می‌گیرد', !(await canManagePlace(user.id, somePlace.id)))
  } else {
    console.log('· هیچ مکانی در دیتابیس نیست — بررسی نقش روی مکان رد شد')
  }

  // ═══ کد یک‌بارمصرف ═══
  const code = generateCode()
  await saveOtp({ phone: TEST_PHONE, codeHash: hashCode(TEST_PHONE, code), ttlSec: 120 })
  const active = await getActiveOtp(TEST_PHONE)
  check('کد ذخیره شد', !!active)
  check('کد خام ذخیره نشده (فقط هش)', active?.codeHash !== code)

  const asRecord = (row: NonNullable<typeof active>): OtpRecord => ({
    phone: TEST_PHONE,
    codeHash: row.codeHash,
    expiresAt: row.expiresAt.getTime(),
    attempts: row.attempts,
    createdAt: row.createdAt.getTime(),
    recentRequests: [],
  })

  check('کد درست تأیید می‌شود', verifyCode(asRecord(active!), TEST_PHONE, code).ok)
  check('کد غلط رد می‌شود', !verifyCode(asRecord(active!), TEST_PHONE, '00000').ok)
  check(
    'کد یک شماره برای شماره‌ی دیگر کار نمی‌کند',
    !verifyCode(asRecord(active!), '09990009999', code).ok,
    'شماره داخل هش است',
  )

  // ذخیره‌ی کد دوم، اولی را باطل می‌کند
  const secondCode = generateCode()
  await saveOtp({ phone: TEST_PHONE, codeHash: hashCode(TEST_PHONE, secondCode), ttlSec: 120 })
  const secondActive = await getActiveOtp(TEST_PHONE)
  check(
    'کد جدید، کد قبلی را باطل می‌کند',
    secondActive?.id !== active?.id && secondActive?.codeHash === hashCode(TEST_PHONE, secondCode),
    'دو کد معتبر هم‌زمان، پنجره‌ی حمله را دو برابر می‌کند',
  )

  await consumeOtp(secondActive!.id)
  check('کد مصرف‌شده دیگر فعال نیست', (await getActiveOtp(TEST_PHONE)) === null)

  const times = await listRecentOtpTimes(TEST_PHONE, 3600)
  check('زمان درخواست‌های اخیر ثبت شده', times.length >= 2, `${times.length} درخواست`)

  await cleanup()
  const gone = await findUserByPhone(TEST_PHONE)
  check('پاک‌سازی انجام شد', gone === null)

  await closeDb()
  console.log(failures === 0 ? '\nهمه‌ی بررسی‌ها موفق.' : `\n${failures} بررسی شکست خورد.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error(error)
  await cleanup().catch(() => {})
  await closeDb()
  process.exit(1)
})

// جلوگیری از حذف ایمپورت‌های استفاده‌شده در شرط‌های بالا
void findUserByUsername
void userPlaceRole
