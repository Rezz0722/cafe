import {NextRequest,NextResponse} from 'next/server'
import {requireAdminRead} from '@/core/admin/access'
import {readTopMenuLogTail, type TopMenuLogName} from '@/core/sync/topMenuLogStore'

export const dynamic='force-dynamic'

/**
 * دنباله‌ی لاگ زنده‌ی اجرای جاری.
 *
 * ═══ چرا GET و نه Server Action ═══
 *
 * همین دلیلی است که خودِ همگام‌سازی از route پایدار استفاده می‌کند: شناسه‌ی
 * Server Action به build گره خورده و اگر حین اسکرپ نسخه‌ای deploy شود، فرم
 * می‌شکند. این endpoint هر ۱۲ ثانیه صدا زده می‌شود، پس باید بین buildها پایدار
 * و کاملاً `no-store` باشد.
 */
export async function GET(request:NextRequest){
  const access=await requireAdminRead()
  if(!access.ok)return NextResponse.json({error:access.error},{status:access.status,headers:{'Cache-Control':'private, no-store'}})
  const requested=request.nextUrl.searchParams.get('log')
  const log:TopMenuLogName|undefined=requested==='scrape'||requested==='reindex'||requested==='media'?requested:undefined
  const tail=await readTopMenuLogTail(log)
  if(!tail)return NextResponse.json({log:null,reason:'هنوز اجرایی با لاگ ثبت‌شده وجود ندارد.'},{headers:{'Cache-Control':'private, no-store'}})
  return NextResponse.json(tail,{headers:{'Cache-Control':'private, no-store'}})
}
