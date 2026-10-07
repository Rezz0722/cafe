import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { getDb, closeDb } from '@/db/client'
import { appUser, auditLog, dailyStat, place, setting, userPlaceRole, venueQrLink } from '@/db/schema'
import { invalidateSettings } from '@/core/settings/store'
import { listQrChannels, manageQrChannel, resolveQrChannel, recordQrOpen } from './channels'
import { GET, HEAD } from '@/app/q/[token]/route'
import { GET as svgGet } from '@/app/api/qr/link/[token]/route'

test('real MariaDB QR scope, printed stability, redirect privacy and aggregate atomicity', { skip: process.env.KUCAFE_QR_DB_TEST !== '1' }, async t => {
  const url = new URL(process.env.DATABASE_URL || '')
  assert.ok(url.hostname === '127.0.0.1' && (url.pathname === '/kucafe_qr_test' || (process.env.GITHUB_ACTIONS === 'true' && url.pathname === '/kucafe')), 'Disposable DB only')
  const db=getDb(), owner=randomUUID(), other=randomUUID(), fixture=randomUUID().replaceAll('-','').slice(0,10), actor={userId:owner,label:'QA owner'}, ids:number[]=[], qrIds:number[]=[]
  const trigger=`qa_qr_${fixture}`
  const revision=async()=>String((await db.select({revision:place.revision}).from(place).where(eq(place.id,ids[0]!)))[0]!.revision)
  const input=async(operation:string,id=0,label='میز ۱')=>({placeId:ids[0]!,revision:await revision(),operation,id,label,kind:'table'})
  const request=(token:string,headers:Record<string,string>={},method='GET')=>new Request(`http://127.0.0.1:3203/q/${token}`,{method,headers:{'user-agent':'Mozilla/5.0 Android',...headers}})
  const options=(token:string)=>({params:Promise.resolve({token})})
  const originalSettings=await db.select().from(setting).where(eq(setting.key,'trackPageViews'))
  let token=''
  try {
    await db.insert(appUser).values([{id:owner,name:'QA owner',role:'owner'},{id:other,name:'QA other',role:'owner'}])
    for(const branch of ['a','b']) {const [row]=await db.insert(place).values({slug:`qa-qr-${fixture}-${branch}`,name:'QA QR',nameNormalized:'qa',status:'published'});ids.push(row.insertId)}
    await db.insert(userPlaceRole).values([{userId:owner,placeId:ids[0]!,role:'owner'},{userId:other,placeId:ids[1]!,role:'owner'}])
    await db.insert(setting).values({key:'trackPageViews',value:true}).onDuplicateKeyUpdate({set:{value:true}});invalidateSettings()
    await t.test('create race yields one token; stale revision and duplicate label denied',async()=>{
      const data=await input('create'), results=await Promise.allSettled([manageQrChannel(data,actor),manageQrChannel(data,actor)])
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
      const channels=await listQrChannels(ids[0]!,actor);assert.equal(channels.length,1);token=channels[0]!.token;qrIds.push(channels[0]!.id);assert.match(token,/^[a-f0-9]{32}$/)
      await assert.rejects(manageQrChannel(await input('create',0,'میز 1'),actor));assert.equal(await revision(),'1')
    })
    await t.test('foreign place/QR, view-as, blocked, temporary password and revoked roles denied',async()=>{
      await assert.rejects(listQrChannels(ids[0]!,{userId:other,label:'other'}))
      await assert.rejects(manageQrChannel(await input('pause',qrIds[0]!),{...actor,onBehalfOf:other}))
      const foreign={...(await input('pause',qrIds[0]!)),placeId:ids[1]!,revision:'0'}
      await assert.rejects(manageQrChannel(foreign,{userId:other,label:'other'}))
      for(const patch of [{status:'blocked' as const},{mustChangePassword:true}]) {
        await db.update(appUser).set(patch).where(eq(appUser.id,owner));await assert.rejects(manageQrChannel(await input('pause',qrIds[0]!),actor))
        await db.update(appUser).set({status:'active',mustChangePassword:false}).where(eq(appUser.id,owner))
      }
      await db.update(userPlaceRole).set({status:'revoked'}).where(eq(userPlaceRole.userId,owner));await assert.rejects(manageQrChannel(await input('pause',qrIds[0]!),actor))
      await db.update(userPlaceRole).set({status:'active'}).where(eq(userPlaceRole.userId,owner))
    })
    await t.test('SVG and HEAD do not count; redirect has noindex/no-store, valid cookie dedupes',async()=>{
      const svg=await svgGet(request(token),options(token));assert.equal(svg.status,200);assert.match(await svg.text(),/<svg/);assert.equal(svg.headers.get('cache-control'),'no-store')
      assert.equal((await HEAD(request(token,{},'HEAD'),options(token))).status,302)
      let channels=await listQrChannels(ids[0]!,actor);assert.equal(channels[0]!.opens,0)
      const opened=await GET(request(token),options(token));assert.equal(opened.status,302);assert.ok(opened.headers.get('location')?.endsWith('?menu=1'))
      assert.match(opened.headers.get('x-robots-tag')!,/noindex/);assert.match(opened.headers.get('cache-control')!,/no-store/)
      const cookie=opened.headers.get('set-cookie')!;assert.ok(cookie);await GET(request(token,{cookie:cookie.split(';')[0]!}),options(token))
      channels=await listQrChannels(ids[0]!,actor);assert.equal(channels[0]!.opens,1);assert.equal(channels[0]!.recentOpens,1)
    })
    await t.test('bots/prefetch/privacy and disabled setting do not count or create cookie',async()=>{
      const exclusions:Record<string,string>[]=[{'user-agent':'Googlebot'},{purpose:'prefetch'},{dnt:'1'},{'sec-gpc':'1'}]
      for(const headers of exclusions) {const response=await GET(request(token,headers),options(token));assert.equal(response.status,302);assert.equal(response.headers.get('set-cookie'),null)}
      await db.update(setting).set({value:false}).where(eq(setting.key,'trackPageViews'));invalidateSettings()
      const response=await GET(request(token),options(token));assert.equal(response.headers.get('set-cookie'),null)
      assert.equal((await listQrChannels(ids[0]!,actor))[0]!.opens,1)
      await db.update(setting).set({value:true}).where(eq(setting.key,'trackPageViews'));invalidateSettings()
    })
    await t.test('pause/private status deny; resume and slug changes preserve the printed token',async()=>{
      await manageQrChannel(await input('pause',qrIds[0]!),actor);assert.equal(await resolveQrChannel(token),null);assert.equal((await GET(request(token),options(token))).status,404)
      await assert.rejects(manageQrChannel(await input('pause',qrIds[0]!),actor))
      await manageQrChannel(await input('resume',qrIds[0]!),actor)
      await db.update(place).set({slug:`qa-qr-${fixture}-renamed`,status:'draft'}).where(eq(place.id,ids[0]!));assert.equal(await resolveQrChannel(token),null)
      await db.update(place).set({status:'temporarily_closed'}).where(eq(place.id,ids[0]!));assert.equal((await resolveQrChannel(token))!.slug,`qa-qr-${fixture}-renamed`)
      assert.equal((await listQrChannels(ids[0]!,actor))[0]!.token,token)
    })
    await t.test('audit failure rolls back QR and revision, stats failure preserves redirect',async()=>{
      const beforeRevision=await revision(),before=(await listQrChannels(ids[0]!,actor)).length
      await db.execute(sql.raw(`CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_log FOR EACH ROW BEGIN IF NEW.action = 'qr.create' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'QA QR rollback'; END IF; END`))
      try {await assert.rejects(manageQrChannel(await input('create',0,'میز ۲'),actor));assert.equal(await revision(),beforeRevision);assert.equal((await listQrChannels(ids[0]!,actor)).length,before)}finally{await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${trigger}`))}
      await db.execute(sql.raw(`CREATE TRIGGER ${trigger} BEFORE INSERT ON daily_stat FOR EACH ROW BEGIN IF NEW.metric = 'qr_opens' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'QA stats rollback'; END IF; END`))
      try {assert.equal((await GET(request(token),options(token))).status,302);assert.equal((await listQrChannels(ids[0]!,actor))[0]!.opens,1)}finally{await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${trigger}`))}
    })
    await t.test('concurrent aggregate updates are atomic and only 30 UTC days are displayed',async()=>{
      await Promise.all(Array.from({length:6},()=>recordQrOpen(qrIds[0]!)))
      await recordQrOpen(qrIds[0]!,new Date('2020-01-01T23:00:00Z'))
      const channels=await listQrChannels(ids[0]!,actor);assert.equal(channels[0]!.opens,8);assert.equal(channels[0]!.recentOpens,7)
    })
    await t.test('50-code cap is enforced including paused codes',async()=>{
      await db.insert(venueQrLink).values(Array.from({length:49},(_,i)=>({placeId:ids[0]!,token:randomUUID().replaceAll('-',''),label:`QR ${i}`,labelKey:`qr ${i}`,kind:'channel' as const,active:false})))
      await assert.rejects(manageQrChannel(await input('create',0,'میز اضافه'),actor));assert.equal((await listQrChannels(ids[0]!,actor)).length,50)
    })
    await t.test('channel creation in another authorized branch is independent; invalid kinds denied',async()=>{
      const secondActor={userId:other,label:'other'}, data={placeId:ids[1]!,revision:'0',operation:'create',id:0,label:'اینستاگرام',kind:'channel'}
      await assert.rejects(manageQrChannel({...data,kind:'external'},secondActor))
      await manageQrChannel(data,secondActor)
      const channels=await listQrChannels(ids[1]!,secondActor);assert.equal(channels.length,1);assert.equal(channels[0]!.kind,'channel');assert.notEqual(channels[0]!.token,token)
      assert.equal((await listQrChannels(ids[0]!,actor)).length,50)
    })
  } finally {
    await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${trigger}`))
    if(ids.length){const ownedQr=await db.select({id:venueQrLink.id}).from(venueQrLink).where(inArray(venueQrLink.placeId,ids));if(ownedQr.length)await db.delete(dailyStat).where(and(eq(dailyStat.metric,'qr_opens'),inArray(dailyStat.refId,ownedQr.map(row=>String(row.id))))) }
    await db.delete(auditLog).where(inArray(auditLog.actorUserId,[owner,other]));if(ids.length)await db.delete(place).where(inArray(place.id,ids));await db.delete(appUser).where(inArray(appUser.id,[owner,other]))
    await db.delete(setting).where(eq(setting.key,'trackPageViews'));if(originalSettings.length)await db.insert(setting).values(originalSettings);invalidateSettings();await closeDb()
  }
})
