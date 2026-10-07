import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { VenuePanel } from '@/components/venue/VenuePanel'
import { VenueSelector } from '@/components/venue/VenueSelector'
import { getSession } from '@/core/auth/currentUser'
import { findUserById, getPlaceRole, listPlaceManagers } from '@/core/auth/userRepo'
import { loadOwnerPlace, loadPlaceReviewsForOwner } from '@/core/places/manage'
import { authUrl, paths } from '@/routes'
import { getSettings } from '@/core/settings/store'
import styles from '@/components/venue/VenuePanel.module.css'
import { CustomerClubPanel } from '@/components/venue/CustomerClubPanel'
import { listClubMembers, listOffers } from '@/core/club/service'
import { getVenueDiscount } from '@/core/club/venueDiscounts'
import {getAdminPlaces,getAdminPlaceChoices} from '@/core/admin/catalog'
import {getDb} from '@/db/client'
import {district,placeBrand} from '@/db/schema'
import { listQrChannels } from '@/core/qr/channels'

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
  title: 'پنل کافه',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ place?: string }>
}

export default async function VenuePage({ searchParams }: PageProps) {
  const params = await searchParams
  const requestedId = params.place && /^\d+$/.test(params.place) && Number.isSafeInteger(Number(params.place)) ? Number(params.place) : null
  const { user, actor } = await getSession()
  if (!user) {
    const returnTo = requestedId && Number.isFinite(requestedId)
      ? `${paths.ownerPanel}?place=${requestedId}`
      : paths.ownerPanel
    redirect(authUrl(returnTo))
  }
  if (user.role !== 'owner' && user.role !== 'admin') redirect(paths.profile)

  const account = await findUserById(user.id)
  if (account?.mustChangePassword) redirect(paths.changePassword)
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
      ? await getAdminPlaces()
      : []

    if (isAdmin && !Array.isArray(candidates)) return <VenueSelector places={candidates.rows} total={candidates.total} />

    return (
      <div className={styles.panel}>
        <h1 className={styles.title}>پنل کافه</h1>
          <div className={styles.todoBox}>
            <h2 className={styles.boxTitle}>{requestedId?'به مجموعه انتخاب‌شده دسترسی ندارید':'هنوز مجموعه‌ای به حساب شما وصل نیست'}</h2>
            <p className={styles.hint}>
              اگر صاحب یک کافه هستید، از مدیر بخواهید مجموعه‌تان را به این حساب وصل کند.
              بعد از آن، اطلاعات، ساعت کاری، منو و قیمت‌ها را از همین‌جا مدیریت می‌کنید.
            </p>
            <p className={styles.hint}>
              <Link href={paths.submitPlace}>ثبت کافه‌ی جدید</Link> ·{' '}
              <Link href={paths.profile}>بازگشت به پنل من</Link>
            </p>
          </div>
      </div>
    )
  }

  const [place, reviews, adminPlaces, managers, currentPlaceRole] = await Promise.all([
    loadOwnerPlace(placeId, { includeForeignBranchSections: isAdmin }),
    loadPlaceReviewsForOwner(placeId),
    isAdmin ? getAdminPlaceChoices() : Promise.resolve([]),
    listPlaceManagers(placeId),
    isAdmin ? Promise.resolve('owner' as const) : getPlaceRole(user.id, placeId),
  ])
  if (!place) redirect(paths.ownerPanel)

  const settings = await getSettings()
  const qrChannels = actor ? [] : await listQrChannels(placeId, { userId: user.id, label: user.name || user.id })
  const [districts,brands]=await Promise.all([getDb().select({id:district.id,name:district.name}).from(district),isAdmin?getDb().select({id:placeBrand.id,name:placeBrand.name}).from(placeBrand):Promise.resolve([])])
  const currentDiscount = await getVenueDiscount(placeId)
  const canManageClub = !actor && (isAdmin || currentPlaceRole === 'owner')
  const [clubMembers, clubOffers] = canManageClub
    ? await Promise.all([listClubMembers(placeId), listOffers(placeId)])
    : [[], []]

  return (
    <VenuePanel
      place={place}
      qrChannels={qrChannels}
      districts={districts}
      brands={brands}
      reviews={reviews}
      otherPlaces={(isAdmin ? adminPlaces : owned).filter((item) => item.id !== placeId).map((item) => ({ id: item.id, name: item.name }))}
      // در حالت «مشاهده به‌عنوان»، پنل فقط‌خواندنی است — همان قاعده‌ای که
      // اکشن‌ها هم اعمالش می‌کنند. نمایشِ دکمه‌ای که کار نمی‌کند بدتر است.
      readOnly={!!actor}
      canManagePriceStats={isAdmin && !actor}
      stalePriceDays={settings.stalePriceDays}
      ownerRepliesRequireApproval={settings.ownerRepliesRequireApproval}
      priceStatsMaxItemPrice={settings.priceStatsMaxItemPrice}
      priceStatsExcludeServiceSections={settings.priceStatsExcludeServiceSections}
      managers={managers}
      canManageUsers={!actor && (isAdmin || currentPlaceRole === 'owner')}
      currentUserId={user.id}
      clubPanel={canManageClub ? <CustomerClubPanel placeId={placeId} members={clubMembers} offers={clubOffers} currentDiscount={currentDiscount?{percent:currentDiscount.percent,expiresAt:currentDiscount.expiresAt.toISOString()}:null} /> : null}
    />
  )
}
