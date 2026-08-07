import type { Metadata } from 'next'
import Link from 'next/link'
import { getSession } from '@/core/auth/currentUser'
import { listMySuggestions } from '@/core/places/suggestions'
import { SUGGESTABLE_FIELDS } from '@/core/places/suggestFields'
import { MaintenanceScreen } from '@/components/site/MaintenanceScreen'
import { maintenanceState } from '@/core/settings/maintenance'
import { fa } from '@/lib/format'
import { authUrl, paths, searchUrl } from '@/routes'
import styles from './page.module.css'
import { ArrowLeft } from 'lucide-react'

/**
 * صفحه‌ی «مشارکت».
 *
 * ═══ چرا این صفحه فرم ثبت ندارد ═══
 *
 * وسوسه‌ی طبیعی این است که اینجا یک فرم بگذاریم: «کافه را انتخاب کن، فیلد را
 * انتخاب کن، بنویس». ولی کاربر با ۳۳۱ گزینه در یک `select` هیچ‌وقت همان کافه‌ای
 * را که پنج دقیقه پیش دیده پیدا نمی‌کند، و بدتر: اصلاح وقتی به ذهنش می‌رسد که
 * *روی صفحه‌ی کافه* است، نه اینجا.
 *
 * پس این صفحه سه کار می‌کند و بس: می‌گوید چه چیزی به ما کمک می‌کند، لینکِ رفتن
 * به همان کافه را می‌دهد، و کارنامه‌ی مشارکت‌های خودِ کاربر را نشان می‌دهد.
 * ثبتِ واقعی روی صفحه‌ی کافه انجام می‌شود.
 */

export const metadata: Metadata = {
  title: 'مشارکت',
  description:
    'اطلاعات کافه‌ها را با ما اصلاح کنید: ساعت کاری، آدرس، شماره تماس و قیمت منو. هر اصلاح بعد از بررسی روی صفحه اعمال می‌شود.',
  alternates: { canonical: paths.contribute },
}

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  pending: 'در انتظار بررسی',
  applied: 'اعمال شد',
  rejected: 'اعمال نشد',
}

const WAYS = [
  {
    title: 'اطلاعات یک کافه را اصلاح کنید',
    body: 'صفحه‌ی کافه را باز کنید و پایین ستون کنار، «چیزی در این صفحه غلط است؟» را بزنید. ساعت کاری، آدرس، شماره، مختصات و قیمت منو همه از همان‌جا قابل اصلاح‌اند.',
    href: searchUrl(),
    cta: 'رفتن به کافه‌ها',
  },
  {
    title: 'کافه‌ای که اینجا نیست را ثبت کنید',
    body: 'همین‌قدر که نامش را بنویسید کافی است؛ بقیه را ما کامل می‌کنیم. بعد از تأیید، صفحه‌ی خودش را می‌گیرد.',
    href: paths.submitPlace,
    cta: 'ثبت کافه‌ی جدید',
  },
  {
    title: 'نظر بنویسید',
    body: 'نظر با تاریخِ رفتن، بیشتر از هر داده‌ی دیگری به کاربر بعدی کمک می‌کند — چون تنها چیزی است که از منبعِ بیرونی نمی‌آید.',
    href: searchUrl(),
    cta: 'انتخاب کافه',
  },
]

export default async function ContributePage() {
  const gate = await maintenanceState()
  if (gate.closed) {
    return <MaintenanceScreen siteName={gate.siteName} message={gate.message} />
  }

  const { user } = await getSession()
  const mine = user ? await listMySuggestions(user.id) : []

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>مشارکت</h1>
      <p className={styles.lede}>
        داده‌ی این سایت از منبع بیرونی آمده و بخشی از آن بیات است: کافه ساعتش را عوض
        کرده، جابه‌جا شده، یا قیمت‌هایش بالا رفته. کسی که این‌ها را واقعاً می‌داند
        شمایید — همان کسی که همین هفته آنجا بوده.
      </p>

      <section className={styles.ways}>
        {WAYS.map((way) => (
          <article key={way.title} className={styles.way}>
            <h2>{way.title}</h2>
            <p>{way.body}</p>
            <Link href={way.href} className={styles.wayCta}>
              {way.cta} <ArrowLeft size={15} aria-hidden="true" />
            </Link>
          </article>
        ))}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>چه چیزهایی را می‌شود اصلاح کرد</h2>
        <ul className={styles.fieldList}>
          {SUGGESTABLE_FIELDS.map((field) => (
            <li key={field.id}>
              <strong>{field.labelFa}</strong>
              <span>{field.hint}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>یک قاعده</h2>
        <p className={styles.rule}>
          چیزی که مطمئن نیستید را نفرستید. داده‌ی غلط بدتر از داده‌ی قدیمی است: کاربری
          که با اطلاعات غلط راه می‌افتد و به درِ بسته می‌رسد، دیگر برنمی‌گردد. هر اصلاح
          قبل از اعمال بررسی می‌شود، ولی بررسیِ ما جای دانستنِ شما را نمی‌گیرد.
        </p>
      </section>

      {/* کارنامه‌ی خود کاربر — بدون آن، فرستادن اصلاح مثل انداختن نامه در چاه است. */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>اصلاح‌های شما</h2>
          {mine.length > 0 && <span className={styles.count}>{fa(mine.length)}</span>}
        </div>

        {!user ? (
          <p className={styles.empty}>
            <Link href={authUrl(paths.contribute)} className={styles.inlineLink}>
              وارد شوید
            </Link>{' '}
            تا اصلاح‌هایتان و وضعیت بررسی‌شان اینجا بیاید.
          </p>
        ) : mine.length === 0 ? (
          <p className={styles.empty}>هنوز اصلاحی نفرستاده‌اید.</p>
        ) : (
          <ul className={styles.mineList}>
            {mine.map((item) => (
              <li key={item.id} className={styles.mineItem}>
                <div className={styles.mineHead}>
                  <Link href={paths.cafe(item.placeSlug)} className={styles.minePlace}>
                    {item.placeName}
                  </Link>
                  <span className={styles.mineField}>{item.fieldLabel}</span>
                  <span
                    className={
                      item.status === 'applied'
                        ? styles.statusApplied
                        : item.status === 'rejected'
                          ? styles.statusRejected
                          : styles.statusPending
                    }
                  >
                    {STATUS_LABEL[item.status] ?? item.status}
                  </span>
                </div>
                <p className={styles.mineValue}>{item.suggestedValue}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
