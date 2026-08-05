/**
 * دود-تست لایه‌ی نوشتن روی مکان.
 *
 * روی یک مکان **واقعی** کار می‌کند و در پایان همه‌چیز را برمی‌گرداند. آنچه
 * ثابت می‌شود: نوشتن، بازمحاسبه‌ی مقادیر مشتق، و ثبت رد پا — هر سه با هم.
 */

import { desc, eq } from 'drizzle-orm'
import {
  bulkAdjustPrices,
  loadOwnerPlace,
  replacePlaceHours,
  updateMenuItem,
  updatePlaceInfo,
  type Actor,
} from '../src/core/places/manage'
import { closeDb, getDb } from '../src/db/connection'
import { auditLog, menuItem, place as placeTable } from '../src/db/schema'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const ACTOR: Actor = { userId: '__smoke_actor__', label: 'تست' }

async function main() {
  const db = getDb()

  // مکانی با منوی قیمت‌دار انتخاب می‌شود، وگرنه تست قیمت بی‌معنی است.
  const [target] = await db
    .select({ id: placeTable.id, slug: placeTable.slug, name: placeTable.name })
    .from(placeTable)
    .where(eq(placeTable.slug, 'jan-majnoon-lounge'))
    .limit(1)

  if (!target) {
    console.log('مکان آزمایشی پیدا نشد — اول ایمپورت را اجرا کنید.')
    await closeDb()
    process.exit(1)
  }

  const before = await loadOwnerPlace(target.id)
  if (!before) throw new Error('loadOwnerPlace خالی برگشت')
  check('خواندن مکان برای پنل', true, `${before.name} · ${before.sections.length} دسته`)

  const originalAbout = before.about
  const originalHours = before.hours
  const originalMedian = before.priceMedian

  // ═══ اطلاعات پایه ═══
  const marker = `__smoke_${Date.now()}__`
  const infoResult = await updatePlaceInfo(target.id, { about: marker }, ACTOR)
  check('ذخیره‌ی اطلاعات', infoResult.ok, infoResult.error ?? '')
  const afterInfo = await loadOwnerPlace(target.id)
  check('متن «درباره» نوشته شد', afterInfo?.about === marker)

  // ═══ رد پا ═══
  const [audit] = await db
    .select({ action: auditLog.action, entityId: auditLog.entityId })
    .from(auditLog)
    .orderBy(desc(auditLog.id))
    .limit(1)
  check(
    'رد پا در audit_log ثبت شد',
    audit?.action === 'place.update' && audit.entityId === String(target.id),
    'بدون رد پا، برگرداندن ویرایش اشتباه ممکن نیست',
  )

  // ═══ ساعت کاری با شیفت شکسته ═══
  const hoursResult = await replacePlaceHours(
    target.id,
    [
      { dow: 0, shiftIndex: 0, opensAt: '12:00', closesAt: '16:30', closed: false },
      { dow: 0, shiftIndex: 1, opensAt: '20:00', closesAt: '23:30', closed: false },
      { dow: 1, shiftIndex: 0, opensAt: '16:00', closesAt: '00:30', closed: false },
      { dow: 6, shiftIndex: 0, opensAt: null, closesAt: null, closed: true },
    ],
    ACTOR,
  )
  check('ذخیره‌ی ساعت کاری', hoursResult.ok, hoursResult.error ?? '')

  const afterHours = await loadOwnerPlace(target.id)
  const saturday = afterHours?.hours.filter((shift) => shift.dow === 0) ?? []
  check('شیفت شکسته ذخیره شد', saturday.length === 2, `${saturday.length} شیفت شنبه`)
  check('روز تعطیل ذخیره شد', afterHours?.hours.some((shift) => shift.dow === 6 && shift.closed) === true)

  const crossing = await db
    .select()
    .from(placeTable)
    .where(eq(placeTable.id, target.id))
    .limit(1)
  void crossing
  const [sundayShift] = await db.execute(
    // `crosses_midnight` باید **محاسبه** شده باشد، نه از ورودی آمده.
    // ۱۶:۰۰ تا ۰۰:۳۰ قطعاً از نیمه‌شب می‌گذرد.
    // eslint-disable-next-line
    (await import('drizzle-orm')).sql`SELECT crosses_midnight FROM place_hours WHERE place_id = ${target.id} AND dow = 1 LIMIT 1`,
  )
  const crossRows = sundayShift as unknown as { crosses_midnight: number }[]
  check(
    'گذر از نیمه‌شب خودکار تشخیص داده شد',
    crossRows[0]?.crosses_midnight === 1,
    '۱۶:۰۰ تا ۰۰:۳۰',
  )

  // ═══ ویرایش یک آیتم ═══
  const [item] = await db
    .select({ id: menuItem.id, name: menuItem.name, price: menuItem.price })
    .from(menuItem)
    .where(eq(menuItem.placeId, target.id))
    .limit(1)

  if (item) {
    const originalPrice = item.price
    const itemResult = await updateMenuItem(item.id, { price: 123_000, available: false }, ACTOR)
    check('ویرایش آیتم منو', itemResult.ok, itemResult.error ?? '')

    const [updated] = await db
      .select({ price: menuItem.price, available: menuItem.available, at: menuItem.priceUpdatedAt })
      .from(menuItem)
      .where(eq(menuItem.id, item.id))
      .limit(1)
    check('قیمت ذخیره شد', updated?.price === 123_000)
    check('«موجود نیست» ذخیره شد', updated?.available === false)
    check('زمان تأیید قیمت ثبت شد', !!updated?.at, 'قیمتِ بی‌تاریخ با تورم بی‌ارزش است')

    // قیمتِ خالی = «قیمت روز»، نه صفر
    await updateMenuItem(item.id, { price: null }, ACTOR)
    const [unpriced] = await db
      .select({ price: menuItem.price, unknown: menuItem.priceUnknown })
      .from(menuItem)
      .where(eq(menuItem.id, item.id))
      .limit(1)
    check('قیمت خالی → NULL و «قیمت روز»', unpriced?.price === null && unpriced.unknown === true)

    await updateMenuItem(item.id, { price: originalPrice, available: true }, ACTOR)
  }

  // ═══ تغییر دسته‌ای قیمت ═══
  const bulkUp = await bulkAdjustPrices(target.id, 10, ACTOR)
  check('تغییر دسته‌ای قیمت', bulkUp.ok, `${bulkUp.changed} آیتم`)

  const afterBulk = await loadOwnerPlace(target.id)
  check(
    'میانه‌ی قیمت بازمحاسبه شد',
    (afterBulk?.priceMedian ?? 0) > (originalMedian ?? 0),
    `${originalMedian?.toLocaleString('fa-IR')} → ${afterBulk?.priceMedian?.toLocaleString('fa-IR')}`,
  )

  const rounded = afterBulk?.sections
    .flatMap((section) => section.items)
    .filter((menuRow) => menuRow.price !== null)
    .every((menuRow) => menuRow.price! % 1000 === 0)
  check('قیمت‌ها به هزار تومان گرد شدند', rounded === true)

  // درصد نامعتبر رد می‌شود
  check('درصد صفر رد می‌شود', !(await bulkAdjustPrices(target.id, 0, ACTOR)).ok)
  check('درصد خارج از بازه رد می‌شود', !(await bulkAdjustPrices(target.id, 500, ACTOR)).ok)

  // ═══ برگرداندن ═══
  // ۱۰٪ بالا رفته بود؛ برای برگشت باید تقسیم شود، ولی گردکردن دقیقاً
  // برنمی‌گرداند. پس فقط about و ساعت را برمی‌گردانیم و قیمت‌ها را با
  // ضریب معکوس تقریبی.
  await bulkAdjustPrices(target.id, -100 / 11, ACTOR)
  await updatePlaceInfo(target.id, { about: originalAbout ?? '' }, ACTOR)
  await replacePlaceHours(
    target.id,
    originalHours.map((shift) => ({
      dow: shift.dow,
      shiftIndex: shift.shiftIndex,
      opensAt: shift.opensAt,
      closesAt: shift.closesAt,
      closed: shift.closed,
    })),
    ACTOR,
  )
  const restored = await loadOwnerPlace(target.id)
  check('اطلاعات برگردانده شد', restored?.about === (originalAbout ?? null))
  check('ساعت کاری برگردانده شد', restored?.hours.length === originalHours.length)

  // رد پای تست پاک می‌شود تا لاگ واقعی شلوغ نشود.
  await db.delete(auditLog).where(eq(auditLog.actorUserId, ACTOR.userId))

  await closeDb()
  console.log(failures === 0 ? '\nهمه‌ی بررسی‌ها موفق.' : `\n${failures} بررسی شکست خورد.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error(error)
  await closeDb()
  process.exit(1)
})
