import 'server-only'

import type { Actor } from '@/core/places/manage'
import { VIEW_AS_READONLY } from './impersonation'
import type { Session } from './currentUser'
import { findUserById, getPlaceRole } from './userRepo'
import { canWritePlace, type PlaceRole } from './authorization'

export interface VenueAccess {
  ok: true
  placeId: number
  actor: Actor
  isAdmin: boolean
  placeRole: PlaceRole
}

/** Re-check the live account and exact branch role for every server-side write. */
export async function authorizeVenueSession(
  { user, actor }: Session,
  placeId: number | null,
): Promise<VenueAccess | { ok: false; error: string }> {
  if (!user) return { ok: false, error: 'ابتدا وارد شوید.' }
  if (actor) return { ok: false, error: VIEW_AS_READONLY }
  if (!Number.isSafeInteger(placeId) || (placeId ?? 0) <= 0) {
    return { ok: false, error: 'مجموعه مشخص نیست.' }
  }

  const account = await findUserById(user.id)
  if (!account || account.blocked) return { ok: false, error: 'حساب فعال پیدا نشد.' }
  if (account.mustChangePassword) {
    return { ok: false, error: 'پیش از مدیریت کافه، رمز موقت را تغییر دهید.' }
  }

  const placeRole = account.role === 'admin' ? 'owner' : await getPlaceRole(account.id, placeId!)
  if (!canWritePlace(account.role, placeRole)) {
    return { ok: false, error: 'به این مجموعه دسترسی ندارید.' }
  }

  return {
    ok: true,
    placeId: placeId!,
    actor: { userId: account.id, label: account.name || account.phone || account.id },
    isAdmin: account.role === 'admin',
    placeRole,
  }
}

/** View-as may inspect a target owner's own branch, but can never authorize a write. */
export async function authorizeVenueReadSession(
  session: Session,
  placeId: number | null,
): Promise<VenueAccess | { ok: false; error: string }> {
  if (!session.actor) return authorizeVenueSession(session, placeId)
  if (!session.user || !Number.isSafeInteger(placeId) || (placeId ?? 0) <= 0) {
    return { ok: false, error: 'مجموعه مشخص نیست.' }
  }
  const [admin, target] = await Promise.all([
    findUserById(session.actor.id),
    findUserById(session.user.id),
  ])
  if (!admin || admin.blocked || admin.mustChangePassword || admin.role !== 'admin' ||
    !target || target.blocked || target.mustChangePassword || target.role !== 'owner') {
    return { ok: false, error: 'دسترسی معتبر نیست.' }
  }
  const placeRole = await getPlaceRole(target.id, placeId!)
  if (!canWritePlace(target.role, placeRole)) return { ok: false, error: 'به این مجموعه دسترسی ندارید.' }
  return {
    ok: true, placeId: placeId!, actor: { userId: admin.id, label: admin.name || admin.id },
    isAdmin: false, placeRole,
  }
}
