import type { Metadata } from 'next'
import { ProfileScreen, type SavedVenue } from '@/components/profile/ProfileScreen'
import { requireUser } from '@/core/auth/currentUser'
import { loadDistricts, loadPublishedViews } from '@/core/places/repository'
import { paths } from '@/routes'

/**
 * پروفایل کاربر — خصوصی، پس از ایندکس بیرون است.
 *
 * کافه‌های ذخیره‌شده با کلید slug در localStorage می‌نشینند و سرور آن را
 * نمی‌بیند؛ پس کاتالوگ اینجا خوانده و به کلاینت داده می‌شود تا آنجا با
 * مجموعه‌ی ذخیره‌شده‌ها فیلتر شود.
 */
export const metadata: Metadata = {
  title: 'پروفایل من',
  robots: { index: false, follow: false },
}

export default async function ProfilePage() {
  const user = await requireUser(paths.profile)
  const [places, districts] = await Promise.all([loadPublishedViews(), loadDistricts()])

  const venues: SavedVenue[] = places.map((place) => ({
    slug: place.slug,
    name: place.name,
    districtName: districts.find((d) => d.id === place.districtId)?.name ?? '',
    rating: place.rawRating,
    priceTier: place.priceTier,
    photo: place.photos[0]?.url,
  }))

  return <ProfileScreen user={user} venues={venues} />
}
