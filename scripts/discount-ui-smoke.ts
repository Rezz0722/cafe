import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {eq} from 'drizzle-orm'
import {chromium} from 'playwright'
import {getDb,closeDb} from '../src/db/connection'
import {appUser,place,menuSection,menuItem} from '../src/db/schema'
import {createAuthSession,revokeSession} from '../src/core/auth/userRepo'
import {createSessionToken,SESSION_COOKIE} from '../src/core/auth/session'
import {getVenueDiscount} from '../src/core/club/venueDiscounts'
const base=process.argv[2]??'http://127.0.0.1:9094',db=getDb(),userId=randomUUID(),slug=`discount-ui-${userId.slice(0,8)}`
let placeId:number|undefined,sessionId:string|undefined
const browser=await chromium.launch({headless:true})
try{
 await db.insert(appUser).values({id:userId,username:slug,name:'آزمون موقت تخفیف',role:'admin'})
 const [target]=await db.insert(place).values({slug,name:'آزمون موقت تخفیف عمومی',nameNormalized:'آزمون موقت تخفیف عمومی',status:'draft'}).$returningId();placeId=target.id
 const [section]=await db.insert(menuSection).values({placeId,name:'پاستا'}).$returningId()
 await db.insert(menuItem).values({placeId,sectionId:section.id,publicId:slug,name:'پاستا آزمون',nameNormalized:'پاستا آزمون',price:100000})
 sessionId=await createAuthSession({userId,method:'password',expiresAt:new Date(Date.now()+600000),userAgent:'discount-ui-smoke'})
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'fa-IR'})
 await context.addCookies([{name:SESSION_COOKIE,value:createSessionToken({sessionId,userId,phone:'',role:'admin'},600),url:base,httpOnly:true}])
 const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000)
 await page.goto(`${base}/admin/venue?place=${placeId}`)
 const campaign=page.locator('form').filter({has:page.getByRole('heading',{name:'تخفیف عمومی کل منو',exact:true})})
 await campaign.locator('input[name="percent"]').fill('20')
 await campaign.locator('input[name="expiresAt"]').fill(new Date(Date.now()+86400000+210*60000).toISOString().slice(0,16))
 await campaign.getByRole('button').click();await page.getByText('تخفیف روی کل منوی این شعبه فعال شد.',{exact:true}).waitFor()
 assert.equal((await getVenueDiscount(placeId))?.percent,20)
 await db.update(place).set({status:'published'}).where(eq(place.id,placeId))
 await page.goto(base);const discovery=page.getByRole('region',{name:'کافه‌های تخفیف‌دار'});await discovery.getByRole('link',{name:/آزمون موقت تخفیف عمومی/}).waitFor()
 await page.goto(`${base}/profile`);await page.getByRole('heading',{name:'کافه‌های تخفیف‌دار',exact:true}).waitFor()
 await page.goto(`${base}/cafe/${slug}`);await page.getByRole('button',{name:'دیدن منو',exact:true}).click();const menu=page.getByRole('dialog',{name:/منوی آزمون/});await menu.waitFor();assert.ok((await menu.innerText()).includes('۸۰'))
 await page.goto(`${base}/admin/venue?place=${placeId}`);page.on('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'توقف تخفیف',exact:true}).click();await page.getByText('تخفیف عمومی غیرفعال شد.',{exact:true}).waitFor();assert.equal(await getVenueDiscount(placeId),null)
 await page.goto(base);assert.equal(await page.getByRole('region',{name:'کافه‌های تخفیف‌دار'}).getByRole('link',{name:/آزمون موقت تخفیف عمومی/}).count(),0)
 assert.deepEqual(errors,[]);console.log('✓ campaign create, home/profile discovery, discounted cafe menu, cancel and disappearance')
}finally{await browser.close();if(sessionId)await revokeSession(sessionId);if(placeId)await db.delete(place).where(eq(place.id,placeId));await db.delete(appUser).where(eq(appUser.id,userId));await closeDb()}
