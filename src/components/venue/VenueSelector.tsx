'use client'

import Link from 'next/link'
import { ChevronLeft, Coffee, MapPin, Search, SlidersHorizontal, Store } from 'lucide-react'
import {useAdminCatalog} from '@/components/admin/useAdminCatalog'
import {CatalogPagination} from '@/components/admin/CatalogPagination'
type Choice={id:number;name:string;slug:string;status:string;qualityScore:number;logo?:{url:string}|null;address?:string;districtName?:string|null}
import { fa } from '@/lib/format'
import { paths } from '@/routes'
import styles from './VenueSelector.module.css'

const STATUS: Record<string, string> = {
  published: 'منتشرشده',
  draft: 'پیش‌نویس',
  temporarily_closed: 'تعطیل موقت',
  permanently_closed: 'تعطیل دائم',
  merged: 'ادغام‌شده',
}

export function VenueSelector({ places,total }: { places: Choice[];total:number }) {
  const catalog=useAdminCatalog('places',places,total,true)
  const {query,setQuery}=catalog
  const status=catalog.filters.status||'all'
  const setStatus=(status:string)=>catalog.setFilter('status',status==='all'?'':status)
  const filtered=catalog.rows
  const published=filtered.filter(place=>place.status==='published').length
  const drafts=filtered.filter(place=>place.status==='draft').length

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <Link href={paths.admin} className={styles.back}>بازگشت به مدیریت</Link>
          <span className={styles.adminBadge}>دسترسی مدیر</span>
        </div>
        <div className={styles.heroBody}>
          <span className={styles.heroIcon}><Store size={28} /></span>
          <div>
            <p className={styles.eyebrow}>مدیریت مجموعه‌ها</p>
            <h1>کدام کافه را می‌خواهید مدیریت کنید؟</h1>
            <p>اطلاعات، ساعت کاری، امکانات و تمام منوی هر مجموعه از پنل اختصاصی آن ویرایش می‌شود.</p>
          </div>
        </div>
        <div className={styles.stats}>
          <span><strong>{fa(total)}</strong> کل مجموعه‌ها</span>
          <span><strong>{fa(published)}</strong> منتشرشده در این صفحه</span>
          <span><strong>{fa(drafts)}</strong> پیش‌نویس در این صفحه</span>
        </div>
      </header>

      <section className={styles.controls} aria-label="جست‌وجو و فیلتر مجموعه‌ها">
        <label className={styles.searchBox}>
          <Search size={20} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="نام کافه، محله یا آدرس را بنویسید…"
            autoFocus
          />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="پاک‌کردن جست‌وجو">×</button>}
        </label>
        <label className={styles.filterBox}>
          <SlidersHorizontal size={17} />
          <span className={styles.srOnly}>فیلتر وضعیت</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">همهٔ وضعیت‌ها</option>
            <option value="published">منتشرشده</option>
            <option value="draft">پیش‌نویس</option>
            <option value="temporarily_closed">تعطیل موقت</option>
            <option value="permanently_closed">تعطیل دائم</option>
          </select>
        </label>
      </section>

      <div className={styles.resultHead}>
        <strong>{fa(catalog.total)} نتیجه</strong>
        <span>برای ورود به پنل، روی کارت مجموعه بزنید</span>
      </div>

      {filtered.length > 0 ? (
        <section className={styles.grid}>
          {filtered.map((place) => (
            <Link key={place.id} href={`${paths.ownerPanel}?place=${place.id}`} className={styles.card}>
              {place.logo ? (
                <img src={place.logo.url} alt="" width={58} height={58} loading="lazy" />
              ) : (
                <span className={styles.logoEmpty}><Coffee size={23} /></span>
              )}
              <span className={styles.cardBody}>
                <span className={styles.cardTitle}>{place.name}</span>
                <span className={styles.location}><MapPin size={13} />{place.districtName || place.address || 'آدرس ثبت نشده'}</span>
                <span className={styles.cardMeta}>
                  <em data-status={place.status}>{STATUS[place.status] ?? place.status}</em>
                  <span>کیفیت اطلاعات {fa(place.qualityScore)}٪</span>
                </span>
              </span>
              <ChevronLeft size={20} className={styles.chevron} />
            </Link>
          ))}
        </section>
      ) : (
        <div className={styles.empty}><Search size={28} /><strong>مجموعه‌ای پیدا نشد</strong><span>املای نام یا فیلتر وضعیت را تغییر دهید.</span></div>
      )}

      <CatalogPagination {...catalog}/>
    </main>
  )
}
