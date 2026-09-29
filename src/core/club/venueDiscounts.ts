import 'server-only'
import {and,eq,gt,desc} from 'drizzle-orm'
import {getDb} from '@/db/client'
import {venueDiscount,place} from '@/db/schema'
import {parseDiscountExpiry} from './discount'

export async function getVenueDiscount(placeId:number){
  return (await getDb().select().from(venueDiscount).where(and(eq(venueDiscount.placeId,placeId),eq(venueDiscount.active,true),gt(venueDiscount.expiresAt,new Date()))).limit(1))[0]??null
}
export async function saveVenueDiscount(placeId:number,percent:number,expiry:string,actorId:string){
  if(!Number.isInteger(percent)||percent<1||percent>90)throw new Error('درصد تخفیف باید عددی از ۱ تا ۹۰ باشد.')
  const values={placeId,percent,expiresAt:parseDiscountExpiry(expiry),active:true,createdByUserId:actorId}
  await getDb().insert(venueDiscount).values(values).onDuplicateKeyUpdate({set:{percent,expiresAt:values.expiresAt,active:true,createdByUserId:actorId}})
}
export async function cancelVenueDiscount(placeId:number){await getDb().update(venueDiscount).set({active:false}).where(eq(venueDiscount.placeId,placeId))}
export async function listDiscountedVenues(limit=12){
  return getDb().select({id:place.id,name:place.name,slug:place.slug,percent:venueDiscount.percent,expiresAt:venueDiscount.expiresAt,districtId:place.districtId}).from(venueDiscount).innerJoin(place,eq(place.id,venueDiscount.placeId)).where(and(eq(place.status,'published'),eq(venueDiscount.active,true),gt(venueDiscount.expiresAt,new Date()))).orderBy(desc(venueDiscount.updatedAt)).limit(Math.min(Math.max(limit,1),50))
}
