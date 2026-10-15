import 'server-only'

import type { Session } from '@/core/auth/sessionResolver'
import { findUserById, getPlaceRole } from '@/core/auth/userRepo'
import { canReadOwnerOnlyPlaceData } from '@/core/auth/authorization'

/** The request wrapper and isolated signed-session tests share one decision path. */
export async function authorizeAdminRead({ user, actor }: Session, placeId?: number, ownerOnly = false) {
  if (!user) return { ok: false as const, status: 401, error: 'ابتدا وارد شوید.' }
  if (actor) return { ok: false as const, status: 403, error: 'این بخش در حالت مشاهده به‌عنوان در دسترس نیست.' }
  const account = await findUserById(user.id)
  if (!account || account.blocked || account.mustChangePassword) return { ok: false as const, status: 403, error: 'حساب مجاز و فعال نیست.' }
  if (account.role === 'admin') return { ok: true as const, user }
  const role = placeId ? await getPlaceRole(user.id, placeId) : null
  if (!placeId || (ownerOnly
    ? !canReadOwnerOnlyPlaceData(account.role, role)
    : account.role !== 'owner' || !['owner', 'manager'].includes(role ?? ''))) {
    return { ok: false as const, status: 403, error: 'به این مجموعه دسترسی ندارید.' }
  }
  return { ok: true as const, user }
}
