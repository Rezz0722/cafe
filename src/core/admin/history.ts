import 'server-only'
import {sql} from 'drizzle-orm'
import {getDb} from '@/db/client'
import {safeAuditValue} from './auditSafe'

export async function getAuditHistory({placeId,page=1,action='',id}:{placeId?:number;page?:number;action?:string;id?:number}){
 const filters=[sql`TRUE`]
 if(placeId)filters.push(sql`((al.entity='place' AND al.entity_id=${String(placeId)}) OR JSON_EXTRACT(al.after,'$._placeId')=${placeId} OR JSON_EXTRACT(al.before,'$.placeId')=${placeId} OR JSON_EXTRACT(al.after,'$.placeId')=${placeId} OR (al.entity='menu_item' AND EXISTS(SELECT 1 FROM menu_item mi WHERE CAST(mi.id AS CHAR) COLLATE utf8mb4_unicode_ci=al.entity_id AND mi.place_id=${placeId})) OR (al.entity='menu_section' AND EXISTS(SELECT 1 FROM menu_section ms WHERE CAST(ms.id AS CHAR) COLLATE utf8mb4_unicode_ci=al.entity_id AND ms.place_id=${placeId})) OR (al.entity='review' AND EXISTS(SELECT 1 FROM review r WHERE CAST(r.id AS CHAR) COLLATE utf8mb4_unicode_ci=al.entity_id AND r.place_id=${placeId})) OR (al.entity='place_photo' AND EXISTS(SELECT 1 FROM place_photo ph WHERE CAST(ph.id AS CHAR) COLLATE utf8mb4_unicode_ci=al.entity_id AND ph.place_id=${placeId})) OR (al.entity='menu_item_variant' AND EXISTS(SELECT 1 FROM menu_item_variant v JOIN menu_item mi ON mi.id=v.item_id WHERE CAST(v.id AS CHAR) COLLATE utf8mb4_unicode_ci=al.entity_id AND mi.place_id=${placeId})))`)
 if(action)filters.push(sql`al.action LIKE ${'%'+action.replace(/[\\%_]/g,'\\$&')+'%'}`)
 if(id)filters.push(sql`al.id=${id}`)
 const where=sql.join(filters,sql` AND `)
 if(id){const result=await getDb().execute(sql`SELECT al.id,al.before,al.after FROM audit_log al WHERE ${where} LIMIT 1`);const row=(result[0] as unknown as {id:number;before:unknown;after:unknown}[])[0];const parse=(value:unknown)=>{if(typeof value!=='string')return value;try{return JSON.parse(value)}catch{return null}};return {details:row?safeAuditValue({id:row.id,before:parse(row.before),after:parse(row.after)}):null}}
 const count=await getDb().execute(sql`SELECT COUNT(*) total FROM audit_log al WHERE ${where}`),total=Number((count[0] as unknown as {total:number}[])[0]?.total??0)
 const current=Math.min(page,Math.max(1,Math.ceil(total/25)))
 const result=await getDb().execute(sql`SELECT al.id,al.actor_label actorLabel,al.action,al.entity,al.entity_id entityId,al.created_at createdAt,JSON_EXTRACT(al.after,'$.itemCount') itemCount,(al.action='menu.bulk_price' AND JSON_LENGTH(JSON_EXTRACT(al.before,'$.changes'))>0 AND NOT EXISTS(SELECT 1 FROM audit_log restored WHERE restored.entity=al.entity AND restored.entity_id=al.entity_id AND restored.action='menu.bulk_price.restore' AND JSON_EXTRACT(restored.after,'$.auditId')=al.id)) canRestore FROM audit_log al WHERE ${where} ORDER BY al.id DESC LIMIT 25 OFFSET ${(current-1)*25}`)
 return {rows:(result[0] as unknown as {canRestore:number}[]).map(row=>({...row,canRestore:!!row.canRestore})),total,page:current}
}
