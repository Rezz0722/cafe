'use client'

/**
 * تب عملیات — کارهای نگه‌داری که تا امروز فقط با اجرای دستیِ اسکریپت
 * انجام می‌شدند.
 *
 * ═══ قاعده‌ی ورود به این تب ═══
 *
 * هر عملیاتی که اینجا دکمه دارد باید **idempotent** باشد: دو بار زدنش نباید
 * چیزی را خراب کند. عملیاتی که این شرط را ندارد (مثل ایمپورت کامل، که همه‌ی
 * مکان‌ها را پاک و از نو می‌سازد) عمداً اینجا نیست و فرمانِ ترمینالش نوشته
 * شده — یک دکمه که با یک کلیک اضافی داده را می‌برد، بدترین نوع «امکانات
 * پنل» است.
 */

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { runOperationAction } from '@/app/admin/actions'
import { EMPTY_ADMIN_STATE } from '@/app/admin/state'
import styles from './OperationsPanel.module.css'

interface Operation {
  id: string
  title: string
  description: string
  /** برچسب دکمه — فعلی، نه اسمی. */
  action: string
  heavy?: boolean
}

const OPERATIONS: Operation[] = [
  {
    id: 'rollup',
    title: 'بازمحاسبه‌ی آمار روزانه',
    description:
      'اعداد امروز و دیروز را از جدول خامِ بازدید در `daily_stat` می‌نویسد. نمودار بازدید از همین جدول می‌آید، پس اگر عددها عقب افتاده‌اند این را بزنید.',
    action: 'بازمحاسبه',
  },
  {
    id: 'purge_views',
    title: 'پاک‌سازی بازدیدهای قدیمی',
    description:
      'ردیف‌های خامِ قدیمی‌تر از «نگه‌داشتن بازدید خام» (در تب تنظیمات، گروه آمار) را حذف می‌کند. آمارِ فشرده‌ی روزانه دست‌نخورده می‌ماند.',
    action: 'پاک‌سازی',
    heavy: true,
  },
  {
    id: 'recompute_derived',
    title: 'بازمحاسبه‌ی مقادیر مشتق',
    description:
      'رده‌ی قیمت، کمینه/میانه/بیشینه‌ی قیمت و امتیاز کیفیتِ همه‌ی مجموعه‌ها را از نو می‌سازد. بعد از عوض‌کردن مرزهای رده‌ی قیمت **لازم** است، وگرنه فیلتر «اقتصادی» با مرز تازه نمی‌خواند.',
    action: 'بازمحاسبه',
    heavy: true,
  },
  {
    id: 'recalc_ratings',
    title: 'بازمحاسبه‌ی امتیازها',
    description:
      'امتیاز و تعداد نظرِ هر مجموعه را از نظرهای **تأییدشده** از نو می‌شمارد. اگر نظرها را دستی در دیتابیس عوض کرده‌اید، این عددها را با واقعیت هم‌گام می‌کند.',
    action: 'بازمحاسبه',
    heavy: true,
  },
  {
    id: 'clear_caches',
    title: 'خالی‌کردن کش‌ها',
    description:
      'کش‌های درون‌حافظه‌ای (تنظیمات، داده‌ی مرجع، میانگین امتیاز سایت) و کش صفحه‌های Next را خالی می‌کند. اگر تغییری را نمی‌بینید، اول این را بزنید.',
    action: 'خالی کن',
  },
]

/** فرمان‌هایی که عمداً دکمه ندارند — چون idempotent نیستند یا چند دقیقه طول می‌کشند. */
const MANUAL: { command: string; what: string }[] = [
  {
    command: 'npm run import:cafes',
    what: 'ایمپورت کامل از فایل منبع — همه‌ی مکان‌ها را پاک و از نو می‌سازد.',
  },
  {
    command: 'npm run build:facets',
    what: 'بازسازی facetها و دیش‌ها؛ بعد از تغییر «حداقل کافه برای پرمصرف» لازم است.',
  },
  { command: 'npm run media:download', what: 'دانلود تصاویری که هنوز نیامده‌اند.' },
  {
    command: 'npm run map:extract',
    what: 'استخراج دوباره‌ی نقشه از فایل PBF — چند دقیقه و چند گیگ حافظه.',
  },
  {
    command: 'npm run db:verify',
    what: 'بررسی اینکه ایندکس‌های FULLTEXT سر جایشان هستند.',
  },
]

function RunButton({ label, heavy }: { label: string; heavy?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      className={heavy ? styles.runHeavy : styles.run}
      disabled={pending}
    >
      {pending ? 'در حال اجرا…' : label}
    </button>
  )
}

export function OperationsPanel() {
  const [state, action] = useActionState(runOperationAction, EMPTY_ADMIN_STATE)

  return (
    <div className={styles.wrap}>
      {state.error && <p className={styles.error}>{state.error}</p>}
      {state.ok && state.message && <p className={styles.success}>{state.message}</p>}

      <ul className={styles.list}>
        {OPERATIONS.map((operation) => (
          <li key={operation.id} className={styles.card}>
            <div className={styles.cardBody}>
              <h3 className={styles.cardTitle}>{operation.title}</h3>
              <p className={styles.cardDesc}>{operation.description}</p>
            </div>
            <form action={action} className={styles.cardForm}>
              <input type="hidden" name="operation" value={operation.id} />
              <RunButton label={operation.action} heavy={operation.heavy} />
            </form>
          </li>
        ))}
      </ul>

      <section className={styles.manual}>
        <h3 className={styles.manualTitle}>کارهایی که از ترمینال اجرا می‌شوند</h3>
        <p className={styles.manualNote}>
          این‌ها دکمه ندارند چون یا داده را بازنویسی می‌کنند یا چند دقیقه طول می‌کشند — و
          یک درخواست وب برای هیچ‌کدام جای درستی نیست.
        </p>
        <dl className={styles.manualList}>
          {MANUAL.map((item) => (
            <div key={item.command}>
              <dt dir="ltr">
                <code>{item.command}</code>
              </dt>
              <dd>{item.what}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}

export default OperationsPanel
