import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, firefox, webkit } from 'playwright'
import { and, eq, inArray } from 'drizzle-orm'
import { getDb, closeDb } from '../src/db/client'
import { appUser, auditLog, dailyStat, menuItem, menuSection, place, userPlaceRole, venueQrLink } from '../src/db/schema'
import { createAuthSession } from '../src/core/auth/userRepo'
import { createSessionToken, SESSION_COOKIE } from '../src/core/auth/session'

const url = new URL(process.env.DATABASE_URL || '')
assert.ok(url.hostname === '127.0.0.1' && url.pathname === '/kucafe_qr_test', 'No production fixtures')
const base='http://127.0.0.1:3203',db=getDb(),userId=randomUUID(),fixture=randomUUID().slice(0,8),results:object[]=[]
let placeId=0,completed=false
await mkdir('var/qa/qr-channels',{recursive:true})
try {
  await db.insert(appUser).values({id:userId,role:'owner',name:'QA owner',phone:'09123456782',phoneVerifiedAt:new Date()})
  const [p]=await db.insert(place).values({slug:`qa-qr-ui-${fixture}`,name:'QA کافه آزمایشی',nameNormalized:'qa',status:'published',address:'مشهد'});placeId=p.insertId
  await db.insert(userPlaceRole).values({userId,placeId,role:'owner'})
  const [section]=await db.insert(menuSection).values({placeId,name:'قهوه تست',branchScope:'branch'})
  await db.insert(menuItem).values({placeId,sectionId:section.insertId,publicId:`qa_qr_${fixture}`,name:'لاته تست',nameNormalized:'لاته تست',price:100000})
  const sessionId=await createAuthSession({userId,method:'otp',expiresAt:new Date(Date.now()+3600000)})
  const cookie={name:SESSION_COOKIE,value:createSessionToken({userId,sessionId,role:'owner',phone:'09123456782'}),url:base,httpOnly:true,sameSite:'Lax' as const}
  for(const [engine,launcher] of Object.entries({chromium,firefox,webkit})) {
    const browser=await launcher.launch()
    try {for(const width of [360,390,768,1440]) {
      const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});await context.addCookies([cookie]);await context.route('**/api/track**',route=>route.fulfill({status:204}))
      const page=await context.newPage(),errors:string[]=[];page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message))
      await page.goto(`${base}/admin/venue?place=${placeId}&tab=qr`,{waitUntil:'networkidle',timeout:90000})
      await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),width===360||width===1440?'dark':'light')
      const panel=page.locator('section[aria-labelledby="qr-channels-title"]'),label=`میز ${engine} ${width}`
      await panel.getByLabel('نام QR',{exact:true}).fill(label)
      await panel.getByLabel('نوع QR',{exact:true}).selectOption('table')
      await panel.getByRole('button',{name:'ساخت QR اختصاصی',exact:true}).click()
      const row=panel.locator('li').filter({has:page.getByRole('heading',{name:label,exact:true})})
      await row.waitFor()
      const token=(await db.select().from(venueQrLink).where(and(eq(venueQrLink.placeId,placeId),eq(venueQrLink.label,label))))[0]!.token
      assert.equal(await row.getByRole('button',{name:'توقف این QR'}).isDisabled(),true)
      const svg=await context.request.get(`${base}/api/qr/link/${token}?download=1`);assert.equal(svg.status(),200);assert.match(svg.headers()['content-disposition']!,/attachment/);assert.match(await svg.text(),/<svg/)
      assert.equal((await db.select().from(venueQrLink).where(eq(venueQrLink.token,token)))[0]!.opens,0)
      await row.getByRole('checkbox').check();await row.getByRole('button',{name:'توقف این QR'}).click()
      await row.getByRole('button',{name:'فعال‌سازی همان QR'}).waitFor()
      assert.equal((await context.request.get(`${base}/q/${token}`,{maxRedirects:0})).status(),404)
      await row.getByRole('button',{name:'فعال‌سازی همان QR'}).click();await row.getByRole('button',{name:'توقف این QR'}).waitFor()
      await row.getByLabel(`لینک ${label}`,{exact:true}).waitFor();assert.equal(await row.getByLabel(`لینک ${label}`,{exact:true}).inputValue(),`${base}/q/${token}`)
      const head=await context.request.head(`${base}/q/${token}`,{maxRedirects:0});assert.equal(head.status(),302);assert.match(head.headers()['x-robots-tag']!,/noindex/)
      assert.ok(head.headers().location?.includes('?menu=1'));assert.equal((await db.select().from(venueQrLink).where(eq(venueQrLink.token,token)))[0]!.opens,0)
      const link=row.getByRole('link',{name:`دانلود SVG برای چاپ ${label}`,exact:true})
      await link.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');assert.notEqual(await link.evaluate(el=>getComputedStyle(el).outlineStyle),'none')
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
      assert.equal((await context.request.get(`${base}/api/qr/cafe/qa-qr-ui-${fixture}`)).status(),200,'Old QR preserved')
      if(engine==='chromium'&&(width===390||width===1440))await panel.screenshot({path:`var/qa/qr-channels/${engine}-${width}.png`})
      assert.deepEqual(errors,[]);results.push({engine,width,pass:true,checks:['authenticated create/pause/resume','explicit pause confirmation','SVG download no count','stable token after resume','HEAD no count and noindex redirect','old QR preserved','RTL/no overflow/keyboard focus','no runtime error']});console.log('PASS QR panel',engine,width)
      await context.close()
    }}finally{await browser.close()}
  }
  const browser=await chromium.launch()
  try {
    const context=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'allow',userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'})
    await context.route('**/api/track**',route=>route.fulfill({status:204}))
    const page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
    const qr=(await db.select().from(venueQrLink).where(eq(venueQrLink.placeId,placeId)))[0]!
    await page.goto(`${base}/q/${qr.token}`,{waitUntil:'networkidle',timeout:90000})
    assert.ok(page.url().includes('?menu=1'));const picker=page.getByRole('dialog',{name:'دسته‌بندی‌های منو',exact:true});await picker.waitFor()
    await picker.getByRole('button',{name:/قهوه تست/}).click();await page.getByText('لاته تست',{exact:true}).first().waitFor()
    await page.goto(`${base}/q/${qr.token}`,{waitUntil:'networkidle'});assert.equal((await db.select().from(venueQrLink).where(eq(venueQrLink.id,qr.id)))[0]!.opens,1,'Signed cookie avoids repeated opening count')
    assert.deepEqual(errors,[]);results.push({engine:'chromium',width:390,pass:true,scope:'service worker allowed; Android UA simulation, not physical device',checks:['QR redirects straight into menu category picker','category and real product displayed','repeat open deduped','no runtime error']})
    await context.close()
  }finally{await browser.close()}
  completed=true;console.log(`PASS ${results.length} real QR browser journeys`)
}finally{
  await writeFile('var/qa/qr-channels/browser.json',JSON.stringify({completed,scope:'Real Next.js/actions with isolated DB and synthetic owner; no physical QR scan or production writes',results},null,2))
  if(placeId){const rows=await db.select({id:venueQrLink.id}).from(venueQrLink).where(eq(venueQrLink.placeId,placeId));if(rows.length)await db.delete(dailyStat).where(and(eq(dailyStat.metric,'qr_opens'),inArray(dailyStat.refId,rows.map(row=>String(row.id)))));await db.delete(menuItem).where(eq(menuItem.placeId,placeId));await db.delete(menuSection).where(eq(menuSection.placeId,placeId));await db.delete(place).where(eq(place.id,placeId))}
  await db.delete(auditLog).where(eq(auditLog.actorUserId,userId));await db.delete(appUser).where(eq(appUser.id,userId));await closeDb()
}
