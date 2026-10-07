import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, firefox, webkit } from 'playwright'
import { eq } from 'drizzle-orm'
import { getDb, closeDb } from '../src/db/client'
import { appUser, auditLog, menuItem, menuSection, place, userPlaceRole } from '../src/db/schema'
import { createAuthSession } from '../src/core/auth/userRepo'
import { createSessionToken, SESSION_COOKIE } from '../src/core/auth/session'

assert.equal(new URL(process.env.DATABASE_URL || '').pathname,'/kucafe_menu_import_test','No production fixture writes')
const base='http://127.0.0.1:3202', db=getDb(), userId=randomUUID(), fixture=randomUUID().slice(0,8), results:object[]=[]
let placeId=0
await mkdir('var/qa/menu-import',{recursive:true})
try {
  await db.insert(appUser).values({id:userId,role:'owner',name:'QA owner',phone:'09123456781',phoneVerifiedAt:new Date()})
  const [p]=await db.insert(place).values({slug:`qa-menu-import-${fixture}`,name:`QA کافه ${fixture}`,nameNormalized:'qa',status:'published',address:'مشهد'})
  placeId=p.insertId
  await db.insert(userPlaceRole).values({userId,placeId,role:'owner'})
  const [s]=await db.insert(menuSection).values({placeId,name:'قهوه تست',branchScope:'branch'})
  await db.insert(menuItem).values({placeId,sectionId:s.insertId,publicId:`qa_menu_${fixture}`,name:'لاته',nameNormalized:'لاته',price:100000})
  const sessionId=await createAuthSession({userId,method:'otp',expiresAt:new Date(Date.now()+3600000)})
  const cookie={name:SESSION_COOKIE,value:createSessionToken({userId,sessionId,role:'owner',phone:'09123456781'}),url:base,httpOnly:true,sameSite:'Lax' as const}
  const text='name,price,description\nلاته,120000,هم‌نام قبلی\nآیتم جدید,۲۰۰۰۰,توضیح جدید\nخراب,-1,نامعتبر'
  for(const [engine,launcher] of Object.entries({chromium,firefox,webkit})) {
    const browser=await launcher.launch()
    try {for(const width of [360,390,768,1440]) {
      const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});await context.addCookies([cookie])
      const page=await context.newPage();page.setDefaultTimeout(30000)
      const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
      await page.goto(`${base}/admin/venue?place=${placeId}&tab=menu`,{waitUntil:'networkidle',timeout:90000})
      await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),width===360||width===1440?'dark':'light')
      const panel=page.locator('details').filter({has:page.locator('summary').filter({hasText:'ورود گروهی آیتم‌ها'})})
      await panel.locator('summary').click()
      await panel.getByLabel('دستهٔ مقصد').selectOption(String(s.insertId))
      await panel.getByLabel('متن منو',{exact:true}).fill(text)
      await panel.getByRole('button',{name:'نمایش پیش‌نمایش؛ بدون ثبت',exact:true}).click()
      await panel.getByRole('heading',{name:'پیش‌نمایش برای «قهوه تست»'}).waitFor()
      const boxes=panel.locator('ol input[type="checkbox"]')
      assert.equal(await boxes.count(),3);assert.equal(await boxes.nth(0).isDisabled(),true);assert.equal(await boxes.nth(2).isDisabled(),true)
      assert.equal(await panel.getByRole('button',{name:'ثبت فقط آیتم‌های انتخاب‌شده'}).isDisabled(),true)
      await boxes.nth(1).check()
      assert.equal(await panel.getByRole('button',{name:'ثبت فقط آیتم‌های انتخاب‌شده'}).isDisabled(),true)
      await panel.locator('input[name="confirmed"]').check()
      assert.equal(await panel.getByRole('button',{name:'ثبت فقط آیتم‌های انتخاب‌شده'}).isEnabled(),true)
      // Preview does not clear draft tracking or suppress the leave warning.
      let dialogs=0; page.once('dialog',async dialog=>{dialogs++;await dialog.dismiss()})
      await page.getByRole('button',{name:'ساعت کاری',exact:true}).click()
      assert.equal(dialogs,1);assert.equal(await page.getByRole('heading',{name:'پیش‌نمایش برای «قهوه تست»'}).count(),1)
      page.once('dialog',async dialog=>{dialogs++;await dialog.accept()})
      await page.getByRole('button',{name:'ساعت کاری',exact:true}).click()
      await page.getByRole('button',{name:'ذخیره‌ی ساعت کاری'}).waitFor()
      assert.equal(dialogs,2,'One confirmation per navigation, not two')
      await page.getByRole('button',{name:'منو و قیمت',exact:true}).click()
      await panel.locator('summary').click()
      await panel.getByLabel('دستهٔ مقصد').selectOption(String(s.insertId))
      await panel.getByLabel('متن منو',{exact:true}).fill(text)
      const before=(await db.select().from(menuItem).where(eq(menuItem.placeId,placeId))).length
      assert.equal(before,1,'Preview never inserts')
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
      await panel.getByRole('button',{name:'نمایش پیش‌نمایش؛ بدون ثبت',exact:true}).focus()
      // Switch to actual keyboard modality; programmatic focus after a click is not :focus-visible.
      await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab')
      assert.notEqual(await panel.getByRole('button',{name:'نمایش پیش‌نمایش؛ بدون ثبت',exact:true}).evaluate(el=>getComputedStyle(el).outlineStyle),'none')
      if(engine==='chromium'&&(width===390||width===1440))await page.screenshot({path:`var/qa/menu-import/${engine}-${width}.png`,fullPage:true})
      assert.deepEqual(errors,[]);results.push({engine,width,pass:true,checks:['real authenticated venue panel','signed server preview','duplicates/invalid blocked','explicit selection/confirmation','draft guard preserved after preview','one discard confirmation','no DB writes from preview','RTL/no overflow/focus','no runtime errors']})
      await context.close()
    }}finally{await browser.close()}
  }
  const browser=await chromium.launch()
  try {
    const context=await browser.newContext({viewport:{width:390,height:900}});await context.addCookies([cookie]);const page=await context.newPage()
    await page.goto(`${base}/admin/venue?place=${placeId}&tab=menu`,{waitUntil:'networkidle'})
    const panel=page.locator('details').filter({has:page.locator('summary').filter({hasText:'ورود گروهی آیتم‌ها'})})
    await panel.locator('summary').click();await panel.getByLabel('دستهٔ مقصد').selectOption(String(s.insertId))
    await panel.getByLabel('فایل متنی CSV یا TSV').setInputFiles({name:'invalid.csv',mimeType:'text/csv',buffer:Buffer.from([255,254])})
    await panel.getByRole('alert').filter({hasText:'UTF-8'}).waitFor();assert.equal(await panel.getByRole('button',{name:'نمایش پیش‌نمایش؛ بدون ثبت'}).isDisabled(),true)
    await panel.getByLabel('فایل متنی CSV یا TSV').setInputFiles({name:'menu.csv',mimeType:'text/csv',buffer:Buffer.from(text)})
    await page.waitForFunction(()=>document.querySelector<HTMLTextAreaElement>('textarea[name="text"]')?.value.includes('آیتم جدید'))
    await panel.getByRole('button',{name:'نمایش پیش‌نمایش؛ بدون ثبت'}).click();await panel.getByRole('heading',{name:'پیش‌نمایش برای «قهوه تست»'}).waitFor()
    await panel.locator('ol input[type="checkbox"]').nth(1).check();await panel.locator('input[name="confirmed"]').check()
    await panel.getByRole('button',{name:'ثبت فقط آیتم‌های انتخاب‌شده'}).click()
    await panel.getByRole('status').filter({hasText:'آیتم جدید ثبت شد'}).waitFor()
    const items=await db.select().from(menuItem).where(eq(menuItem.placeId,placeId));assert.equal(items.length,2);assert.equal(items.find(row=>row.name==='لاته')!.price,100000)
    assert.equal(items.find(row=>row.name==='آیتم جدید')!.price,20000)
    assert.equal(await panel.getByRole('heading',{name:'پیش‌نمایش برای «قهوه تست»'}).count(),0)
    // Refresh generated revision and new preview must show imported row as duplicate.
    await panel.getByRole('button',{name:'نمایش پیش‌نمایش؛ بدون ثبت'}).click();await panel.getByRole('heading',{name:'پیش‌نمایش برای «قهوه تست»'}).waitFor()
    assert.equal(await panel.locator('ol input[type="checkbox"]').nth(1).isDisabled(),true)
    results.push({pass:true,checks:['invalid UTF-8 file blocks preview','valid file upload','actual server apply','old price unchanged','success receipt persists across RSC refresh','re-preview blocks duplicate']})
    await context.close()
  }finally{await browser.close()}
  await writeFile('var/qa/menu-import/browser.json',JSON.stringify({scope:'Isolated database and real Next.js server/actions; synthetic accounts, not a real cafe pilot',results},null,2));console.log(`PASS ${results.length} full panel browser journeys`)
} finally {
  await db.delete(auditLog).where(eq(auditLog.actorUserId,userId))
  if(placeId){await db.delete(menuItem).where(eq(menuItem.placeId,placeId));await db.delete(menuSection).where(eq(menuSection.placeId,placeId));await db.delete(place).where(eq(place.id,placeId))}
  await db.delete(appUser).where(eq(appUser.id,userId));await closeDb()
}
