import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { VenuePanel } from '@/components/venue/VenuePanel'
import { getSession } from '@/core/auth/currentUser'
import { findUserById } from '@/core/auth/userRepo'
import { loadOwnerPlace, loadPlaceReviewsForOwner } from '@/core/places/manage'
import { listPlaceCards } from '@/core/places/queries'
import { authUrl, paths } from '@/routes'
import { getSettings } from '@/core/settings/store'
import styles from '@/components/venue/VenuePanel.module.css'

/**
 * پنل کافه‌دار.
 *
 * ═══ چه کسی چه چیزی می‌بیند ═══
 *
 *   مالک   → فقط کافه‌های خودش (از `user_place_role`)
 *   ادمین  → هر کافه‌ای، با `?place=<id>`
 *
 * ادمین بدون پارامتر، فهرست کافه‌ها را می‌بیند نه یک کافه‌ی تصادفی: باز شدنِ
 * پنلِ کافه‌ای که ادمین انتخابش نکرده، خطرِ ویرایش اشتباه دارد.
 */

export const metadata: Metadata = {
  title: 'پنل کافه — کافه‌گرد',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ place?: string }>
}

export default async function VenuePage({ searchParams }: PageProps) {
  const { user, actor } = await getSession()
  if (!user) redirect(authUrl(paths.ownerPanel))
  if (user.role !== 'owner' && user.role !== 'admin') redirect(paths.profile)

  const params = await searchParams
  const requestedId = params.place ? Number.parseInt(params.place, 10) : null

  const account = await findUserById(user.id)
  const owned = account?.ownedPlaces ?? []
  const isAdmin = user.role === 'admin'

  // ── انتخاب مکان
  let placeId: number | null = null
  if (requestedId && Number.isFinite(requestedId)) {
    // ادمین به هر مکانی دسترسی دارد؛ مالک فقط به مکان‌های خودش.
    if (isAdmin || owned.some((place) => place.id === requestedId)) placeId = requestedId
  } else if (owned.length > 0) {
    placeId = owned[0]!.id
  }

  if (!placeId) {
    // ادمینِ بدون انتخاب، یا مالکی که هیچ کافه‌ای ندارد.
    const candidates = isAdmin
      ? await listPlaceCards({ limit: 40, sort: 'quality', publishedOnly: false })
      : []

    return (
      <div className={styles.panel}>
        <h1 className={styles.title}>پنل کافه</h1>
        {isAdmin ? (
          <>
            <p className={styles.hint}>
              یک مجموعه را انتخاب کنید. به‌عنوان مدیر، به همه‌ی مجموعه‌ها دسترسی دارید.
            </p>
            <ul className={styles.menuList}>
              {candidates.map((card) => (
                <li key={card.id}>
                  <Link
                    href={`${paths.ownerPanel}?place=${card.id}`}
                    className={styles.itemSave}
                  >
                    {card.name}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className={styles.todoBox}>
            <h2 className={styles.boxTitle}>هنوز مجموعه‌ای به حساب شما وصل نیست</h2>
            <p className={styles.hint}>
              اگر صاحب یک کافه هستید، از مدیر بخواهید مجموعه‌تان را به این حساب وصل کند.
              بعد از آن، اطلاعات، ساعت کاری، منو و قیمت‌ها را از همین‌جا مدیریت می‌کنید.
            </p>
            <p className={styles.hint}>
              <Link href={paths.submitPlace}>ثبت کافه‌ی جدید</Link> ·{' '}
              <Link href={paths.profile}>بازگشت به پنل من</Link>
            </p>
          </div>
        )}
      </div>
    )
  }

  const [place, reviews] = await Promise.all([
    loadOwnerPlace(placeId),
    loadPlaceReviewsForOwner(placeId),
  ])
  if (!place) redirect(paths.ownerPanel)

  return (
    <VenuePanel
      place={place}
      reviews={reviews}
      otherPlaces={owned.filter((item) => item.id !== placeId)}
      // در حالت «مشاهده به‌عنوان»، پنل فقط‌خواندنی است — همان قاعده‌ای که
      // اکشن‌ها هم اعمالش می‌کنند. نمایشِ دکمه‌ای که کار نمی‌کند بدتر است.
      readOnly={!!actor}
      stalePriceDays={(await getSettings()).stalePriceDays}
    />
  )
}
