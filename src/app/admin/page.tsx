import type { Metadata } from 'next'
import Link from 'next/link'
import { UsersTable, type AdminUserRow } from '@/components/admin/UsersTable'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { requireAdmin } from '@/core/auth/currentUser'
import { AUTH_DEV_MODE, checkConfig } from '@/core/config/env'
import { loadDistricts, loadPlaceViews } from '@/core/places/repository'
import { verificationLabel } from '@/core/quality/scores'
import { getCredit } from '@/core/sms/smsir'
import { listUsers } from '@/data/userStore'
import { fa } from '@/lib/format'
import { paths } from '@/routes'
import type { PlaceView } from '@/core/places/types'
import { parseQueueFilter, QUEUE_FILTER_LABELS, type QueueFilter } from './state'
import styles from './page.module.css'

/**
 * پنل ادمین — نه پنل مالک.
 *
 * تفاوت را جدی بگیرید: مالک *یک* کافه را ویرایش می‌کند (`/admin/venue`)،
 * ادمین کاتالوگ و کاربران را می‌بیند. این صفحه سه سؤال را جواب می‌دهد که هیچ
 * جای دیگری جواب نمی‌گیرند: «چیزی خراب است؟»، «فردا روی چه کار کنیم؟» و
 * «چه کسی به چه چیزی دسترسی دارد؟»
 */
export const metadata: Metadata = {
  title: 'پنل ادمین',
  robots: { index: false, follow: false },
}

/** حداکثر ردیف صف — بیشتر از این، فهرست به دیوار متن تبدیل می‌شود. */
const QUEUE_LIMIT = 40

/**
 * ترتیب «نیازمند رسیدگی».
 *
 * تأییدنشده‌ها اول، بعد قدیمی‌ترین تأیید. در تساوی، ناقص‌ترین پروفایل جلو
 * می‌افتد — چون یک کافه‌ی تازه‌تأییدشده‌ی خالی هم همان‌قدر کار دارد، و بدون
 * این معیار دوم صد کافه‌ی تأییدنشده به ترتیب تصادفی می‌مانند.
 */
function byNeedsAttention(a: PlaceView, b: PlaceView): number {
  const at = a.lastVerifiedAt ? Date.parse(a.lastVerifiedAt) : Number.NEGATIVE_INFINITY
  const bt = b.lastVerifiedAt ? Date.parse(b.lastVerifiedAt) : Number.NEGATIVE_INFINITY
  // تفریق دو −∞ به NaN می‌رسد و مرتب‌سازی را بی‌صدا خراب می‌کند.
  if (at !== bt) return at < bt ? -1 : 1
  return a.qualityScore - b.qualityScore
}

function matchesFilter(place: PlaceView, filter: QueueFilter): boolean {
  switch (filter) {
    case 'no-attrs':
      return place.activeAttributeIds.length === 0
    case 'no-hours':
      return place.hours.length === 0
    case 'no-coords':
      return place.coords === null
    case 'never-verified':
      return place.lastVerifiedAt === null
    default:
      return true
  }
}

/** عدد بزرگ با جداکننده‌ی هزارگانِ فارسی — مثل `toman()` ولی بدون واحد. */
function faCount(value: number): string {
  return fa(value.toLocaleString('en-US')).replace(/,/g, '٬')
}

/** رنگ نوار امتیاز — عدد خالی بدون رمزگذاری بصری، خوانده نمی‌شود. */
function scoreTone(score: number): string {
  if (score >= 70) return styles.scoreGood
  if (score >= 40) return styles.scoreMid
  return styles.scoreBad
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const me = await requireAdmin(paths.admin)

  const [{ filter: filterRaw }, places, districts, users, credit] = await Promise.all([
    searchParams,
    // نه فقط منتشرشده‌ها: پیش‌نویس و «تعطیل شد» هم کارِ تیم داده‌اند و اگر
    // اینجا دیده نشوند، هیچ‌جای دیگری دیده نمی‌شوند.
    loadPlaceViews(),
    loadDistricts(),
    listUsers(),
    getCredit(),
  ])

  const filter = parseQueueFilter(filterRaw)
  const problems = checkConfig()
  const fatal = problems.filter((p) => p.fatal)

  const districtName = new Map(districts.map((d) => [d.id, d.name]))
  const placeName = new Map(places.map((p) => [p.slug, p.name]))

  const stats = {
    total: places.length,
    noAttrs: places.filter((p) => p.activeAttributeIds.length === 0).length,
    noHours: places.filter((p) => p.hours.length === 0).length,
    noCoords: places.filter((p) => p.coords === null).length,
    neverVerified: places.filter((p) => p.lastVerifiedAt === null).length,
  }

  const queue = places.filter((p) => matchesFilter(p, filter)).sort(byNeedsAttention)
  const shown = queue.slice(0, QUEUE_LIMIT)

  const userRows: AdminUserRow[] = users.map((u) => ({
    id: u.id,
    phone: u.phone,
    name: u.name,
    role: u.role,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    owned: u.ownedPlaceSlugs.map((slug) => ({ slug, name: placeName.get(slug) ?? null })),
    isSelf: u.id === me.id,
  }))

  const queueUrl = (next: QueueFilter) =>
    next === 'all' ? `${paths.admin}#queue` : `${paths.admin}?filter=${next}#queue`

  // ادمین معمولاً مالک هیچ کافه‌ای نیست، پس پنل مالک برایش خالی باز می‌شود.
  // با یک کافه‌ی نمونه، لینک واقعاً چیزی نشان می‌دهد — همان چیزی که مالک می‌بیند.
  const venueHref =
    me.ownedPlaceSlugs.length === 0 && places[0]
      ? `${paths.admin}/venue?slug=${places[0].slug}`
      : `${paths.admin}/venue`

  return (
    <div className="page">
      <SiteHeader />

      <main className={`container ${styles.wrap}`}>
        <header className={styles.head}>
          <div>
            <h1 className={styles.title}>پنل ادمین</h1>
            <p className={styles.lede}>
              وضعیت سرویس، صف کار تیم داده و دسترسی کاربران — همه در یک صفحه.
            </p>
          </div>
          <div className={styles.headActions}>
            <Link href={`${paths.admin}/new`} className={styles.primaryLink}>
              + ثبت کافه‌ی جدید
            </Link>
            <Link href={venueHref} className={styles.secondaryLink}>
              پنل مالک
            </Link>
          </div>
        </header>

        {/* ═══ سلامت سیستم ═══ */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>سلامت سیستم</h2>

          {fatal.length > 0 && (
            <p className={styles.sectionNote}>
              {fa(fatal.length)} مشکل جدی هست؛ تا رفع نشوند ورود کاربران کار نمی‌کند.
            </p>
          )}

          <ul className={styles.problems}>
            {problems.length === 0 && (
              <li className={`${styles.problem} ${styles.problemOk}`}>
                <b>تنظیمات کامل است.</b> چیزی برای رفع نیست.
              </li>
            )}
            {problems.map((problem) => (
              <li
                key={`${problem.key}-${problem.message}`}
                className={`${styles.problem} ${
                  problem.fatal ? styles.problemFatal : styles.problemWarn
                }`}
              >
                <code className={styles.problemKey}>{problem.key}</code>
                <span>{problem.message}</span>
              </li>
            ))}
          </ul>

          <div className={styles.healthGrid}>
            <div className={styles.healthCard}>
              <div className={styles.healthLabel}>اعتبار پیامک</div>
              <div className={styles.healthValue}>
                {credit === null ? '—' : faCount(Math.round(credit))}
              </div>
              <p className={styles.healthNote}>
                {credit === null
                  ? 'خوانده نشد — یا کلید SMS.ir تنظیم نشده یا سرویس در دسترس نبود.'
                  : 'باقی‌مانده‌ی حساب SMS.ir. هر ورود یک پیامک است.'}
              </p>
            </div>

            <div className={styles.healthCard}>
              <div className={styles.healthLabel}>حالت ارسال</div>
              <div className={styles.healthValue}>
                {AUTH_DEV_MODE ? 'توسعه' : 'واقعی'}
              </div>
              <p className={styles.healthNote}>
                {AUTH_DEV_MODE
                  ? 'هیچ پیامکی ارسال نمی‌شود. کد تأیید در ترمینال سرور چاپ می‌شود — یعنی ورود برای کاربر واقعی کار نمی‌کند. برای تولید AUTH_DEV_MODE=false بگذارید.'
                  : 'پیامک واقعی از طریق SMS.ir ارسال می‌شود و از اعتبار بالا کم می‌کند.'}
              </p>
            </div>
          </div>
        </section>

        {/* ═══ آمار کاتالوگ ═══ */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>آمار کاتالوگ</h2>
          <p className={styles.sectionNote}>
            هر عدد یک صف کار است، نه یک آمار تزئینی. رویش بزنید تا همان‌ها را در
            جدول پایین ببینید.
          </p>

          <div className={styles.statGrid}>
            <div className={styles.stat}>
              <div className={styles.statValue}>{fa(stats.total)}</div>
              <div className={styles.statLabel}>کافه در کاتالوگ</div>
            </div>

            <Link href={queueUrl('no-attrs')} className={`${styles.stat} ${styles.statAction}`}>
              <div className={styles.statValue}>{fa(stats.noAttrs)}</div>
              <div className={styles.statLabel}>بدون هیچ ویژگی</div>
              <div className={styles.statHint}>در فیلترها دیده نمی‌شوند</div>
            </Link>

            <Link href={queueUrl('no-hours')} className={`${styles.stat} ${styles.statAction}`}>
              <div className={styles.statValue}>{fa(stats.noHours)}</div>
              <div className={styles.statLabel}>بدون ساعت کاری</div>
              <div className={styles.statHint}>«باز است؟» بی‌جواب می‌ماند</div>
            </Link>

            <Link href={queueUrl('no-coords')} className={`${styles.stat} ${styles.statAction}`}>
              <div className={styles.statValue}>{fa(stats.noCoords)}</div>
              <div className={styles.statLabel}>بدون مختصات</div>
              <div className={styles.statHint}>از سورت «نزدیک‌ترین» بیرون‌اند</div>
            </Link>

            <Link
              href={queueUrl('never-verified')}
              className={`${styles.stat} ${styles.statAction}`}
            >
              <div className={styles.statValue}>{fa(stats.neverVerified)}</div>
              <div className={styles.statLabel}>هرگز تأیید نشده</div>
              <div className={styles.statHint}>امتیاز تازگی‌شان صفر است</div>
            </Link>
          </div>
        </section>

        {/* ═══ صف اعتبارسنجی ═══ */}
        <section className={styles.section} id="queue">
          <h2 className={styles.sectionTitle}>صف اعتبارسنجی</h2>
          <p className={styles.sectionNote}>
            تأییدنشده‌ها اول، بعد قدیمی‌ترین بازدید؛ در تساوی، ناقص‌ترین پروفایل.
            از بالا بردارید و پایین بروید.
          </p>

          <nav className={styles.filters} aria-label="فیلتر صف">
            {(Object.keys(QUEUE_FILTER_LABELS) as QueueFilter[]).map((key) => (
              <Link
                key={key}
                href={queueUrl(key)}
                className={`${styles.filter} ${filter === key ? styles.filterActive : ''}`}
                aria-current={filter === key ? 'true' : undefined}
              >
                {QUEUE_FILTER_LABELS[key]}
              </Link>
            ))}
          </nav>

          {queue.length === 0 ? (
            <p className={styles.queueEmpty}>هیچ کافه‌ای با این فیلتر نیست.</p>
          ) : (
            <>
              <div className={styles.scroller}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>کافه</th>
                      <th>محله</th>
                      <th>کیفیت</th>
                      <th>تازگی</th>
                      <th>آخرین بررسی</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((place) => (
                      <tr key={place.slug}>
                        <td>
                          <Link
                            href={paths.cafe(place.slug)}
                            target="_blank"
                            className={styles.placeLink}
                          >
                            {place.name}
                          </Link>
                          <div className={styles.slug} dir="ltr">
                            {place.slug}
                          </div>
                        </td>
                        <td className={styles.dim}>
                          {districtName.get(place.districtId) ?? '—'}
                        </td>
                        <td>
                          <Score value={place.qualityScore} />
                        </td>
                        <td>
                          <Score value={place.freshnessScore} />
                        </td>
                        {/* برچسب با ارقام ASCII برمی‌گردد؛ فارسی‌سازی کارِ لایه‌ی نمایش است. */}
                        <td className={styles.dim}>
                          {fa(verificationLabel(place.lastVerifiedAt))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {queue.length > shown.length && (
                <p className={styles.queueMore}>
                  {fa(queue.length - shown.length)} مورد دیگر در این صف هست. اول این{' '}
                  {fa(shown.length)} تا.
                </p>
              )}
            </>
          )}
        </section>

        {/* ═══ کاربران ═══ */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>کاربران</h2>
          <p className={styles.sectionNote}>
            دادن مالکیت، یک مشتری را خودکار به «مالک کافه» ارتقا می‌دهد. سلب
            مالکیت نقش را پایین نمی‌آورد — اگر لازم است، جداگانه نقش را عوض کنید.
          </p>

          <UsersTable users={userRows} />
        </section>
      </main>
    </div>
  )
}

function Score({ value }: { value: number }) {
  return (
    <div className={styles.score}>
      <span className={styles.scoreNum}>{fa(value)}</span>
      <span className={styles.scoreTrack}>
        <span className={`${styles.scoreFill} ${scoreTone(value)}`} style={{ width: `${value}%` }} />
      </span>
    </div>
  )
}
