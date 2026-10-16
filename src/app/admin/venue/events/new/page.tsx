import type { Metadata } from 'next'
import Link from 'next/link'
import { and, eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/core/auth/currentUser'
import { authorizeVenueReadSession } from '@/core/auth/venueAccess'
import { tehranCivilNow } from '@/core/booking/policy'
import { getDb } from '@/db/client'
import { media, place, placePhoto } from '@/db/schema'
import { authUrl, paths } from '@/routes'
import { EventEditorForm } from '../EventEditorForm'
import styles from '../events.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'رویداد تازه', robots: { index: false, follow: false } }

export default async function NewVenueEventPage({ searchParams }: { searchParams: Promise<{ place?: string }> }) {
  const placeId = Number((await searchParams).place)
  if (!Number.isSafeInteger(placeId) || placeId <= 0) notFound()
  const session = await getSession()
  if (!session.user) redirect(authUrl(`/admin/venue/events/new?place=${placeId}`))
  const access = await authorizeVenueReadSession(session, placeId)
  if (!access.ok) notFound()
  const [[venue], photos] = await Promise.all([
    getDb().select({ name: place.name }).from(place).where(eq(place.id, placeId)).limit(1),
    getDb().select({ id: media.id, label: placePhoto.alt }).from(placePhoto)
      .innerJoin(media, eq(media.id, placePhoto.mediaId))
      .where(and(eq(placePhoto.placeId, placeId), eq(media.status, 'ok'))).limit(30),
  ])
  if (!venue) notFound()
  return <main className={styles.page}><nav className={styles.nav}><Link href={paths.venueEvents(placeId)}>رویدادهای {venue.name}</Link><span aria-hidden="true"> / </span>تازه</nav>
    {session.actor ? <p className={styles.notice}>در حالت مشاهده به‌عنوان، ساخت رویداد مجاز نیست.</p>
      : <EventEditorForm placeId={placeId} photoChoices={photos.map(photo => ({ id: photo.id, label: photo.label || `تصویر ${photo.id}` }))} minDate={tehranCivilNow().date} />}
  </main>
}
