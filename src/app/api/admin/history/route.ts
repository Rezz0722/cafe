import {NextRequest,NextResponse} from 'next/server'
import {requireAdminRead} from '@/core/admin/access'
import {getAuditHistory} from '@/core/admin/history'
export const dynamic='force-dynamic'
const json=(body:object,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
export async function GET(request:NextRequest){
 const p=request.nextUrl.searchParams,placeId=p.has('place')?Number(p.get('place')):undefined,id=p.has('id')?Number(p.get('id')):undefined,page=Number(p.get('page')??1),action=p.get('action')??''
 if((placeId!==undefined&&(!Number.isSafeInteger(placeId)||placeId<1))||(id!==undefined&&(!Number.isSafeInteger(id)||id<1))||!Number.isSafeInteger(page)||page<1||page>100000||action.length>64)return json({error:'درخواست معتبر نیست.'},400)
 const access=await requireAdminRead(placeId);if(!access.ok)return json({error:access.error},access.status)
 try{return json(await getAuditHistory({placeId,id,page,action}))}catch{return json({error:'تاریخچه دریافت نشد.'},503)}
}
