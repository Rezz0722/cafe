import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {and,eq} from 'drizzle-orm'
import {getDb,closeDb} from '../src/db/connection'
import {place,appUser,clubMembership,clubOffer,clubCode,venueDiscount,menuSection,menuItem} from '../src/db/schema'
import {broadcastOffer,issueCode,redeemCode,listMyClub} from '../src/core/club/service'
import {saveVenueDiscount,getVenueDiscount,cancelVenueDiscount} from '../src/core/club/venueDiscounts'
import {getMenuItemByPublicId,listMenuItemCards} from '../src/core/items/queries'
const db=getDb(), users=[randomUUID(),randomUUID(),randomUUID()], suffix=randomUUID().slice(0,8)
let id:number|undefined
try{
 await db.insert(appUser).values(users.map((id,index)=>({id,username:`discount_qa_${suffix}_${index}`,name:'آزمون موقت تخفیف',role:'customer' as const})))
 const [created]=await db.insert(place).values({slug:`discount-qa-${suffix}`,name:'آزمون موقت تخفیف',nameNormalized:'آزمون موقت تخفیف',status:'draft'}).$returningId();id=created.id
 await db.insert(clubMembership).values(users.map((userId,index)=>({userId,placeId:id!,status:index===2?'left' as const:'active' as const})))
 const [offer]=await db.insert(clubOffer).values({placeId:id,title:'آزمون',discountLabel:'۲۰٪',expiresAt:new Date(Date.now()+3600000)}).$returningId()
 const results=await Promise.all([broadcastOffer(id,offer.id),broadcastOffer(id,offer.id)])
 assert.equal(results.reduce((sum,r)=>sum+r.sent,0),2)
 assert.equal((await db.select().from(clubCode).where(eq(clubCode.offerId,offer.id))).length,2)
 assert.equal((await broadcastOffer(id,offer.id)).sent,0)
 const code=await issueCode({placeId:id,offerId:offer.id,userId:users[0]})
 assert.equal(await redeemCode({placeId:id+100000,code,actorId:users[0]}),false)
 assert.equal(await redeemCode({placeId:id,code,actorId:users[0]}),true)
 assert.equal(await redeemCode({placeId:id,code,actorId:users[0]}),false)
 await assert.rejects(()=>issueCode({placeId:id!,offerId:offer.id,userId:users[0]}))
 await assert.rejects(()=>broadcastOffer(id!+100000,offer.id))
 const second=await issueCode({placeId:id,offerId:offer.id,userId:users[1]})
 await db.update(clubOffer).set({expiresAt:new Date(Date.now()-1000)}).where(eq(clubOffer.id,offer.id))
 assert.equal(await redeemCode({placeId:id,code:second,actorId:users[0]}),false)
 assert.equal((await listMyClub(users[1]))[0].status,'expired')
 await assert.rejects(()=>broadcastOffer(id!,offer.id))
 await db.update(clubOffer).set({expiresAt:new Date(Date.now()+3600000)}).where(eq(clubOffer.id,offer.id))
 await db.update(clubMembership).set({status:'left'}).where(and(eq(clubMembership.userId,users[1]),eq(clubMembership.placeId,id)))
 assert.equal(await redeemCode({placeId:id,code:second,actorId:users[0]}),false)
 assert.equal((await listMyClub(users[1]))[0].status,'cancelled')
 const expiry=new Date(Date.now()+3600000+210*60000).toISOString().slice(0,16)
 await saveVenueDiscount(id,20,expiry,users[0]);assert.equal((await getVenueDiscount(id))?.percent,20)
 await assert.rejects(()=>saveVenueDiscount(id!,91,expiry,users[0]))
 const [section]=await db.insert(menuSection).values({placeId:id,name:'آزمون'}).$returningId()
 await db.insert(menuItem).values({placeId:id,sectionId:section.id,publicId:`discount-${suffix}`,name:'آزمون غذا',nameNormalized:'آزمون غذا',price:100000})
 // Draft venues must never leak through public item APIs.
 assert.equal(await getMenuItemByPublicId(`discount-${suffix}`),null)
 await db.update(place).set({status:'published'}).where(eq(place.id,id))
 assert.equal((await getMenuItemByPublicId(`discount-${suffix}`))?.price,80000)
 assert.equal((await listMenuItemCards({query:'آزمون غذا',maxPrice:90000})).some(item=>item.publicId===`discount-${suffix}`),true)
 await db.update(place).set({status:'draft'}).where(eq(place.id,id))
 assert.equal((await db.select({price:menuItem.price}).from(menuItem).where(eq(menuItem.placeId,id)))[0].price,100000)
 await db.update(venueDiscount).set({expiresAt:new Date(Date.now()-1000)}).where(eq(venueDiscount.placeId,id));assert.equal(await getVenueDiscount(id),null)
 await cancelVenueDiscount(id)
 console.log('✓ concurrent broadcast, consent, expiry, one-time redemption, cross-venue scope, base-price preservation')
}finally{
 if(id)await db.delete(place).where(eq(place.id,id))
 for(const user of users)await db.delete(appUser).where(eq(appUser.id,user))
 await closeDb()
}
