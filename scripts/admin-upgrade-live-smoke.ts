/** Read-only deployed-site check. Uses an existing session, never creates one. */
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {mkdir} from 'node:fs/promises'
import {getPool,closeDb} from '../src/db/connection'
import {createSessionToken,SESSION_COOKIE} from '../src/core/auth/session'
const bases=process.argv.slice(2)
assert.ok(bases.length)
for(const base of bases)assert.match(base,/^https:\/\/(dev\.)?kucafe\.ir$|^http:\/\/127\.0\.0\.1:\d+$/)
const [sessions]=await getPool().query("SELECT s.id sid,u.id uid,u.role FROM auth_session s JOIN app_user u ON u.id=s.user_id WHERE u.role='admin' AND (u.phone IS NOT NULL OR u.username IS NOT NULL) AND u.status='active' AND u.must_change_password=0 AND s.revoked_at IS NULL AND s.expires_at>UTC_TIMESTAMP() ORDER BY s.created_at DESC LIMIT 1")
const admin=(sessions as {sid:string;uid:string;role:'admin'}[])[0]
assert.ok(admin,'An existing active admin session is required')
const token=createSessionToken({sessionId:admin.sid,userId:admin.uid,phone:'',role:admin.role},1800)
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--enable-unsafe-swiftshader','--host-resolver-rules=MAP kucafe.ir 45.159.115.116, MAP dev.kucafe.ir 45.159.115.116']})
await mkdir('var/qa/admin-upgrade-live',{recursive:true,mode:0o700})
let checks=0
try{
 for(const base of bases){
  const host=new URL(base).hostname
  for(const width of [320,390,1440]){
   const context=await browser.newContext({viewport:{width,height:844},isMobile:width<500,hasTouch:width<500})
   await context.route('**/*',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.abort())
   const page=await context.newPage(),errors:string[]=[],failed:string[]=[]
   page.on('pageerror',error=>errors.push(error.message))
   page.on('console',message=>{if(message.type()==='error'&&/MIME|Failed to load module/.test(message.text()))errors.push(message.text())})
   page.on('response',response=>{if(response.status()>=400&&response.request().method()==='GET')failed.push(`${response.status()} ${response.url()}`)})
   for(const path of ['/','/search?q=پاستا%20راموز','/cafe/ramouz-cafe','/auth','/auth/register']){
    const response=await page.goto(base+path,{waitUntil:'networkidle',timeout:60000})
    assert.equal(response?.status(),200,path);checks++
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow ${path} ${width}`);checks++
    if(path==='/cafe/ramouz-cafe'){
     const map=page.locator('[class*="LazyCafeMap_reserve"]').first();if(await map.count())await map.scrollIntoViewIfNeeded()
     await page.locator('.maplibregl-marker, [data-map-pin]').first().waitFor({timeout:30000})
     assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden');checks++
    }
   }
   await context.addCookies([{name:SESSION_COOKIE,value:token,url:base,httpOnly:true,sameSite:'Lax',secure:base.startsWith('https:')}])
   for(const path of ['/admin?tab=places','/admin?tab=users','/admin?tab=history','/admin?tab=operations','/admin/venue?place=99&tab=menu','/admin/venue?place=99&tab=club']){
    const response=await page.goto(base+path,{waitUntil:'networkidle',timeout:60000});assert.equal(response?.status(),200,path);checks++
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow ${path} ${width}`);checks++
    assert.ok(await page.evaluate(()=>{const nav=document.querySelector('nav[data-panel-tabs]'),button=nav?.querySelector('button[aria-pressed="true"]');if(!nav||!button)return false;const a=nav.getBoundingClientRect(),b=button.getBoundingClientRect();return b.left>=a.left-1&&b.right<=a.right+1}),`active tab clipped ${path} ${width}`);checks++
    if(path.includes('tab=menu'))await page.screenshot({path:`var/qa/admin-upgrade-live/${host}-${width}-ramouz-menu.png`,fullPage:false})
   }
   const api=await page.evaluate(async()=>{const response=await fetch('/api/admin/catalog?type=places');return {status:response.status,cache:response.headers.get('cache-control'),data:await response.json()}})
   assert.equal(api.status,200);assert.ok(api.data.rows.length<=25);assert.match(api.cache??'',/private.*no-store/);checks++
   assert.deepEqual(errors,[],host+' runtime');assert.deepEqual(failed,[],host+' failed GET');checks+=2
   await context.close()
  }
  console.log(`PASS: ${host} read-only mobile/desktop, admin paging, scoped menu/club, map initialization and JavaScript MIME`)
 }
 console.log(`PASS: ${checks} deployed browser assertions; no administrative writes or scrape executed`)
}finally{await browser.close();await closeDb()}
