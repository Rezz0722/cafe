import 'server-only'
import { getSession } from '@/core/auth/currentUser'
import { findUserById, getPlaceRole } from '@/core/auth/userRepo'

export async function requireAdminRead(placeId?:number, ownerOnly=false) {
  const {user,actor}=await getSession()
  if(!user) return {ok:false as const,status:401,error:'ابتدا وارد شوید.'}
  if(actor) return {ok:false as const,status:403,error:'این بخش در حالت مشاهده به‌عنوان در دسترس نیست.'}
  const account=await findUserById(user.id)
  if(!account || account.blocked || account.mustChangePassword) return {ok:false as const,status:403,error:'حساب مجاز و فعال نیست.'}
  if(user.role==='admin') return {ok:true as const,user}
  const role=placeId ? await getPlaceRole(user.id,placeId):null
  if(!placeId || user.role!=='owner' || (ownerOnly?role!=='owner':!['owner','manager'].includes(role??''))) return {ok:false as const,status:403,error:'به این مجموعه دسترسی ندارید.'}
  return {ok:true as const,user}
}
