import 'server-only'
import { and, eq, gte, inArray, isNull, like, lte, sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { appUser, dailyStat, menuItem, menuSection, userPlaceRole } from '@/db/schema'
import type { Actor } from '@/core/places/manage'
import type { MenuView } from './menuPolicy'
export interface MenuStats {
  enabled: boolean
  sections: { name: string; views: number }[]
  items: { name: string; views: number }[]
  sectionViews: number
  itemViews: number
}
export async function recordMenuView(view: MenuView, now = new Date()) {
  // Atomic conditional upsert: archived/foreign/private targets never count.
  await getDb().execute(sql`
    INSERT INTO daily_stat (day, metric, ref_id, value)
    SELECT ${now.toISOString().slice(0, 10)}, ${view.kind === 'section' ? 'menu_section_views' : 'menu_item_views'}, ${`${view.placeId}:${view.targetId}`}, 1
    FROM place p WHERE p.id = ${view.placeId} AND p.status IN ('published', 'temporarily_closed')
    AND EXISTS (SELECT 1 FROM menu_section s JOIN menu_item i ON i.section_id = s.id AND i.place_id = s.place_id
      WHERE s.place_id = p.id AND s.branch_scope IN ('shared', 'branch') AND i.archived_at IS NULL
      AND ${view.kind === 'section' ? sql`s.id` : sql`i.id`} = ${view.targetId})
    ON DUPLICATE KEY UPDATE value = value + 1
  `)
}
export async function getMenuStats(placeId: number, actor: Actor, enabled: boolean): Promise<MenuStats> {
  if (actor.onBehalfOf) throw new Error('آمار در حالت مشاهده به‌عنوان در دسترس نیست.')
  const [account] = await getDb().select().from(appUser).where(eq(appUser.id, actor.userId)).limit(1)
  const [role] = await getDb().select().from(userPlaceRole).where(and(eq(userPlaceRole.userId, actor.userId), eq(userPlaceRole.placeId, placeId))).limit(1)
  if (!account || account.status !== 'active' || account.mustChangePassword || (account.role !== 'admin' && role?.status !== 'active')) throw new Error('دسترسی فعال به آمار این شعبه ندارید.')
  const firstDay = new Date(new Date().toISOString().slice(0, 10)); firstDay.setUTCDate(firstDay.getUTCDate() - 29)
  const rows = await getDb().select({ metric: dailyStat.metric, refId: dailyStat.refId, views: sql<number>`SUM(${dailyStat.value})` }).from(dailyStat)
    .where(and(gte(dailyStat.day, firstDay), lte(dailyStat.day, new Date(new Date().toISOString().slice(0, 10))), inArray(dailyStat.metric, ['menu_section_views', 'menu_item_views']), like(dailyStat.refId, `${placeId}:%`))).groupBy(dailyStat.metric, dailyStat.refId)
  const sections = await getDb().select({ id: menuSection.id, name: menuSection.name }).from(menuSection).where(and(eq(menuSection.placeId, placeId), inArray(menuSection.branchScope, ['shared', 'branch'])))
  const items = await getDb().select({ id: menuItem.id, name: menuItem.name }).from(menuItem).innerJoin(menuSection, and(eq(menuSection.id, menuItem.sectionId), eq(menuSection.placeId, menuItem.placeId)))
    .where(and(eq(menuItem.placeId, placeId), isNull(menuItem.archivedAt), inArray(menuSection.branchScope, ['shared', 'branch'])))
  const names = { menu_section_views: new Map(sections.map(s => [`${placeId}:${s.id}`, s.name])), menu_item_views: new Map(items.map(i => [`${placeId}:${i.id}`, i.name])) }
  const build = (metric: keyof typeof names) => rows.filter(r => r.metric === metric).map(r => ({ name: names[metric].get(r.refId) || 'حذف‌شده یا دیگر در منوی عمومی نیست', views: Number(r.views) })).sort((a, b) => b.views - a.views)
  const sectionRows = build('menu_section_views'), itemRows = build('menu_item_views')
  return { enabled, sections: sectionRows.slice(0, 10), items: itemRows.slice(0, 10), sectionViews: sectionRows.reduce((sum, r) => sum + r.views, 0), itemViews: itemRows.reduce((sum, r) => sum + r.views, 0) }
}
