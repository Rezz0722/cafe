import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {chromium} from 'playwright'
import {and,eq,inArray,sql} from 'drizzle-orm'
import {getDb,closeDb,withDbTransaction} from '../src/db/connection'
import {appUser,authSession,userPlaceRole,place,menuSection,menuItem,auditLog} from '../src/db/schema'
import {createSessionToken,SESSION_COOKIE} from '../src/core/auth/session'
const base=process.env.QA_BASE_URL??'http://127.0.0.1:9096'
assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/,'Write fixtures are permitted only on an explicitly local QA server')
const marker=randomUUID(),users=(['admin','owner','customer'] as const).map(role=>({id:randomUUID(),session:randomUUID(),role})),ids:number[]=[],userIds=users.map(user=>user.id)
const browser=await chromium.launch({channel:'chromium',headless:true,executablePath:process.env.QA_BROWSER_PATH}),db=getDb(),out='var/qa/admin-upgrade'
await mkdir(out,{recursive:true,mode:0o700})
let checks=0
function check(value:unknown,message:string){assert.ok(value,message);checks++}
try{
 await withDbTransaction(async()=>{
  for(const user of users){await getDb().insert(appUser).values({id:user.id,name:`آزمایش ${user.role}`,role:user.role});await getDb().insert(authSession).values({id:user.session,userId:user.id,method:'password',expiresAt:new Date(Date.now()+1800000)})}
  for(let index=0;index<2;index++){const [created]=await getDb().insert(place).values({slug:`qa-admin-${marker}-${index}`,name:`آزمایش پنل ${index}`,nameNormalized:`آزمایش پنل ${index}`,status:'draft',about:'متن آزمایشی',address:'مشهد'}).$returningId();ids.push(created.id)}
  await getDb().insert(userPlaceRole).values({userId:users[1].id,placeId:ids[0],role:'owner'})
  for(const [index,scope] of ['branch','shared','other_branch'].entries()){const [section]=await getDb().insert(menuSection).values({placeId:ids[0],name:`دسته بسیار طولانی آزمایشی شماره ${index} برای بررسی مدیریت منوی موبایل و دسکتاپ`,branchScope:scope as 'branch'|'shared'|'other_branch'}).$returningId();await getDb().insert(menuItem).values({publicId:`qa-${marker.replaceAll('-','').slice(0,24)}-${index}`,placeId:ids[0],sectionId:section.id,name:`خوراک آزمایش ${index}`,nameNormalized:`خوراک آزمایش ${index}`,price:100000})}
 })
 const cookie=(role:typeof users[number]['role'])=>{const user=users.find(user=>user.role===role)!;return `${SESSION_COOKIE}=${createSessionToken({sessionId:user.session,userId:user.id,phone:'',role},1800)}`}
 for(const api of ['/api/admin/catalog?type=places','/api/admin/history','/api/admin/club?place='+ids[0],'/api/admin/topmenu-report','/api/admin/topmenu-sync']){
  check((await fetch(base+api)).status===401,'Anonymous API denied')
  check((await fetch(base+api,{headers:{Cookie:cookie('customer')}})).status===403,'Customer API denied')
 }
 check((await fetch(`${base}/api/admin/history?place=${ids[1]}`,{headers:{Cookie:cookie('owner')}})).status===403,'Owner cannot view another cafe history')
 check((await fetch(`${base}/api/admin/club?place=${ids[1]}`,{headers:{Cookie:cookie('owner')}})).status===403,'Owner cannot view another cafe members')
 const widths=(process.env.QA_WIDTHS??'320,390,1440').split(',').map(Number)
 assert.ok(widths.every(width=>[320,390,1440].includes(width)))
 for(const width of widths){
  const context=await browser.newContext({viewport:{width,height:width===1440?900:844},deviceScaleFactor:1})
  await context.addCookies([{name:SESSION_COOKIE,value:cookie('admin').slice(SESSION_COOKIE.length+1),url:base,httpOnly:true,sameSite:'Lax'}])
  const page=await context.newPage(),errors:string[]=[],failed:string[]=[]
  page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()>=400&&response.request().method()==='GET')failed.push(response.url())})
  for(const path of ['/admin?tab=places','/admin?tab=users','/admin?tab=health','/admin?tab=history',`/admin/venue?place=${ids[0]}&tab=info`,`/admin/venue?place=${ids[0]}&tab=menu`,`/admin/venue?place=${ids[0]}&tab=club`,`/admin/venue?place=${ids[0]}&tab=history`]){
   await page.goto(base+path,{waitUntil:'networkidle',timeout:60000})
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'No horizontal overflow '+path+' '+width)
   await page.screenshot({path:`${out}/${width}-${path.includes('/venue')?'venue':'admin'}-${new URL(base+path).searchParams.get('tab')}.png`,fullPage:true})
   if(path==='/admin?tab=places'){check(await page.locator('input[name=placeId]').count()<=75,'Place catalog is paginated')}
  }
  check(!errors.length,'No client runtime errors: '+errors.join('; '));check(!failed.length,'No failed assets/API GET: '+failed.join('; '))
  if(width===390){
   await page.goto(`${base}/admin/venue?place=${ids[0]}&tab=info`,{waitUntil:'networkidle'})
   const info=page.locator('form').filter({has:page.locator('input[name=name]')}).first()
   await info.locator('input[name=name]').fill('ا')
   await info.getByRole('button',{name:'ذخیره',exact:true}).click()
   await info.getByRole('alert').first().waitFor()
   check(await info.locator('input[name=name]').inputValue()==='ا','Failed save preserves the input')
   let prompted=0
   page.once('dialog',async dialog=>{prompted++;await dialog.dismiss()})
   await page.getByRole('button',{name:'منو و قیمت',exact:true}).click()
   check(prompted===1&&await info.isVisible(),'Cancelling draft confirmation preserves form')
   await info.locator('input[name=name]').fill('آزمایش ذخیره موفق')
   const attrs=page.locator('form').filter({has:page.locator('select[name^=attr_]')}).first()
   await attrs.locator('select[name^=attr_]').first().selectOption('2')
   await attrs.getByRole('button',{name:'ذخیره‌ی امکانات',exact:true}).click()
   await attrs.getByRole('status').last().waitFor()
   let otherDraft=0;page.once('dialog',async dialog=>{otherDraft++;await dialog.dismiss()})
   await page.getByRole('button',{name:'منو و قیمت',exact:true}).click()
   check(otherDraft===1&&await info.locator('input[name=name]').inputValue()==='آزمایش ذخیره موفق','Saving amenities does not discard another form draft')
   await info.getByRole('button',{name:'ذخیره',exact:true}).click()
   await info.getByRole('status').last().waitFor()
   const [saved]=await db.select({name:place.name}).from(place).where(eq(place.id,ids[0]));check(saved.name==='آزمایش ذخیره موفق','Successful server action persists fixture change')
   await page.getByRole('button',{name:'منو و قیمت',exact:true}).click()
   check(new URL(page.url()).searchParams.get('tab')==='menu','Tab state is in URL')
   check(await page.getByRole('button',{name:'بررسی داده‌های قرنطینه‌شده',exact:false}).count()>0,'Admin can explicitly inspect foreign menu scope')
   await page.locator('summary').filter({hasText:'تغییر گروهی قیمت‌ها'}).click()
   const bulk=page.locator('form').filter({has:page.locator('input[name=percent]')}).first()
   await bulk.locator('input[name=percent]').fill('10')
   await bulk.getByRole('button',{name:'پیش‌نمایش تغییرات',exact:true}).click()
   await bulk.getByText('۲ آیتم · ۰ قیمتِ سایز',{exact:true}).waitFor()
   check(await bulk.getByRole('button',{name:'تأیید و اعمال قیمت‌ها'}).isEnabled(),'Only matching preview enables price apply')
   page.once('dialog',dialog=>dialog.accept())
   await bulk.getByRole('button',{name:'تأیید و اعمال قیمت‌ها'}).click()
   await bulk.getByText(/snapshot قابل بازگردانی/).last().waitFor()
   const activePrices=await db.select({price:menuItem.price,scope:menuSection.branchScope}).from(menuItem).innerJoin(menuSection,eq(menuSection.id,menuItem.sectionId)).where(eq(menuItem.placeId,ids[0]))
   check(activePrices.every(row=>row.price===(row.scope==='other_branch'?100000:110000)),'Bulk only updates public branch menu')
   await page.getByRole('button',{name:'تاریخچه',exact:true}).click()
   const undo=page.getByRole('button',{name:'بازگردانی این تغییر قیمت',exact:true}).first()
   await undo.waitFor();page.once('dialog',dialog=>dialog.accept());await undo.click()
   await page.getByRole('status').filter({hasText:/بازگردانده/}).first().waitFor()
   check((await db.select({price:menuItem.price}).from(menuItem).where(eq(menuItem.placeId,ids[0]))).every(row=>row.price===100000),'History restores the exact price snapshot from the UI')
   await page.getByRole('button',{name:'مشتریان و تخفیف',exact:true}).click()
   const offer=page.locator('form').filter({has:page.locator('input[name=title]')}).first()
   await offer.locator('input[name=title]').fill('هدیه تست باشگاه')
   await offer.locator('input[name=discountLabel]').fill('۱۰٪')
   await offer.getByRole('button',{name:'ساخت پیشنهاد',exact:true}).click()
   await offer.getByRole('status').last().waitFor()
   await page.getByRole('button',{name:'مدیریت پیشنهادها',exact:true}).click()
   const editor=page.locator('form').filter({has:page.locator('input[name=offerId]')}).filter({has:page.locator('input[name=title]')}).first()
   await editor.locator('input[name=title]').fill('هدیه ویرایش‌شده')
   await editor.getByRole('button',{name:'ذخیره پیشنهاد',exact:true}).click()
   await page.getByText('هدیه ویرایش‌شده',{exact:true}).first().waitFor()
   page.once('dialog',dialog=>dialog.accept());await editor.getByRole('button',{name:'توقف پیشنهاد و کدها',exact:true}).click()
   const stopped=page.locator('form').filter({has:page.locator('input[name=offerId]')}).filter({hasText:'هدیه ویرایش‌شده'}).first()
   await stopped.getByText(/متوقف‌شده/).waitFor()
   check(await stopped.getByRole('button',{name:'توقف پیشنهاد و کدها',exact:true}).count()===0,'Club offer can be created, edited and stopped without reloading')
   await offer.locator('input[name=title]').fill('پیش‌نویس نگهداری‌شده')
   await page.getByRole('button',{name:'تاریخچه کدها',exact:true}).click()
   check(await offer.locator('input[name=title]').inputValue()==='پیش‌نویس نگهداری‌شده','An inner history tab preserves the outer offer draft')
   let clubDraft=0;page.once('dialog',async dialog=>{clubDraft++;await dialog.dismiss()})
   await page.getByRole('button',{name:'منو و قیمت',exact:true}).click()
   check(clubDraft===1&&await offer.isVisible(),'Inner history navigation must not clear the outer form dirty guard')
   page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'منو و قیمت',exact:true}).click()
   await page.goto(`${base}/admin?tab=places`,{waitUntil:'networkidle'})
   await page.getByRole('textbox',{name:'جست‌وجوی مجموعه',exact:true}).fill('آزمایش ذخیره موفق')
   const row=page.locator('li').filter({has:page.locator(`input[name=placeId][value="${ids[0]}"]`)}).first()
   await row.waitFor();page.once('dialog',dialog=>dialog.accept());await row.getByRole('button',{name:'آرشیو',exact:true}).click()
   await row.waitFor({state:'detached'})
   check((await db.select({id:menuItem.id}).from(menuItem).where(eq(menuItem.placeId,ids[0]))).length===3,'Archiving preserves all menu data')
   await page.getByRole('combobox').filter({has:page.locator('option[value=archived]')}).selectOption('archived')
   await row.waitFor();page.once('dialog',dialog=>dialog.accept());await row.getByRole('button',{name:'بازیابی کافه',exact:true}).click()
   await row.waitFor({state:'detached'})
   check((await db.select({status:place.status}).from(place).where(eq(place.id,ids[0])))[0]?.status==='draft','Restore retains the previous publishing status')
   await context.clearCookies()
   await context.addCookies([{name:SESSION_COOKIE,value:cookie('owner').slice(SESSION_COOKIE.length+1),url:base,httpOnly:true,sameSite:'Lax'}])
   await page.goto(`${base}/admin/venue?place=${ids[0]}&tab=info`,{waitUntil:'networkidle'})
   const ownerInfo=page.locator('form').filter({has:page.locator('input[name=name]')}).first()
   await ownerInfo.locator('input[name=name]').fill('تغییر غیرمجاز')
   await ownerInfo.locator('input[name=placeId]').evaluate((element,id)=>{(element as HTMLInputElement).value=String(id)},ids[1])
   await ownerInfo.getByRole('button',{name:'ذخیره',exact:true}).click()
   await ownerInfo.getByRole('alert').first().waitFor()
   check((await db.select({name:place.name}).from(place).where(eq(place.id,ids[1])))[0]?.name==='آزمایش پنل 1','A forged owner form cannot modify a different cafe')
  }
  await context.close()
 }
 console.log(`PASS: ${checks} browser and access checks at ${widths.join('/')}; private screenshots ${out}; only fixture writes.`)
}finally{
 await browser.close()
 await withDbTransaction(async()=>{if(ids.length)await getDb().delete(place).where(and(inArray(place.id,ids),sql`${place.slug} LIKE ${'qa-admin-'+marker+'-%'}`));await getDb().delete(auditLog).where(inArray(auditLog.actorUserId,userIds));await getDb().delete(appUser).where(inArray(appUser.id,userIds))})
 await closeDb()
}
