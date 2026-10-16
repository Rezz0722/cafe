import type { Metadata } from 'next'
import Link from 'next/link'
import { and, eq, gte } from 'drizzle-orm'
import { CalendarDays, Coffee } from 'lucide-react'
import { tehranCivilNow, validLocalDate } from '@/core/booking/policy'
import { listUpcomingPublicEvents } from '@/core/events/service'
import { EVENT_CATEGORY_LABEL, eventTimeLabel } from '@/core/events/presentation'
import { getDb } from '@/db/client'
import { district, place, venueEvent } from '@/db/schema'
import { paths } from '@/routes'
import styles from './events.module.css'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const hasEvent = (await listUpcomingPublicEvents({ limit: 1 })).length > 0
  return {
    title: 'رویدادهای کافه‌ها',
    description: 'رویدادهای واقعی و منتشرشدهٔ کافه‌ها؛ زمان، محل، شرایط و روش درخواست شرکت را ببینید.',
    alternates: { canonical: paths.events },
    robots: { index: hasEvent, follow: true },
    openGraph: { title: 'رویدادهای کافه‌ها در کو کافه', url: paths.events, type: 'website' },
  }
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ date?: string; cafe?: string; district?: string }> }) {
  const query = await searchParams
  const fromDate = query.date && validLocalDate(query.date) ? query.date : undefined
  const districtId = query.district && /^[a-z0-9_-]{1,48}$/i.test(query.district) ? query.district : undefined
  const [events, districts] = await Promise.all([
    listUpcomingPublicEvents({ fromDate, venueQuery: query.cafe, districtId, limit: 100 }),
    getDb().selectDistinct({ id: district.id, name: district.name }).from(venueEvent)
      .innerJoin(place, eq(place.id, venueEvent.placeId))
      .innerJoin(district, eq(district.id, place.districtId))
      .where(and(eq(venueEvent.status, 'published'), eq(place.status, 'published'), gte(venueEvent.endDate, tehranCivilNow().date))),
  ])
  return <main className={styles.page}>
    <nav className={styles.breadcrumb}><Link href={paths.home}>خانه</Link><span aria-hidden="true"> / </span>رویدادها</nav>
    <header className={styles.hero}><span className={styles.kicker}>قرارهای واقعی، اطلاعات روشن</span><h1>رویدادهای کافه‌ها</h1>
      <p>فقط برنامه‌هایی که کافه منتشر کرده نمایش داده می‌شوند. علاقه‌مندی یا درخواست شرکت، بلیت یا حضور قطعی نیست.</p>
    </header>
    <form method="get" className={styles.filters} aria-label="فیلتر رویدادها">
      <label>از تاریخ<input type="date" name="date" min={tehranCivilNow().date} defaultValue={fromDate} /></label>
      <label>کافه<input type="search" name="cafe" maxLength={60} defaultValue={query.cafe ?? ''} placeholder="نام کافه" /></label>
      <label>محله<select name="district" defaultValue={districtId ?? ''}><option value="">همهٔ محله‌ها</option>{districts.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <button type="submit">نمایش رویدادها</button>
    </form>
    <section className={styles.results} aria-label="رویدادهای آینده">
      <div className={styles.resultsHead}><h2>برنامه‌های پیش رو</h2><span>{new Intl.NumberFormat('fa-IR').format(events.length)} رویداد</span></div>
      {events.length === 0 ? <div className={styles.empty}><CalendarDays size={32} aria-hidden="true" /><h3>فعلاً رویدادی با این شرایط ثبت نشده</h3><p>وقتی کافه‌ها برنامهٔ واقعی منتشر کنند، اینجا با زمان و شرایط آن نمایش داده می‌شود.</p></div>
        : <div className={styles.grid}>{events.map(({ event, placeName, placeSlug, coverUrl }) => <article className={styles.card} key={event.id}>
          <Link href={paths.event(event.id)} className={styles.cardLink} aria-label={`جزئیات ${event.title}`}>
            <div className={styles.cover}>{coverUrl ? <img src={coverUrl} alt="" width={720} height={405} loading="lazy" /> : <Coffee size={38} aria-hidden="true" />}</div>
            <div className={styles.cardBody}><span className={styles.category}>{EVENT_CATEGORY_LABEL[event.category]}</span><h3>{event.title}</h3>
              <p>{eventTimeLabel(event.startDate, event.startLocalTime)}</p><strong>{placeName}</strong>
            </div>
          </Link><Link href={paths.cafe(placeSlug)} className={styles.venueLink}>صفحهٔ کافه</Link>
        </article>)}</div>}
    </section>
  </main>
}
