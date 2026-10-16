import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSession } from '@/core/auth/currentUser'
import { getMyEventParticipation, getPublicEvent } from '@/core/events/service'
import { EVENT_CATEGORY_LABEL, EVENT_PARTICIPATION_LABEL, EVENT_STATUS_LABEL, eventTimeLabel } from '@/core/events/presentation'
import { eventHasEnded } from '@/core/events/policy'
import { authUrl, paths } from '@/routes'
import { ParticipationForm } from './ParticipationForm'
import styles from './event.module.css'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const row = await getPublicEvent(id)
  if (!row) return { title: 'رویداد پیدا نشد', robots: { index: false, follow: false } }
  const indexable = row.event.status === 'published' && !eventHasEnded(row.event.endDate, row.event.endLocalTime)
  const title = `${row.event.title} در ${row.placeName}`
  const description = row.event.description.replace(/\s+/g, ' ').slice(0, 160)
  return { title, description, alternates: { canonical: paths.event(id) }, robots: { index: indexable, follow: true },
    openGraph: { title, description, url: paths.event(id), type: 'website',
      images: row.coverUrl ? [{ url: row.coverUrl, alt: `تصویر ${row.event.title}` }] : undefined } }
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await getPublicEvent(id)
  if (!row) notFound()
  const { event, placeName, placeSlug, coverUrl } = row
  const session = await getSession()
  const participation = session.user && !session.actor ? await getMyEventParticipation(session, id) : null
  const open = event.status === 'published' && !eventHasEnded(event.startDate, event.startLocalTime)
  return <main className={styles.page}>
    <nav className={styles.breadcrumb}><Link href={paths.events}>رویدادها</Link><span aria-hidden="true"> / </span>{event.title}</nav>
    <article className={styles.article}>
      <div className={styles.cover}>{coverUrl ? <img src={coverUrl} alt={`تصویر ${event.title}`} width={1200} height={675} /> : <span aria-hidden="true">رویداد کو کافه</span>}</div>
      <div className={styles.content}><span className={styles.category}>{EVENT_CATEGORY_LABEL[event.category]}</span><h1>{event.title}</h1>
        {event.status !== 'published' && <strong className={styles.warning}>{EVENT_STATUS_LABEL[event.status]}</strong>}
        <dl className={styles.facts}><div><dt>شروع</dt><dd>{eventTimeLabel(event.startDate, event.startLocalTime)}</dd></div>
          <div><dt>پایان</dt><dd>{eventTimeLabel(event.endDate, event.endLocalTime)}</dd></div>
          <div><dt>مکان</dt><dd><Link href={paths.cafe(placeSlug)}>{placeName}</Link></dd></div>
          {event.capacity !== null && <div><dt>ظرفیت اعلام‌شدهٔ کافه</dt><dd>{new Intl.NumberFormat('fa-IR').format(event.capacity)} نفر؛ موجودی لحظه‌ای نیست</dd></div>}
        </dl>
        <section className={styles.description}><h2>دربارهٔ رویداد</h2><p>{event.description}</p></section>
        {event.terms && <section className={styles.description}><h2>شرایط مشارکت</h2><p>{event.terms}</p></section>}
        <section className={styles.join}><h2>{event.participationMode === 'request' ? 'درخواست شرکت' : 'علاقه‌مندی به رویداد'}</h2>
          {!open ? <p>برای این رویداد اکنون درخواست جدید دریافت نمی‌شود.</p>
            : participation ? <p>وضعیت شما: <strong>{EVENT_PARTICIPATION_LABEL[participation.status]}</strong> · <Link href={paths.myEvents}>پیگیری در حساب من</Link></p>
              : !session.user ? <p>برای ثبت درخواست، ابتدا <Link href={authUrl(paths.event(id))}>وارد حساب خود شوید</Link>.</p>
                : session.actor ? <p>در حالت مشاهده به‌عنوان نمی‌توان درخواست ثبت کرد.</p>
                  : <ParticipationForm eventId={id} mode={event.participationMode} />}
        </section>
      </div>
    </article>
  </main>
}
