import 'server-only'
import { getSession } from '@/core/auth/currentUser'
import { authorizeAdminRead } from './permissionRead'

export async function requireAdminRead(placeId?:number, ownerOnly=false) {
  return authorizeAdminRead(await getSession(), placeId, ownerOnly)
}
