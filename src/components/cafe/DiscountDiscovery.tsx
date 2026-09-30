import Link from 'next/link'
import {listDiscountedVenues} from '@/core/club/venueDiscounts'
import {paths} from '@/routes'
import styles from './DiscountDiscovery.module.css'

export async function DiscountDiscovery(){
  const offers=await listDiscountedVenues()
  if(!offers.length)return null
  return <section className={styles.wrap} aria-labelledby="discount-discovery-title"><div className={styles.head}><div><span>انتخاب خوش‌قیمت امروز</span><h2 id="discount-discovery-title">کافه‌های تخفیف‌دار</h2></div><p>تخفیف فعال روی کل منو؛ بدون تغییر قیمت پایه</p></div><div className={styles.rail}>{offers.map(o=><Link key={o.id} href={paths.cafe(o.slug)} className={styles.card}><strong className={styles.percent}>{o.percent.toLocaleString('fa-IR')}٪</strong><div><h3>{o.name}</h3><p>کل منو · تا {o.expiresAt.toLocaleDateString('fa-IR',{timeZone:'Asia/Tehran',month:'long',day:'numeric'})}</p><span>دیدن منوی تخفیف‌دار ←</span></div></Link>)}</div></section>
}
