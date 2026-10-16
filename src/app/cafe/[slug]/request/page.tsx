import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/core/auth/currentUser'
import { getPublicBookingConfiguration } from '@/core/booking/service'
import { tehranCivilNow } from '@/core/booking/policy'
import { getPlaceDetail } from '@/core/places/queries'
import { authUrl, paths } from '@/routes'
import { BookingRequestForm } from './BookingRequestForm'
import styles from './request.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'درخواست هماهنگی با کافه', robots: { index: false, follow: false } }

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ kind?: string; experience?: string }>
}

export default async function CafeRequestPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const query = await searchParams
  const venue = await getPlaceDetail(slug)
  if (!venue) notFound()
  const settings = await getPublicBookingConfiguration(venue.id)
  if (!settings) return <main className={styles.page}><Link href={paths.cafe(slug)}>← بازگشت به {venue.name}</Link><h1>دریافت درخواست آنلاین این شعبه فعال نیست</h1><p>برای هماهنگی از راه‌های تماس ثبت‌شده در صفحهٔ کافه استفاده کنید.</p></main>
  const session = await getSession()
  if (!session.user) {
    const returnQuery = new URLSearchParams()
    if (query.kind) returnQuery.set('kind', query.kind)
    if (query.experience) returnQuery.set('experience', query.experience)
    redirect(authUrl(`${paths.cafeRequest(slug)}${returnQuery.size ? `?${returnQuery}` : ''}`))
  }
  const today = tehranCivilNow().date
  const maxDate = new Date(Date.parse(`${today}T00:00:00Z`) + settings.maxAdvanceDays * 86_400_000).toISOString().slice(0, 10)
  const menu = venue.menu.flatMap(section => section.items.filter(item => item.available &&
    (item.variants.length === 0 || item.variants.some(variant => variant.available))).map(item => ({
    id: item.id, name: item.name, section: section.name, price: item.priceUnknown ? null : item.price,
    variants: item.variants.filter(variant => variant.available).map(variant => ({ id: variant.id, name: variant.label, price: variant.price })),
  })))
  const initialKind = ['birthday', 'gathering', 'special_occasion'].includes(query.kind ?? '')
    ? query.kind as 'birthday' | 'gathering' | 'special_occasion' : 'table'
  return <main className={styles.page}>
    <nav aria-label="مسیر صفحه" className={styles.breadcrumb}><Link href={paths.cafe(slug)}>{venue.name}</Link><span aria-hidden="true"> / </span><span>درخواست هماهنگی</span></nav>
    <header className={styles.header}>
      <span className={styles.eyebrow}>هماهنگی پیش از مراجعه</span>
      <h1>درخواست به {venue.name}</h1>
      <p>زمان و جزئیات دلخواهتان را می‌فرستیم. ثبت درخواست به معنی رزرو قطعی میز نیست؛ کافه باید آن را صریحاً تأیید کند.</p>
    </header>
    <BookingRequestForm placeId={venue.id} placeName={venue.name} settings={settings} minDate={today} maxDate={maxDate}
      initialKind={initialKind} experienceSlug={query.experience ?? null} menu={menu} />
  </main>
}
