/** Safe integration: all test data is created inside an outer transaction and rolled back. */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {and,eq,sql} from 'drizzle-orm'
import {getDb,closeDb,withDbTransaction,afterDbCommit} from '../src/db/connection'
import {place,menuSection,menuItem,menuItemVariant,review,reviewReply,appUser,auditLog,clubMembership,clubCode,clubOffer,placeHours} from '../src/db/schema'
import {runManagedWrite} from '../src/core/places/managedWrite'
import {makePricePlan,applyPricePlan,restorePriceChange} from '../src/core/places/menuPrices'
import {saveSettings,getSettings} from '../src/core/settings/store'
import {replacePlaceHours,replyToReview,updatePlaceInfo} from '../src/core/places/manage'
import {broadcastOffer,issueCode,redeemCode} from '../src/core/club/service'
import {changeClubOffer,getClubManageData} from '../src/core/club/manage'
import {getAuditHistory} from '../src/core/admin/history'
const marker=randomUUID(), rollback=new Error('Expected test rollback'),actor={userId:randomUUID(),label:'آزمایش پنل'}
let effects=0,checks=0
function check(condition:unknown,message:string){assert.ok(condition,message);checks++}
try{
 await assert.rejects(withDbTransaction(async()=>{
  const db=getDb()
  const [fixture]=await db.insert(place).values({slug:`qa-admin-${marker}`,name:'آزمایش پنل',nameNormalized:'آزمایش پنل',status:'draft'}).$returningId();assert.ok(fixture)
  const id=fixture.id
  await db.insert(appUser).values({id:actor.userId,name:'عضو آزمایشی',role:'customer'})
  const [section]=await db.insert(menuSection).values({placeId:id,name:'منوی همین شعبه',branchScope:'branch'}).$returningId()
  const [foreign]=await db.insert(menuSection).values({placeId:id,name:'شعبه دیگر',branchScope:'other_branch'}).$returningId()
  const ids=[] as number[]
  for(const [name,price,sectionId] of [['قیمت عادی',100000,section.id],['چند سایز',200000,section.id],['رایگان',0,section.id],['نامعلوم',null,section.id],['شعبه دیگر',900000,foreign.id]] as const){const [item]=await db.insert(menuItem).values({publicId:String(1000000000+(parseInt(marker.slice(0,8),16)%100000000)+ids.length),placeId:id,sectionId,name,nameNormalized:name,price,priceUnknown:price===null,priceUpdatedAt:new Date('2026-01-01T00:00:00Z')}).$returningId();ids.push(item.id)}
  await db.insert(menuItemVariant).values([{itemId:ids[1],label:'کوچک',price:200000},{itemId:ids[1],label:'بزرگ',price:300000}])
  const plan=await makePricePlan(id,10,{scope:'all'})
  check(plan.itemCount===2&&plan.variantCount===2&&plan.changes.length===3,'Item and variant counts must differ and foreign/free/unknown items stay unchanged')
  const rejected=await runManagedWrite(async()=>{await applyPricePlan(id,plan,'stale',actor);return {ok:true}})
  check(!rejected.ok,'Stale preview must fail')
  await applyPricePlan(id,plan,plan.fingerprint,actor)
  const [changed]=await db.select().from(menuItem).where(eq(menuItem.id,ids[1]));check(changed.price===220000,'Base variant price recalculates')
  const [entry]=await db.select().from(auditLog).where(and(eq(auditLog.entityId,String(id)),eq(auditLog.action,'menu.bulk_price')));assert.ok(entry)
  const history=await getAuditHistory({placeId:id});check('rows' in history&&history.rows?.length===1,'Scoped history is visible')
  await restorePriceChange(id,entry.id,actor)
  const [restored]=await db.select().from(menuItem).where(eq(menuItem.id,ids[1]));check(restored.price===200000,'Undo restores variant base price')
  check(!(await runManagedWrite(async()=>{await restorePriceChange(id,entry.id,actor);return {ok:true}})).ok,'Undo cannot run twice')
  const second=await makePricePlan(id,20,{scope:'items',itemIds:[ids[0]]});await applyPricePlan(id,second,second.fingerprint,actor)
  const [latest]=await db.select({id:auditLog.id}).from(auditLog).where(eq(auditLog.action,'menu.bulk_price')).orderBy(sql`${auditLog.id} DESC`).limit(1)
  await db.update(menuItem).set({price:555000}).where(eq(menuItem.id,ids[0]))
  check(!(await runManagedWrite(async()=>{await restorePriceChange(id,latest.id,actor);return {ok:true}})).ok,'Undo cannot overwrite a later manual price')
  const originalSettings=await getSettings()
  const invalid=await saveSettings({stalePriceDays:originalSettings.stalePriceDays===90?91:90,priceTierCheapMax:'not-a-number'},actor)
  check(!invalid.ok&&invalid.saved.length===0,'Invalid settings cannot partially save')
  check((await getSettings()).stalePriceDays===originalSettings.stalePriceDays,'Settings remain unchanged after invalid save')
  await replacePlaceHours(id,[{dow:0,shiftIndex:0,opensAt:'09:00',closesAt:'22:00',closed:false}],actor)
  const failed=await runManagedWrite(async()=>{await replacePlaceHours(id,[{dow:0,shiftIndex:0,opensAt:'10:00',closesAt:'23:00',closed:false}],actor);afterDbCommit(()=>effects++);return {ok:false,error:'Simulated failure'}})
  check(!failed.ok,'Error result rolls back')
  const [hours]=await db.select().from(placeHours).where(eq(placeHours.placeId,id));check(hours.opensAt?.startsWith('09:00'),'Delete + replace hours rolls back atomically')
  check(effects===0,'Rolled-back afterCommit hooks never run')
  const [reviewRow]=await db.insert(review).values({placeId:id,userId:actor.userId,stars:4,status:'approved',text:'آزمایش پاسخ'}).$returningId()
  check((await replyToReview(reviewRow.id,'پاسخ آزمایشی',actor,true)).ok,'Reply can await moderation')
  check(!(await replyToReview(reviewRow.id,'پاسخ تکراری',actor,true)).ok,'Duplicate pending reply rejected')
  const [reply]=await db.select().from(reviewReply).where(eq(reviewReply.reviewId,reviewRow.id));check(reply.status==='pending','Reply status is accurate')
  await db.update(reviewReply).set({status:'rejected'}).where(eq(reviewReply.id,reply.id))
  check((await replyToReview(reviewRow.id,'پاسخ اصلاح‌شده',actor,true)).ok,'Rejected reply allows a new response')
  const emptyCoords=await updatePlaceInfo(id,{lat:null,lng:null},actor);check(emptyCoords.ok,'Location can be cleared')
  check(!(await updatePlaceInfo(id,{lat:999,lng:0},actor)).ok,'Invalid geographic coordinates rejected')
  await db.insert(clubMembership).values({userId:actor.userId,placeId:id,status:'active'})
  const [offer]=await db.insert(clubOffer).values({placeId:id,title:'آزمایش تخفیف',discountLabel:'۱۰٪'}).$returningId()
  const sent=await broadcastOffer(id,offer.id);check(sent.sent===1,'Broadcast sends to consented member')
  const again=await broadcastOffer(id,offer.id);check(again.sent===0&&again.alreadySent===1,'Broadcast is idempotent')
  const code=await issueCode({placeId:id,offerId:offer.id,userId:actor.userId});check(code.startsWith('KU-'),'Issue reuses existing code')
  check(!(await runManagedWrite(async()=>{await changeClubOffer(id,offer.id,'edit',{title:'عوض‌شده',discountLabel:'۲۰٪',description:'',expiresAt:''});return {ok:true}})).ok,'Issued offer terms cannot change')
  check(await redeemCode({placeId:id,code,actorId:actor.userId}),'Code redeems once')
  check(!(await redeemCode({placeId:id,code,actorId:actor.userId})),'Code cannot redeem twice')
  const [cancelOffer]=await db.insert(clubOffer).values({placeId:id,title:'توقف تخفیف',discountLabel:'۱۵٪'}).$returningId();await broadcastOffer(id,cancelOffer.id)
  await changeClubOffer(id,cancelOffer.id,'cancel',{title:'',discountLabel:'',description:'',expiresAt:''})
  const [cancelled]=await db.select().from(clubCode).where(eq(clubCode.offerId,cancelOffer.id));check(cancelled.status==='cancelled','Stopping offer cancels unused codes')
  check((await getClubManageData(id,'members')).total===1,'Member pagination uses consent and active status')
  const [editableOffer]=await db.insert(clubOffer).values({placeId:id,title:'پیشنهاد قابل ویرایش',discountLabel:'۵٪'}).$returningId()
  const managedOffers=await getClubManageData(id,'offers')
  const editable=managedOffers.rows.find(row=>'id' in row&&row.id===editableOffer.id)
  check(editable&&'issued' in editable&&editable.issued===0,'A zero code count is numeric, so an unissued offer remains editable')
  await db.update(appUser).set({status:'blocked'}).where(eq(appUser.id,actor.userId))
  check((await getClubManageData(id,'members')).total===0,'Inactive member personal data disappears')
  afterDbCommit(()=>effects++)
  throw rollback
 }),error=>error===rollback)
 const [left]=await getDb().select({id:place.id}).from(place).where(eq(place.slug,`qa-admin-${marker}`));check(!left,'No fixture cafe remains')
 const [leftUser]=await getDb().select({id:appUser.id}).from(appUser).where(eq(appUser.id,actor.userId));check(!leftUser,'No fixture user remains')
 check(effects===0,'Outer rollback discards success hooks')
 console.log(`PASS: ${checks} integration assertions; all fixture data rolled back; no scrape executed.`)
}finally{await closeDb()}
