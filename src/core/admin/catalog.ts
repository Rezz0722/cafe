import 'server-only'
import { sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { listUsers } from '@/core/auth/userRepo'
import { normalizeFa } from '@/core/text/normalize'
import { getSettings } from '@/core/settings/store'

export const ADMIN_PAGE_SIZE = 25
export const ADMIN_HEALTH_FILTERS = ['no_coords', 'out_of_area', 'shops', 'price_unit_fixed', 'no_hours', 'no_menu', 'no_phone', 'no_about', 'no_district', 'stale_price', 'archived'] as const
export type AdminPlaceRow = { id: number; name: string; slug: string; status: string; qualityScore: number; archived: boolean;address?:string;districtName?:string|null;logo?:{url:string}|null }
const archived = sql`EXISTS (SELECT 1 FROM audit_log al WHERE al.entity='place' AND al.entity_id=CAST(p.id AS CHAR) COLLATE utf8mb4_unicode_ci AND al.action='place.archive' AND NOT EXISTS (SELECT 1 FROM audit_log newer WHERE newer.entity=al.entity AND newer.entity_id=al.entity_id AND newer.id>al.id AND newer.action IN ('place.archive','place.restore')))`

export async function getAdminPlaces(input: { query?: string; page?: number; status?: string; district?: string; health?: string } = {}) {
  const query = normalizeFa(input.query ?? '').slice(0, 120)
  const staleDays = (await getSettings()).stalePriceDays
  const words = query.split(/\s+/).filter(Boolean)
  const filters = words.map(word => sql`(p.name_normalized LIKE ${'%' + word.replace(/[\\%_]/g, '\\$&') + '%'} OR p.slug LIKE ${'%' + word.replace(/[\\%_]/g, '\\$&') + '%'} OR p.address LIKE ${'%' + word.replace(/[\\%_]/g, '\\$&') + '%'})`)
  if (input.status) filters.push(sql`p.status=${input.status}`)
  if (input.district) filters.push(sql`p.district_id=${input.district}`)
  if (input.health !== 'archived') filters.push(sql`NOT (${archived})`)
  const health = {
    no_coords: sql`p.geo_status='missing'`,
    out_of_area: sql`p.geo_status='out_of_area'`,
    shops: sql`p.kind='shop'`,
    price_unit_fixed: sql`p.price_unit_fixed=1`,
    no_hours: sql`NOT EXISTS (SELECT 1 FROM place_hours h WHERE h.place_id=p.id AND h.closed=0)`,
    no_menu: sql`NOT EXISTS (SELECT 1 FROM menu_item mi JOIN menu_section ms ON ms.id=mi.section_id WHERE mi.place_id=p.id AND mi.archived_at IS NULL AND ms.branch_scope IN ('shared','branch'))`,
    no_phone: sql`NOT EXISTS (SELECT 1 FROM place_phone ph WHERE ph.place_id=p.id)`,
    no_about: sql`(p.about IS NULL OR TRIM(p.about)='')`,
    no_district: sql`p.district_id IS NULL`,
    stale_price: sql`EXISTS (SELECT 1 FROM menu_item mi JOIN menu_section ms ON ms.id=mi.section_id WHERE mi.place_id=p.id AND mi.archived_at IS NULL AND ms.branch_scope IN ('shared','branch') AND mi.price IS NOT NULL AND (mi.price_updated_at IS NULL OR mi.price_updated_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL ${staleDays} DAY)))`,
    archived,
  }
  if (input.health && input.health in health) filters.push(health[input.health as keyof typeof health])
  const where = filters.length ? sql.join(filters, sql` AND `) : sql`TRUE`
  const counts = await getDb().execute(sql`SELECT COUNT(*) total FROM place p WHERE ${where}`)
  const total = Number((counts[0] as unknown as { total: number }[])[0]?.total ?? 0)
  const page = Math.max(1, Math.min(Math.trunc(input.page ?? 1), Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE))))
  const result = await getDb().execute(sql`SELECT p.id,p.name,p.slug,p.status,p.address,d.name districtName,m.local_path logoPath,p.quality_score qualityScore,${archived} archived FROM place p LEFT JOIN district d ON d.id=p.district_id LEFT JOIN media m ON m.id=p.logo_media_id AND m.status='ok' WHERE ${where} ORDER BY p.name_normalized,p.id LIMIT ${ADMIN_PAGE_SIZE} OFFSET ${(page - 1) * ADMIN_PAGE_SIZE}`)
  const rows = (result[0] as unknown as (AdminPlaceRow&{logoPath:string|null})[]).map(({logoPath,...row}) => ({ ...row,logo:logoPath?{url:`/${logoPath}`}:null, archived: Boolean(row.archived) }))
  return { rows, total, page, pageSize: ADMIN_PAGE_SIZE }
}

export async function getAdminUsers(input: { query?: string; page?: number; role?: string } = {}) {
  const query = normalizeFa(input.query ?? '').slice(0, 120)
  const filters = [sql`TRUE`]
  for (const word of query.split(/\s+/).filter(Boolean)) {
    const term = '%' + word.replace(/[\\%_]/g, '\\$&') + '%'
    filters.push(sql`(REPLACE(REPLACE(REPLACE(REPLACE(u.name,'ي','ی'),'ك','ک'),'آ','ا'),'‌',' ') LIKE ${term} OR u.phone LIKE ${term} OR u.username LIKE ${term})`)
  }
  if (input.role) filters.push(sql`u.role=${input.role}`)
  const result = await getDb().execute(sql`SELECT COUNT(*) total FROM app_user u WHERE ${sql.join(filters, sql` AND `)}`)
  const total = Number((result[0] as unknown as { total: number }[])[0]?.total ?? 0)
  const page = Math.max(1, Math.min(Math.trunc(input.page ?? 1), Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE))))
  const users = await listUsers({ query, role: input.role as 'admin' | 'owner' | 'customer' | undefined, limit: ADMIN_PAGE_SIZE, offset: (page - 1) * ADMIN_PAGE_SIZE })
  const rows = users.map(account => ({ id: account.id, name: account.name, phone: account.phone, username: account.username, role: account.role, blocked: Boolean(account.blocked), hasPassword: Boolean(account.passwordHash), mustChangePassword: account.mustChangePassword, ownedPlaces: account.ownedPlaces.map(place => ({ id: place.id, name: place.name })), isBlogger: account.isBlogger }))
  return { rows, total, page, pageSize: ADMIN_PAGE_SIZE }
}

export async function getAdminPlaceChoices() {
  const result = await getDb().execute(sql`SELECT p.id,p.name,p.slug,p.status,p.quality_score qualityScore FROM place p WHERE NOT (${archived}) ORDER BY p.name_normalized,p.id`)
  return result[0] as unknown as AdminPlaceRow[]
}
