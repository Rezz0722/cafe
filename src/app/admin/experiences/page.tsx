import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, CheckCircle2, CircleDashed, ExternalLink, Search, TimerReset } from 'lucide-react'
import { ExperienceCurationForm } from '@/components/admin/ExperienceCurationForm'
import {
  getExperienceCoverageDashboard,
  type ExperienceCoverageFilter,
} from '@/core/experience/admin'
import {
  EXPERIENCES,
  EXPERIENCE_CURATION_ATTRIBUTES,
  EXPERIENCE_PRIMARY_ATTRIBUTE_IDS,
} from '@/core/experience/registry'
import { getSession } from '@/core/auth/currentUser'
import { findUserById } from '@/core/auth/userRepo'
import { authUrl, paths } from '@/routes'
import { fa, faCount } from '@/lib/format'
import styles from '@/components/admin/ExperienceCuration.module.css'

export const metadata: Metadata = {
  title: 'پوشش تجربه‌های کافه',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ place?: string; status?: string; district?: string; q?: string }>
}

const VALID_STATUS = new Set<ExperienceCoverageFilter>([
  'all', 'unreviewed', 'partial', 'reviewed', 'stale',
])

function queryHref(
  input: { place?: number | null; status: string; district: string; query: string },
): string {
  const params = new URLSearchParams()
  if (input.place) params.set('place', String(input.place))
  if (input.status !== 'all') params.set('status', input.status)
  if (input.district) params.set('district', input.district)
  if (input.query) params.set('q', input.query)
  return `${paths.adminExperiences}${params.size ? `?${params}` : ''}`
}

const COVERAGE_LABELS = {
  unreviewed: 'بررسی‌نشده',
  partial: 'نیمه‌کاره',
  reviewed: 'کامل',
  stale: 'نیازمند بازبینی',
} as const

export default async function AdminExperiencesPage({ searchParams }: PageProps) {
  const { user, actor } = await getSession()
  if (!user) redirect(authUrl(paths.adminExperiences))
  if (actor || user.role !== 'admin') redirect(paths.profile)
  const account = await findUserById(user.id)
  if (account?.mustChangePassword) redirect(paths.changePassword)

  const params = await searchParams
  const requestedId = params.place && /^\d+$/.test(params.place) ? Number(params.place) : null
  const status = VALID_STATUS.has(params.status as ExperienceCoverageFilter)
    ? params.status as ExperienceCoverageFilter
    : 'all'
  const district = (params.district ?? '').slice(0, 48)
  const query = (params.q ?? '').slice(0, 120)
  const dashboard = await getExperienceCoverageDashboard({
    placeId: requestedId,
    status,
    districtId: district,
    query,
  })
  const selected = dashboard.selected
  const previousHref = dashboard.previousPlaceId
    ? queryHref({ place: dashboard.previousPlaceId, status, district, query })
    : null

  const primaryFields = selected
    ? EXPERIENCES.map((experience) => {
        const def = EXPERIENCE_CURATION_ATTRIBUTES.find(
          (item) => item.id === experience.primaryAttributeId,
        )!
        return {
          slug: experience.slug,
          title: experience.shortTitle,
          question: experience.adminQuestion,
          attribute: {
            id: def.id,
            label: def.labelFa,
            hint: def.hint,
            value: selected.attributes[def.id]?.value ?? null,
          },
        }
      })
    : []
  const supportingFields = selected
    ? EXPERIENCE_CURATION_ATTRIBUTES
        .filter((def) => !EXPERIENCE_PRIMARY_ATTRIBUTE_IDS.includes(def.id))
        .map((def) => ({
          id: def.id,
          label: def.labelFa,
          hint: def.hint,
          value: selected.attributes[def.id]?.value ?? null,
        }))
    : []

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <Link href={paths.admin} className={styles.back}><ArrowRight size={15} /> پنل مدیریت</Link>
          <span className={styles.eyebrow}>Experience Engine · فاز پایلوت</span>
          <h1>پوشش تجربه‌های کافه‌ها</h1>
          <p>پنج تصمیم کوتاه برای هر کافه؛ «نامشخص» را فقط وقتی به بله یا خیر تبدیل کنید که شواهد کافی دارید.</p>
        </div>
        <div className={styles.heroStats}>
          <span><strong>{fa(dashboard.reviewedPlaces)}</strong> کامل</span>
          <span><strong>{fa(dashboard.partialPlaces)}</strong> نیمه‌کاره</span>
          <span><strong>{fa(dashboard.unreviewedPlaces)}</strong> بررسی‌نشده</span>
        </div>
      </header>

      <section className={styles.progressGrid} aria-label="پوشش هر تجربه">
        {dashboard.progress.map((item) => (
          <article key={item.slug}>
            <span>{item.title}</span>
            <strong>{fa(item.positive)} کاندیدا</strong>
            <small>{fa(item.answered)} پاسخ از {fa(dashboard.totalPublished)} کافه</small>
            <i style={{ width: `${dashboard.totalPublished ? (item.answered / dashboard.totalPublished) * 100 : 0}%` }} />
          </article>
        ))}
      </section>

      <form className={styles.filters} method="get">
        <label className={styles.searchBox}>
          <Search size={17} />
          <input name="q" defaultValue={query} placeholder="نام، محله یا آدرس…" />
        </label>
        <select name="status" defaultValue={status} aria-label="وضعیت پوشش">
          <option value="all">همه وضعیت‌ها</option>
          <option value="unreviewed">بررسی‌نشده</option>
          <option value="partial">نیمه‌کاره</option>
          <option value="reviewed">کامل</option>
          <option value="stale">نیازمند بازبینی</option>
        </select>
        <select name="district" defaultValue={district} aria-label="محله">
          <option value="">همه محله‌ها</option>
          {dashboard.districts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <button type="submit">اعمال فیلتر</button>
      </form>

      <div className={styles.workspace}>
        <aside className={styles.queue}>
          <div className={styles.queueHead}>
            <strong>{faCount(dashboard.matches)} در صف</strong>
            {dashboard.stalePlaces > 0 && <span><TimerReset size={13} /> {fa(dashboard.stalePlaces)} قدیمی</span>}
          </div>
          <div className={styles.queueList}>
            {dashboard.queue.map((place) => (
              <Link
                key={place.id}
                href={queryHref({ place: place.id, status, district, query })}
                data-active={selected?.id === place.id ? 'true' : undefined}
              >
                <span className={styles.queueIcon} data-coverage={place.coverage}>
                  {place.coverage === 'reviewed' ? <CheckCircle2 size={18} /> : <CircleDashed size={18} />}
                </span>
                <span><b>{place.name}</b><small>{place.districtName ?? 'محله نامشخص'} · {fa(place.answeredPrimary)}/۵ پاسخ</small></span>
                <em>{COVERAGE_LABELS[place.coverage]}</em>
              </Link>
            ))}
          </div>
          {dashboard.matches > dashboard.queue.length && (
            <p className={styles.queueNote}>۳۰ مورد اول نمایش داده می‌شود؛ با فیلتر محله یا جست‌وجو صف را کوچک‌تر کنید.</p>
          )}
        </aside>

        <section className={styles.editor}>
          {selected ? (
            <>
              <header className={styles.editorHead}>
                <div>
                  <span className={styles.coverageBadge} data-coverage={selected.coverage}>{COVERAGE_LABELS[selected.coverage]}</span>
                  <h2>{selected.name}</h2>
                  <p>{selected.districtName ?? 'محله نامشخص'} · {selected.address || 'آدرس ثبت نشده'} · کیفیت داده {fa(selected.qualityScore)}٪</p>
                </div>
                <Link href={paths.cafe(selected.slug)} target="_blank">صفحه عمومی <ExternalLink size={14} /></Link>
              </header>
              <ExperienceCurationForm
                key={`${selected.id}:${selected.revision}`}
                placeId={selected.id}
                revision={selected.revision}
                nextPlaceId={dashboard.nextPlaceId}
                previousHref={previousHref}
                experiences={primaryFields}
                supporting={supportingFields}
                filters={{ status, district, query }}
              />
            </>
          ) : (
            <div className={styles.empty}>
              <CheckCircle2 size={34} />
              <h2>موردی در این صف نیست</h2>
              <p>فیلتر را عوض کنید یا به صف بررسی‌نشده‌ها بروید.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
