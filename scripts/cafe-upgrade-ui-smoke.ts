import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {eq} from 'drizzle-orm'
import {chromium} from 'playwright'
import {getDb,closeDb} from '../src/db/connection'
import {appUser,review} from '../src/db/schema'
import {createAuthSession,revokeSession} from '../src/core/auth/userRepo'
import {createSessionToken,SESSION_COOKIE} from '../src/core/auth/session'
import {QUIZ} from '../src/core/taste/quiz'
import {getTasteProfile,recalcPlaceRating} from '../src/core/user/userData'
const base=process.argv[2]??'http://127.0.0.1:9092',db=getDb(),id=randomUUID()
let sid:string|undefined
const browser=await chromium.launch({headless:true,channel:'chromium',args:['--enable-unsafe-swiftshader']})
await mkdir('var/qa/cafe-upgrade',{recursive:true})
try{
 await db.insert(appUser).values({id,username:`ui_${id.slice(0,8)}`,name:'آزمون موقت UI',role:'admin'})
 sid=await createAuthSession({userId:id,method:'password',expiresAt:new Date(Date.now()+600000),userAgent:'cafe-upgrade-qa'})
 const token=createSessionToken({sessionId:sid,userId:id,phone:'',role:'admin'},600)
 for(const width of [320,390,430,1440]){
  console.log(`QA ${width}: starting browser context`)
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width<700,hasTouch:width<700,locale:'fa-IR',timezoneId:'Asia/Tehran'})
  await context.addCookies([{name:SESSION_COOKIE,value:token,url:base,httpOnly:true,secure:base.startsWith('https:')}])
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(`${page.url()}: ${e.message}`));page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(90000)
  const check=async(label:string)=>{
   if(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1))return
   await page.screenshot({path:`var/qa/cafe-upgrade/overflow-${width}.png`})
   console.log(await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,inner:innerWidth,x:scrollX,elements:Array.from(document.querySelectorAll('body *')).map(el=>({tag:el.tagName,class:el.className,text:el.textContent?.slice(0,35),width:el.getBoundingClientRect().width,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,scroll:el.scrollWidth})).sort((a,b)=>b.width-a.width).slice(0,20)})))
   throw new Error(`${label} ${width}: overflow`)
  }
  assert.equal((await page.goto(`${base}/cafe/ramouz-cafe`,{waitUntil:'domcontentloaded'}))?.status(),200);await check('cafe');console.log(`QA ${width}: cafe loaded`)
  await page.screenshot({path:`var/qa/cafe-upgrade/cafe-${width}.png`})
  const centered=async(dialog:ReturnType<typeof page.getByRole>)=>{await page.waitForTimeout(300);const box=await dialog.boundingBox();assert.ok(box);assert.ok(Math.abs(box.x+box.width/2-width/2)<2,'dialog horizontal center');assert.ok(Math.abs(box.y+box.height/2-450)<3,'dialog vertical center')}
  await page.getByRole('button',{name:'مقایسهٔ قیمت',exact:true}).click();const comparison=page.getByRole('dialog',{name:'قیمت اینجا در مقایسه با شهر'});await comparison.waitFor();await comparison.getByRole('status').waitFor();await centered(comparison);await page.screenshot({path:`var/qa/cafe-upgrade/compare-loading-${width}.png`});await comparison.getByText('با دید باز انتخاب کن',{exact:true}).waitFor();await centered(comparison);await page.screenshot({path:`var/qa/cafe-upgrade/compare-result-${width}.png`});await page.goBack();await comparison.waitFor({state:'hidden'});await page.waitForFunction(()=>document.body.style.overflow==='',{},{timeout:1500})
  await page.getByRole('button',{name:'مقایسهٔ قیمت',exact:true}).click();await comparison.waitFor();await page.goBack();await comparison.waitFor({state:'hidden'});await page.waitForTimeout(2500);assert.equal(await comparison.isVisible(),false);await page.waitForFunction(()=>document.body.style.overflow==='')
  await page.getByRole('button',{name:/ساعت هفته/}).click();await page.getByRole('dialog',{name:/ساعت/}).waitFor();await centered(page.getByRole('dialog',{name:/ساعت/}));await page.keyboard.press('Escape');await page.getByRole('dialog',{name:/ساعت/}).waitFor({state:'hidden'})
  await page.getByRole('button',{name:'مسیریابی',exact:true}).click();const directions=page.getByRole('dialog',{name:'با کدام نقشه برویم؟'});await directions.waitFor();await centered(directions);assert.equal(await directions.getByText('دقیق‌تر در ایران').count(),0);await page.keyboard.press('Escape');await directions.waitFor({state:'hidden'})
  await page.getByRole('button',{name:'دیدن منو',exact:true}).click()
  const menu=width<700?page.getByRole('dialog',{name:/منوی کافه راموز/}):page.locator('#menu')
  const categories=menu.getByRole('navigation',{name:'دسته‌های منو'});await categories.waitFor()
  if(width>=700)await menu.evaluate(element=>element.scrollIntoView({behavior:'instant',block:'start'}))
  assert.equal(await menu.getByText('دستهٔ انتخاب‌شده',{exact:true}).count(),0)
  assert.ok(await categories.locator('img').count()>0)
  if(width>=700){const boxes=await categories.getByRole('button').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return{top:b.top,bottom:b.bottom}}));for(let n=1;n<boxes.length;n++)assert.ok(boxes[n].top>=boxes[n-1].bottom-1,'category overlap')}
  await check('menu');await page.screenshot({path:`var/qa/cafe-upgrade/menu-${width}.png`})
  if(width<700){await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'})}
  await page.getByRole('button',{name:'ثبت تجربهٔ من',exact:true}).click();const reviewDialog=page.getByRole('dialog',{name:'تجربه‌ات را با دیگران شریک شو'});await centered(reviewDialog)
  const form=reviewDialog.locator('form').filter({has:page.locator('input[name="stars"]')}).first()
  assert.ok(await form.getByRole('button',{name:'انتخاب سفارش‌ها',exact:true}).isDisabled());await form.locator('label').filter({has:page.locator('input[name="stars"][value="5"]')}).click();await form.getByRole('button',{name:'انتخاب سفارش‌ها',exact:true}).click()
  const query=form.getByRole('textbox',{name:'جست‌وجوی آیتم سفارش‌داده‌شده'});await query.fill('پپرونی');const chosen=form.locator('input[type="checkbox"]').first();await chosen.check();await query.fill('پاستا');assert.ok(await form.locator('input[type="checkbox"]').count()>0,'pasta missing');assert.equal(await form.locator('input[type="hidden"][name="menuItemId"]').count(),1)
  await form.getByRole('button',{name:'ادامه',exact:true}).click();assert.equal((await db.select({id:review.id}).from(review).where(eq(review.userId,id))).length,0,'step changes must never submit a review');await form.getByRole('button',{name:'دیروز',exact:true}).click();assert.ok((await form.locator('input[name="visitDate"]').inputValue()).length>0);await page.screenshot({path:`var/qa/cafe-upgrade/review-${width}.png`});await page.keyboard.press('Escape');await reviewDialog.waitFor({state:'hidden'});await page.waitForFunction(()=>document.body.style.overflow==='')
  await page.goto(`${base}/admin/venue?place=154`);await page.getByRole('navigation',{name:'بخش‌های پنل'}).waitFor();await page.getByRole('button',{name:'اطلاعات',exact:true}).click()
  await check('admin information');await page.screenshot({path:`var/qa/cafe-upgrade/admin-${width}.png`});assert.deepEqual(errors,[])
  if(width===390){
   await page.goto(`${base}/profile/taste`)
   for(let index=0;index<QUIZ.length;index++){
    await page.locator('fieldset:not([hidden]) label').first().click()
    if(index<QUIZ.length-1)await page.getByRole('button',{name:'ادامه',exact:true}).click()
   }
   await page.getByRole('button',{name:'ذخیره و دیدن پیشنهادها',exact:true}).click()
   await page.getByText('سلیقه‌ات ذخیره شد. پیشنهادها به‌روز شدند.',{exact:true}).waitFor()
   assert.equal(Object.keys((await getTasteProfile(id))?.answers??{}).length,QUIZ.length)
   await check('taste quiz');assert.deepEqual(errors,[])
  }
  await context.close();console.log(`✓ ${width}: menu/category/photo, popup/back/scroll, review orders/date, admin information`)
 }
}finally{await browser.close();if(sid)await revokeSession(sid);const affected=await db.select({placeId:review.placeId}).from(review).where(eq(review.userId,id));await db.delete(review).where(eq(review.userId,id));for(const placeId of new Set(affected.map(row=>row.placeId)))await recalcPlaceRating(placeId);await db.delete(appUser).where(eq(appUser.id,id));await closeDb()}
