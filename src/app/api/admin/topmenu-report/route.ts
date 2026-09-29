import {NextRequest,NextResponse} from 'next/server'
import {requireAdminRead} from '@/core/admin/access'
import {readTopMenuJobs,readTopMenuReport,readTopMenuTargets} from '@/core/sync/topMenuSync'
import {selectTopMenuReport} from '@/core/sync/topMenuReport'
export const dynamic='force-dynamic'
const json=(body:object,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
export async function GET(request:NextRequest){
 const access=await requireAdminRead();if(!access.ok)return json({error:access.error},access.status)
 const p=request.nextUrl.searchParams,runId=p.get('runId'),ids=(p.get('sourceIds')??'').split(',').filter(Boolean).map(Number)
 if(!runId)return json({jobs:await readTopMenuJobs()})
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(runId)||ids.length>2000||ids.some(id=>!Number.isSafeInteger(id)||id<1))return json({error:'شناسه گزارش معتبر نیست.'},400)
 const report=await readTopMenuReport(runId);if(!report)return json({error:'گزارش یافت نشد.'},404)
 try{
 const selected=ids.length?selectTopMenuReport(report,(await readTopMenuTargets({runId,status:'ready'})).reportTargets,ids):null
 const body=selected?{runId,exportedAt:new Date().toISOString(),...selected}:{runId,exportedAt:new Date().toISOString(),scope:'complete-report',limitations:report.reportVersion===2?[]:['گزارش قدیمی ممکن است جزئیات ذخیره‌شدهٔ محدود داشته باشد.'],report}
 if(p.get('summary')==='1')return json(selected?{runId,summary:selected.summary,limitations:selected.limitations}:{runId,summary:null,limitations:body.limitations})
 return new NextResponse(JSON.stringify(body),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Content-Disposition':`attachment; filename="topmenu-${runId}${selected?'-selected':''}.json"`}})
 }catch{return json({error:'گزارش انتخابی قابل دریافت نیست؛ محدوده را بررسی کنید.'},400)}
}
