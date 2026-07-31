'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { updateUserAction } from '@/app/admin/actions'
import { EMPTY_ADMIN_STATE, ROLE_OPTIONS } from '@/app/admin/state'
import { ROLE_LABELS, type Role } from '@/core/auth/types'
import { fa, relativeFa } from '@/lib/format'
import { paths } from '@/routes'
import styles from './UsersTable.module.css'

/** یک مالکیت. `name === null` یعنی این slug دیگر در کاتالوگ نیست. */
export interface OwnedPlace {
  slug: string
  name: string | null
}

/**
 * آنچه یک ردیف جدول لازم دارد.
 *
 * کل `AppUser` رد نمی‌شود: این کامپوننت کلاینت است و هر فیلد اضافه‌ای —
 * امروز `blocked`، فردا هرچه — بی‌دلیل در payload صفحه سریالایز می‌شد.
 */
export interface AdminUserRow {
  id: string
  phone: string
  name: string
  role: Role
  createdAt: string
  lastLoginAt: string | null
  owned: OwnedPlace[]
  /** خودِ ادمینِ واردشده — تغییر نقشش قفل است. */
  isSelf: boolean
}

export function UsersTable({ users }: { users: AdminUserRow[] }) {
  if (users.length === 0) {
    return (
      <p className={styles.empty}>
        هنوز هیچ‌کس وارد نشده. اولین ورود با شماره‌ای که در <code>ADMIN_PHONES</code> باشد،
        حساب ادمین را می‌سازد.
      </p>
    )
  }

  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>کاربر</th>
            <th>عضویت</th>
            <th>آخرین ورود</th>
            <th>نقش و مالکیت</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <UserRow key={user.id} user={user} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * یک ردیف = یک فرم.
 *
 * هر سه کنترل (نقش، اعطا، سلب) در همان یک `<form>` داخل آخرین `<td>` هستند.
 * این محدودیت خودِ HTML است: `<form>` نمی‌تواند چند `<td>` را در بر بگیرد،
 * چون مرورگر تگ form را از داخل `<tr>` بیرون می‌اندازد و فرم عملاً خالی
 * می‌شود. پس همه‌ی کنترل‌ها یک‌جا می‌مانند.
 *
 * «کدام دکمه زده شد» از name/value خودِ دکمه خوانده می‌شود — مرورگر فقط
 * submitter را می‌فرستد، پس دکمه‌ی «سلب» می‌تواند slug خودش را با خودش ببرد.
 */
function UserRow({ user }: { user: AdminUserRow }) {
  const [state, formAction] = useActionState(updateUserAction, EMPTY_ADMIN_STATE)

  return (
    <tr>
      <td>
        <div className={styles.name}>
          {user.name || <span className={styles.noName}>بدون نام</span>}
          {user.isSelf && <span className={styles.selfBadge}>شما</span>}
        </div>
        <div className={styles.phone} dir="ltr">
          {fa(user.phone)}
        </div>
        <div className={styles.roleBadge}>{ROLE_LABELS[user.role]}</div>
      </td>

      <td className={styles.dim}>{relativeFa(user.createdAt)}</td>
      <td className={styles.dim}>{user.lastLoginAt ? relativeFa(user.lastLoginAt) : '—'}</td>

      <td>
        <form action={formAction} className={styles.form}>
          <input type="hidden" name="userId" value={user.id} />

          <div className={styles.controlRow}>
            <select
              name="role"
              defaultValue={user.role}
              disabled={user.isSelf}
              className={styles.select}
              aria-label={`نقش ${user.name || user.phone}`}
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            {user.isSelf ? (
              <span className={styles.lockNote}>نقش خودتان قفل است</span>
            ) : (
              <RowButton name="intent" value="role">
                ثبت نقش
              </RowButton>
            )}
          </div>

          {user.owned.length > 0 && (
            <ul className={styles.ownedList}>
              {user.owned.map((place) => (
                <li key={place.slug} className={styles.ownedItem}>
                  {place.name ? (
                    <Link href={paths.cafe(place.slug)} target="_blank">
                      {place.name}
                    </Link>
                  ) : (
                    /* مالکیت یتیم — کافه حذف شده یا slugش عوض شده. */
                    <span className={styles.orphan} dir="ltr" title="در کاتالوگ نیست">
                      {place.slug}
                    </span>
                  )}
                  <RowButton name="revoke" value={place.slug} ghost>
                    سلب
                  </RowButton>
                </li>
              ))}
            </ul>
          )}

          <div className={styles.controlRow}>
            <input
              name="slug"
              className={styles.slugInput}
              dir="ltr"
              placeholder="cafe-slug"
              aria-label={`دادن مالکیت کافه به ${user.name || user.phone}`}
            />
            <RowButton name="intent" value="grant">
              افزودن کافه
            </RowButton>
          </div>

          {state.error && <p className={styles.rowError}>{state.error}</p>}
          {state.ok && state.message && <p className={styles.rowOk}>{state.message}</p>}
        </form>
      </td>
    </tr>
  )
}

function RowButton({
  name,
  value,
  ghost,
  children,
}: {
  name: string
  value: string
  ghost?: boolean
  children: string
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={ghost ? styles.ghostButton : styles.rowButton}
    >
      {children}
    </button>
  )
}
