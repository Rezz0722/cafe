import type { Metadata } from 'next'
import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { requireUser } from '@/core/auth/currentUser'
import { findUserById } from '@/core/auth/userRepo'
import { getDb } from '@/db/client'
import { place } from '@/db/schema'
import { listMyVenueLeads } from '@/core/leads/service'
import { LEAD_LABELS } from '@/core/leads/policy'
import { LeadActionForm } from '@/components/leads/LeadActionForm'
import { SignOutButton } from '@/components/profile/SignOutButton'
import { claimLeadAction } from './actions'
import styles from '@/components/leads/leads.module.css'
export const metadata: Metadata = { title: 'پیگیری درخواست پنل کافه', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'
export default async function MyVenueRequests() {
  const user = await requireUser('/profile/venue-requests')
  const account = await findUserById(user.id)
  const [leads, venues] = await Promise.all([listMyVenueLeads(user.id), getDb().select({ id: place.id, name: place.name }).from(place).where(eq(place.status, 'published')).orderBy(place.name)])
  return <main className={styles.page}><Link href="/profile">بازگشت به حساب من</Link><h1>درخواست‌های پنل کافهٔ من</h1><p>درخواست‌های ثبت‌شده با شمارهٔ تأییدشدهٔ حساب شما اینجا نمایش داده می‌شوند. ثبت درخواست، دسترسی شعبه ایجاد نمی‌کند.</p>
    {!account?.phoneVerifiedAt && <section className={styles.section}><h2>ابتدا شمارهٔ حسابتان را تأیید کنید</h2><p>از حساب خارج شوید و دوباره با کد پیامکی همین شماره وارد شوید؛ سپس از «درخواست پنل کافه» در حساب من، پیگیری کنید. ورود با رمز، تأیید شماره محسوب نمی‌شود.</p><SignOutButton /></section>}
    {account?.phoneVerifiedAt && !leads.length && <p>هنوز درخواستی برای این شماره ثبت نشده است. <Link href="/for-cafes#panel-request">درخواست پنل کافه</Link></p>}
    <ul className={styles.list}>{leads.map(lead => <li key={lead.id} className={styles.card}><header><h2>{lead.cafeName} · {lead.branch || lead.city}</h2><span className={styles.status}>{LEAD_LABELS[lead.status]}</span></header><p>کد پیگیری: <code dir="ltr">{lead.trackingCode}</code></p>
      {lead.status === 'active' ? <Link className={styles.button} href="/admin/venue">ورود به پنل کافه</Link> : lead.claimId ? <p>شعبه برای بررسی انتخاب شده است. تغییر شعبه را با پشتیبانی هماهنگ کنید.</p> : !['closed', 'rejected'].includes(lead.status) ? <LeadActionForm action={claimLeadAction} label="درخواست بررسی مالکیت این شعبه"><input type="hidden" name="leadId" value={lead.id} /><div className={styles.field}><label htmlFor={`place-${lead.id}`}>شعبهٔ دقیق کافه را انتخاب کنید</label><select id={`place-${lead.id}`} name="placeId" required defaultValue=""><option value="" disabled>انتخاب شعبه</option>{venues.map(v => <option key={v.id} value={v.id}>{v.name} · شناسه {v.id}</option>)}</select></div><p className={styles.muted}>اگر کافه‌تان در فهرست نیست، با پشتیبانی تماس بگیرید. درخواست فروش، جای ثبت کافهٔ جدید را نمی‌گیرد.</p></LeadActionForm> : null}
    </li>)}</ul>
  </main>
}
