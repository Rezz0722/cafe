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
  createAuthSession,
  createUser,
  findOrCreateUser,
  findUserById,
  findUserByLogin,
  findUserByPhone,
  findUserByUsername,
  getActiveOtp,
  getLockState,
  getPlaceRole,
  grantPlaceRole,
  canManagePlace,
  isUsernameTaken,
  listRecentOtpTimes,
  isAuthSessionActive,
  markPhoneVerified,
  recordFailedLogin,
  revokeAllSessions,
  revokeSession,
  revokePlaceRole,
  saveOtp,
  setCredentials,
  setUserBlocked,
} from '../src/core/auth/userRepo'
import { closeDb, getDb } from '../src/db/connection'
import { appUser, authSession, otpCode, place as placeTable, userPlaceRole } from '../src/db/schema'
import { eq, like, or } from 'drizzle-orm'

const TEST_PHONE = '09990001122'
const TEST_OTP_PHONE = '09990001123'
const TEST_USERNAME = '__smoke_cafe__'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function cleanup() {
  const db = getDb()
  await db.delete(otpCode).where(eq(otpCode.phone, TEST_PHONE))
  await db.delete(otpCode).where(eq(otpCode.phone, TEST_OTP_PHONE))
  await db
    .delete(appUser)
    .where(or(eq(appUser.phone, TEST_PHONE), eq(appUser.phone, TEST_OTP_PHONE), like(appUser.username, '__smoke%')))
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
  check('ورود با شمارهٔ بین‌المللی پیدا می‌شود', (await findUserByLogin('+989990001122'))?.id === user.id)
  check('ورود با یوزرنیم پیدا می‌شود', byUsername?.id === user.id)
  check('یوزرنیم با حروف بزرگ هم پیدا می‌شود', (await findUserByLogin(TEST_USERNAME.toUpperCase()))?.id === user.id)

  check('رمز درست تأیید می‌شود', verifyPassword(password, user.passwordHash))
  check('رمز غلط رد می‌شود', !verifyPassword('wrong-password', user.passwordHash))
  check('رمز خالی رد می‌شود', !verifyPassword('', user.passwordHash))

  await markPhoneVerified(user.id)
  check('تأیید شماره ثبت می‌شود', !!(await findUserById(user.id))?.phoneVerifiedAt)

  // ═══ ورود/ثبت‌نام یکپارچه با پیامک ═══
  const otpUser = await findOrCreateUser(TEST_OTP_PHONE)
  check('شمارهٔ تازه بعد از تأیید می‌تواند حساب بسازد', otpUser.phone === TEST_OTP_PHONE && otpUser.role === 'customer')
  check('حساب پیامکی بدون رمز ساخته می‌شود', otpUser.passwordHash === null)
  await markPhoneVerified(otpUser.id)
  check('شمارهٔ حساب پیامکی تأییدشده ثبت می‌شود', !!(await findUserById(otpUser.id))?.phoneVerifiedAt)
  const sameOtpUser = await findOrCreateUser(TEST_OTP_PHONE)
  check('ورود دوباره حساب تکراری نمی‌سازد', sameOtpUser.id === otpUser.id)

  // ═══ نشست قابل ابطال ═══
  const firstSession = await createAuthSession({
    userId: user.id,
    method: 'password',
    expiresAt: new Date(Date.now() + 60_000),
  })
  check('نشست تازه معتبر است', await isAuthSessionActive(firstSession, user.id))
  check('نشست به کاربر دیگری قابل نسبت‌دادن نیست', !(await isAuthSessionActive(firstSession, 'wrong-user')))
  await revokeSession(firstSession, user.id)
  check('خروج، همان نشست را فوراً باطل می‌کند', !(await isAuthSessionActive(firstSession, user.id)))

  const keptSession = await createAuthSession({ userId: user.id, method: 'password', expiresAt: new Date(Date.now() + 60_000) })
  const otherSession = await createAuthSession({ userId: user.id, method: 'password', expiresAt: new Date(Date.now() + 60_000) })
  await revokeAllSessions(user.id, keptSession)
  check('تغییر رمز نشست جاری را نگه می‌دارد', await isAuthSessionActive(keptSession, user.id))
  check('تغییر رمز دستگاه دیگر را خارج می‌کند', !(await isAuthSessionActive(otherSession, user.id)))

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
  const places = await db
    .select({ id: placeTable.id, slug: placeTable.slug, name: placeTable.name })
    .from(placeTable)
    .limit(2)
  const somePlace = places[0]

  if (somePlace) {
    check('قبل از انتساب، اجازه‌ی مدیریت ندارد', !(await canManagePlace(user.id, somePlace.id)))
    await grantPlaceRole(user.id, somePlace.id, { role: 'owner' })
    check('بعد از انتساب، اجازه دارد', await canManagePlace(user.id, somePlace.id))
    check('نقش دقیق شعبه ثبت شده', (await getPlaceRole(user.id, somePlace.id)) === 'owner')
    if (places[1]) {
      check('تغییر شناسه، دسترسی به شعبهٔ دیگر نمی‌دهد', !(await canManagePlace(user.id, places[1].id)))
      check('در شعبهٔ دیگر هیچ نقشی ندارد', (await getPlaceRole(user.id, places[1].id)) === null)
    }

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
  await saveOtp({ phone: TEST_PHONE, codeHash: hashCode(TEST_PHONE, code), ttlSec: 120, purpose: 'verify_phone' })
  const active = await getActiveOtp(TEST_PHONE, 'verify_phone')
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
  const resetCode = generateCode()
  await saveOtp({ phone: TEST_PHONE, codeHash: hashCode(TEST_PHONE, resetCode), ttlSec: 120, purpose: 'reset_password' })
  check('کد بازیابی از کد ثبت‌نام جداست', (await getActiveOtp(TEST_PHONE, 'reset_password'))?.codeHash === hashCode(TEST_PHONE, resetCode))
  check('ساخت کد بازیابی، کد ثبت‌نام را نمی‌سوزاند', (await getActiveOtp(TEST_PHONE, 'verify_phone'))?.id === active?.id)

  await saveOtp({ phone: TEST_PHONE, codeHash: hashCode(TEST_PHONE, secondCode), ttlSec: 120, purpose: 'verify_phone' })
  const secondActive = await getActiveOtp(TEST_PHONE, 'verify_phone')
  check(
    'کد جدید، کد قبلی را باطل می‌کند',
    secondActive?.id !== active?.id && secondActive?.codeHash === hashCode(TEST_PHONE, secondCode),
    'دو کد معتبر هم‌زمان، پنجره‌ی حمله را دو برابر می‌کند',
  )

  await consumeOtp(secondActive!.id)
  check('کد مصرف‌شده دیگر فعال نیست', (await getActiveOtp(TEST_PHONE, 'verify_phone')) === null)
  check('مصرف کد ثبت‌نام، کد بازیابی را مصرف نمی‌کند', !!(await getActiveOtp(TEST_PHONE, 'reset_password')))

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
void authSession
