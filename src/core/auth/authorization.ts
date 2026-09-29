import type { Role } from './types'

export type PlaceRole = 'owner' | 'manager' | 'staff' | null

/** Pure RBAC rules shared by server entry points and IDOR tests. */
export function canWritePlace(globalRole: Role, placeRole: PlaceRole): boolean {
  return globalRole === 'admin' || placeRole !== null
}

export function canManagePlaceUsers(globalRole: Role, placeRole: PlaceRole): boolean {
  return globalRole === 'admin' || placeRole === 'owner'
}

export function canGrantPlaceRole(
  globalRole: Role,
  actorPlaceRole: PlaceRole,
  requestedRole: Exclude<PlaceRole, null>,
): boolean {
  if (!canManagePlaceUsers(globalRole, actorPlaceRole)) return false
  // A venue owner may invite managers; only a system administrator can create
  // another owner. A changed form request must not elevate ownership.
  return globalRole === 'admin' || requestedRole === 'manager'
}
