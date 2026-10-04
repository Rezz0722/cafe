import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, desc, eq } from 'drizzle-orm'
import { getSession } from '@/core/auth/currentUser'
import { getDb } from '@/db/client'
import { appUser, auditLog, place } from '@/db/schema'
import { LEAD_LABELS, type LeadStatus } from '@/core/leads/policy'
import { listVenueLeads } from '@/core/leads/service'
import { LeadActionForm } from '@/components/leads/LeadActionForm'
import { authUrl } from '@/routes'
import { manageLeadAction } from './actions'
import styles from '@/components/leads/leads.module.css'

export const metadata: Metadata = { title: 'درخواست‌های پنل کافه', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'
const date = (d: Date) => new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' }).format(d)
const localDate = (d: Date | null) => d ? new Date(d.getTime() + 12600000).toISOString().slice(0, 16) : ''

export default async function LeadInbox({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const { user, actor } = await getSession()
  if (!user) redirect(authUrl('/admin/leads'))
  if (user.role !== 'admin' || actor) redirect('/profile')
  const [account] = await getDb().select().from(appUser).where(eq(appUser.id, user.id))
  if (account?.mustChangePassword) redirect('/profile/password')
  const params = await searchParams
  const status = params.status && Object.hasOwn(LEAD_LABELS, params.status) ? params.status as LeadStatus : undefined
  const page = Math.min(10000, Math.max(1, Number(params.page) || 1))
  const [leads, admins, venues] = await Promise.all([
    listVenueLeads(status, (Math.floor(page) - 1) * 40),
    getDb().select({ id: appUser.id, name: appUser.name }).from(appUser).where(and(eq(appUser.role, 'admin'), eq(appUser.status, 'active'))),
    getDb().select({ id: place.id, name: place.name, slug: place.slug }).from(place),
  ])
  return <main className={styles.page}><Link href="/admin">بازگشت به مدیریت</Link><h1>درخواست‌های پنل کافه</h1><p>ثبت درخواست، مالکیت را ثابت نمی‌کند. فقط پس از بررسی شعبه و حساب تأییدشده، پنل را فعال کنید.</p>
    <nav aria-label="فیلتر وضعیت درخواست" className={styles.filters}><Link href="/admin/leads" aria-current={!status ? 'page' : undefined}>همه</Link>{Object.entries(LEAD_LABELS).map(([key, label]) => <Link key={key} href={`/admin/leads?status=${key}`} aria-current={status === key ? 'page' : undefined}>{label}</Link>)}</nav>
    {leads.length === 0 && <p>در این وضعیت درخواستی وجود ندارد.</p>}
    <ul className={styles.list}>{await Promise.all(leads.map(async lead => {
      const venue = venues.find(v => v.id === lead.placeId)
      const events = await getDb().select({ action: auditLog.action, createdAt: auditLog.createdAt }).from(auditLog).where(and(eq(auditLog.entity, 'venue_lead'), eq(auditLog.entityId, lead.id))).orderBy(desc(auditLog.createdAt)).limit(6)
      return <li key={lead.id} className={styles.card}><header><h2>{lead.cafeName} · {lead.branch || lead.city}</h2><span className={styles.status}>{LEAD_LABELS[lead.status]}</span></header>
        <p>{lead.contactName} · <a dir="ltr" href={`tel:${lead.contactPhone}`}>{lead.contactPhone}</a> · {lead.city}</p><p>کد پیگیری: <code dir="ltr">{lead.trackingCode}</code></p><p className={styles.muted}>دریافت: {date(lead.createdAt)} · منبع: {lead.source} · رضایت تماس: {date(lead.consentAt)}</p>
        {lead.nextFollowUpAt && <p>پیگیری بعدی: {date(lead.nextFollowUpAt)}</p>}
        {venue && <p>شعبهٔ درخواست‌شده: <Link href={`/cafe/${venue.slug}`}>{venue.name}</Link> · شناسه {venue.id}</p>}
        <LeadActionForm action={manageLeadAction} label="ذخیرهٔ پیگیری"><input type="hidden" name="leadId" value={lead.id} /><input type="hidden" name="revision" value={lead.revision} /><div className={styles.fields}>
          <div className={styles.field}><label htmlFor={`status-${lead.id}`}>وضعیت</label><select id={`status-${lead.id}`} name="status" defaultValue={lead.status}>{Object.entries(LEAD_LABELS).map(([value, label]) => <option key={value} value={value} disabled={value === 'active' && lead.status !== 'active'}>{label}</option>)}</select></div>
          <div className={styles.field}><label htmlFor={`assignee-${lead.id}`}>مسئول پیگیری</label><select id={`assignee-${lead.id}`} name="assignee" defaultValue={lead.assignedToUserId || ''}><option value="">تعیین نشده</option>{admins.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          <div className={styles.field}><label htmlFor={`follow-${lead.id}`}>پیگیری بعدی (زمان تهران)</label><input id={`follow-${lead.id}`} name="followUp" type="datetime-local" defaultValue={localDate(lead.nextFollowUpAt)} /></div>
          <div className={styles.field}><label htmlFor={`note-${lead.id}`}>یادداشت داخلی (مشتری نمی‌بیند)</label><textarea id={`note-${lead.id}`} name="note" maxLength={2000} defaultValue={lead.internalNote || ''} /></div>
        </div></LeadActionForm>
        {lead.status === 'review' && lead.claimId && <details><summary>بررسی و فعال‌سازی پنل همین شعبه</summary><LeadActionForm action={manageLeadAction} label="تأیید مالکیت و فعال‌سازی پنل"><input type="hidden" name="mode" value="approve" /><input type="hidden" name="leadId" value={lead.id} /><input type="hidden" name="revision" value={lead.revision} /><div className={styles.field}><label htmlFor={`rationale-${lead.id}`}>روش احراز مالکیت و شاهد بررسی</label><textarea id={`rationale-${lead.id}`} name="rationale" required minLength={10} maxLength={500} /></div><label className={styles.consent}><input type="checkbox" name="ownershipChecked" value="yes" required /><span>مالکیت این حساب برای شعبهٔ بالا را خارج از فرم عمومی بررسی کردم؛ فعال‌سازی به این شعبه محدود است.</span></label></LeadActionForm></details>}
        <details className={styles.audit}><summary>سابقهٔ آخرین تغییرات</summary><ul>{events.map((event, i) => <li key={i}>{event.action} · {date(event.createdAt)}</li>)}</ul></details>
      </li>
    }))}</ul>
    <nav className={styles.filters} aria-label="صفحه‌بندی درخواست‌ها">{page > 1 && <Link href={`/admin/leads?page=${page - 1}${status ? `&status=${status}` : ''}`}>صفحهٔ قبل</Link>}{leads.length === 40 && <Link href={`/admin/leads?page=${page + 1}${status ? `&status=${status}` : ''}`}>صفحهٔ بعد</Link>}</nav>
  </main>
}
