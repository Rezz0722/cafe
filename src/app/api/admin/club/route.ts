import {NextRequest,NextResponse} from 'next/server'
import {requireAdminRead} from '@/core/admin/access'
import {getClubManageData} from '@/core/club/manage'
export const dynamic='force-dynamic'
const json=(body:object,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
export async function GET(request:NextRequest){
 const p=request.nextUrl.searchParams,placeId=Number(p.get('place')),page=Number(p.get('page')??1),section=p.get('section')??'members',query=p.get('q')??''
 if(!Number.isSafeInteger(placeId)||placeId<1||!Number.isSafeInteger(page)||page<1||page>100000||query.length>120||!['members','codes','offers'].includes(section))return json({error:'درخواست معتبر نیست.'},400)
 const access=await requireAdminRead(placeId,true);if(!access.ok)return json({error:access.error},access.status)
 try{return json(await getClubManageData(placeId,section as 'members'|'codes'|'offers',page,query))}catch{return json({error:'اطلاعات دریافت نشد.'},503)}
}
