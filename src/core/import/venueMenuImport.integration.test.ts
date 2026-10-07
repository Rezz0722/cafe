import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { appUser, auditLog, menuItem, menuSection, place, userPlaceRole } from '@/db/schema'
import { applyVenueMenuImport, previewVenueMenuImport } from './venueMenuImport'

test('real MariaDB menu import: signed preview, authorization, concurrency and rollback', {skip:process.env.KUCAFE_MENU_IMPORT_DB_TEST !== '1'}, async t => {
  const url = new URL(process.env.DATABASE_URL || '')
  assert.ok(url.hostname === '127.0.0.1' && (url.pathname === '/kucafe_menu_import_test' || (process.env.GITHUB_ACTIONS === 'true' && url.pathname === '/kucafe')), 'Disposable database required; production forbidden')
  const db = getDb(), owner = randomUUID(), other = randomUUID(), admin = randomUUID(), fixture = randomUUID().replaceAll('-','').slice(0,12)
  const actor = {userId:owner,label:'QA owner'}, secret = `test-only-${randomUUID()}`
  const ids:number[] = [], sections:number[] = [], trigger = `qa_import_${fixture}`
  let input:{placeId:number;sectionId:number;revision:string;text:string;delimiter:string}, token=''
  const snapshot = async () => ({ items: await db.select().from(menuItem).where(eq(menuItem.placeId,ids[0]!)), venue:(await db.select().from(place).where(eq(place.id,ids[0]!)))[0], audits:await db.select().from(auditLog).where(eq(auditLog.actorUserId,owner)) })
  try {
    await db.insert(appUser).values([{id:owner,name:'QA owner',role:'owner'},{id:other,name:'QA other',role:'owner'},{id:admin,name:'QA admin',role:'admin'}])
    for(const branch of ['a','b']) { const [r]=await db.insert(place).values({slug:`qa-import-${fixture}-${branch}`,name:`QA ${branch}`,nameNormalized:`QA ${branch}`,status:'published'}); ids.push(r.insertId) }
    await db.insert(userPlaceRole).values([{userId:owner,placeId:ids[0]!,role:'owner'},{userId:other,placeId:ids[1]!,role:'owner'}])
    for(const [placeId,scope] of [[ids[0]!,'branch'],[ids[1]!,'branch'],[ids[0]!,'unverified']] as const) { const [r]=await db.insert(menuSection).values({placeId,name:`دسته ${sections.length}`,branchScope:scope});sections.push(r.insertId) }
    await db.insert(menuItem).values({placeId:ids[0]!,sectionId:sections[0]!,publicId:`qa_${fixture}`,name:'لاته',nameNormalized:'لاته',price:100000})
    input={placeId:ids[0]!,sectionId:sections[0]!,revision:'0',text:'name,price,description\nلاته,120000,\nچای,,\nجدید,۲۰۰۰۰,\nخراب,-1,',delimiter:','}
    await t.test('preview has zero writes and marks duplicate/invalid rows',async()=>{
      const before=await snapshot(), preview=await previewVenueMenuImport(input,actor,secret)
      assert.equal(preview.rows[0]!.duplicate,true); assert.ok(preview.rows[3]!.error)
      token=preview.token;assert.deepEqual(await snapshot(),before)
    })
    await t.test('foreign branch, quarantined section, view-as and blocked account denied',async()=>{
      await assert.rejects(previewVenueMenuImport({...input,sectionId:sections[1]!},actor,secret))
      await assert.rejects(previewVenueMenuImport({...input,sectionId:sections[2]!},actor,secret))
      await assert.rejects(previewVenueMenuImport(input,{userId:other,label:'other'},secret))
      await assert.rejects(previewVenueMenuImport(input,{...actor,onBehalfOf:admin},secret))
      await db.update(appUser).set({status:'blocked'}).where(eq(appUser.id,owner))
      await assert.rejects(applyVenueMenuImport(input,actor,token,'[1]',secret))
      await db.update(appUser).set({status:'active'}).where(eq(appUser.id,owner))
    })
    await t.test('tampered file/token, other user, expiry, invalid and duplicate selection denied',async()=>{
      await assert.rejects(applyVenueMenuImport({...input,text:input.text.replace('۲۰۰۰۰','۳۰۰۰۰')},actor,token,'[2]',secret))
      await assert.rejects(applyVenueMenuImport(input,actor,token.slice(0,-1)+'x','[1]',secret))
      await assert.rejects(applyVenueMenuImport(input,{userId:admin,label:'admin'},token,'[1]',secret))
      await assert.rejects(applyVenueMenuImport(input,actor,token,'[1]',secret,Date.now()+11*60_000))
      for(const selected of ['[0]','[3]','[1,1]','[99]']) await assert.rejects(applyVenueMenuImport(input,actor,token,selected,secret))
      assert.equal((await snapshot()).items.length,1)
    })
    await t.test('role revocation after preview is checked again on apply',async()=>{
      await db.update(userPlaceRole).set({status:'revoked'}).where(and(eq(userPlaceRole.userId,owner),eq(userPlaceRole.placeId,ids[0]!)))
      await assert.rejects(applyVenueMenuImport(input,actor,token,'[1]',secret))
      await db.update(userPlaceRole).set({status:'active'}).where(and(eq(userPlaceRole.userId,owner),eq(userPlaceRole.placeId,ids[0]!)))
    })
    await t.test('simultaneous apply adds once, preserves old price and isolates other branch',async()=>{
      const results=await Promise.allSettled([applyVenueMenuImport(input,actor,token,'[1,2]',secret),applyVenueMenuImport(input,actor,token,'[1,2]',secret)])
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
      const after=await snapshot(); assert.equal(after.items.length,3)
      assert.equal(after.items.find(row=>row.name==='لاته')!.price,100000)
      assert.equal(after.items.find(row=>row.name==='چای')!.price,null)
      assert.equal(after.items.find(row=>row.name==='جدید')!.price,20000)
      assert.equal(after.venue!.revision,1)
      assert.equal(after.audits.filter(row=>row.action==='menu.import.create').length,1)
      assert.equal((await db.select().from(menuItem).where(eq(menuItem.placeId,ids[1]!))).length,0)
      await assert.rejects(applyVenueMenuImport(input,actor,token,'[1,2]',secret))
    })
    await t.test('failure in final audit rolls back all rows and derived data',async()=>{
      const fresh={...input,revision:'1',text:'name,price,description\nتست برگشت,1,\nتست دوم,2,'}, preview=await previewVenueMenuImport(fresh,actor,secret), before=await snapshot()
      await db.execute(sql.raw(`CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_log FOR EACH ROW BEGIN IF NEW.action = 'menu.import.create' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'QA atomic rollback'; END IF; END`))
      try { await assert.rejects(applyVenueMenuImport(fresh,actor,preview.token,'[0,1]',secret));assert.deepEqual(await snapshot(),before) }
      finally {await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${trigger}`))}
    })
    await t.test('archived duplicates remain blocked; no resurrection',async()=>{
      await db.update(menuItem).set({archivedAt:new Date()}).where(and(eq(menuItem.placeId,ids[0]!),eq(menuItem.name,'لاته')))
      const preview=await previewVenueMenuImport({...input,revision:'1'},actor,secret)
      assert.equal(preview.rows[0]!.duplicate,true)
    })
  } finally {
    await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${trigger}`))
    await db.delete(auditLog).where(inArray(auditLog.actorUserId,[owner,other,admin]))
    if(ids.length){await db.delete(menuItem).where(inArray(menuItem.placeId,ids));await db.delete(menuSection).where(inArray(menuSection.placeId,ids));await db.delete(place).where(inArray(place.id,ids))}
    await db.delete(appUser).where(inArray(appUser.id,[owner,other,admin]));await closeDb()
  }
})
