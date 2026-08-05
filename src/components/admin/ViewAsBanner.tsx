import { stopViewAsAction } from '@/app/actions/viewAs'
import { ROLE_LABELS, type Role } from '@/core/auth/types'
import { maskPhone } from '@/core/auth/phone'
import styles from './ViewAsBanner.module.css'

/**
 * نوار «شما در حال مشاهده‌ی پنل کسی دیگر هستید».
 *
 * در layout ریشه می‌نشیند، نه در پنل ادمین — چون همان‌جایی باید دیده شود که
 * ادمین *نیست*: پروفایل کاربر، پنل مالک. بدون این نوار، ادمین یادش می‌رود
 * که نشستش عاریتی است و بعد تعجب می‌کند که چرا `/admin` بسته است.
 *
 * server component است، پس دکمه‌ی خروج یک `<form>` ساده روی server action
 * است — بدون جاوااسکریپت سمت کلاینت هم کار می‌کند.
 */
export function ViewAsBanner({
  targetName,
  targetPhone,
  targetRole,
  actorName,
}: {
  targetName: string
  targetPhone: string
  targetRole: Role
  actorName: string
}) {
  return (
    <div className={styles.banner} role="status">
      <div className={styles.body}>
        <span className={styles.badge}>مشاهده به‌عنوان</span>
        <span className={styles.who}>
          <b>{targetName || 'کاربر بی‌نام'}</b>
          <span className={styles.dim} dir="ltr">
            {maskPhone(targetPhone)}
          </span>
          <span className={styles.dim}>{ROLE_LABELS[targetRole]}</span>
        </span>
        {/* فقط‌خواندنی است؛ گفتنش اینجا ارزانتر از دیدن خطای اکشن است. */}
        <span className={styles.note}>فقط‌خواندنی — نشست شما ({actorName}) دست‌نخورده است</span>
      </div>

      <form action={stopViewAsAction}>
        <button type="submit" className={styles.exit}>
          بازگشت به پنل ادمین
        </button>
      </form>
    </div>
  )
}
