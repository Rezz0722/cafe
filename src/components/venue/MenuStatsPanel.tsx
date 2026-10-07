import type { MenuStats } from '@/core/analytics/menuStats'
import { fa } from '@/lib/format'
import styles from './VenuePanel.module.css'
import statsStyles from './MenuStatsPanel.module.css'
export function MenuStatsPanel({ stats }: { stats: MenuStats }) {
  return <section className={styles.todoBox} aria-labelledby="menu-stats-title">
    <h2 id="menu-stats-title" className={styles.boxTitle}>مشاهده‌های منو · ۳۰ روز اخیر</h2>
    <p className={styles.hint}>از ۲۹ روز قبل تا امروز، بر اساس روز UTC؛ آمار از زمان انتشار این قابلیت جمع می‌شود. این اعداد تعداد مشتری یکتا، سفارش یا فروش نیستند.</p>
    {!stats.enabled && <p className={styles.hint}>ثبت آمار فعلاً خاموش است؛ اعداد زیر مربوط به مشاهده‌های قبلی هستند.</p>}
    <div className={styles.statGrid}>
      <div className={styles.stat}><span className={styles.statValue}>{fa(stats.sectionViews)}</span><span className={styles.statLabel}>مشاهدهٔ دسته</span></div>
      <div className={styles.stat}><span className={styles.statValue}>{fa(stats.itemViews)}</span><span className={styles.statLabel}>مشاهدهٔ صفحهٔ جزئیات محصول</span></div>
    </div>
    <div className={statsStyles.lists}>{(['sections', 'items'] as const).map(key => <section key={key}>
      <h3 className={styles.boxTitle}>{key === 'sections' ? 'دسته‌های بیشتر مشاهده‌شده' : 'صفحات محصول بیشتر مشاهده‌شده'} · حداکثر ۱۰ مورد</h3>
      {stats[key].length ? <ol className={statsStyles.list}>{stats[key].map((row, index) => <li className={statsStyles.row} key={index}><span dir="auto">{row.name}</span> — <span className={statsStyles.count}>{fa(row.views)} مشاهده</span></li>)}</ol> : <p className={styles.hint}>هنوز مشاهده‌ای در این بازه ثبت نشده است.</p>}
    </section>)}</div>
    <p className={styles.hint}>پس از یک ثانیه نمایش بخش قابل‌دیدن ثبت می‌شود. تکرار همان بخش در همان تب تا ۳۰ دقیقه کاهش داده می‌شود؛ ربات‌های شناخته‌شده، DNT/GPC، پیش‌بارگذاری و جست‌وجوی منو شمرده نمی‌شوند. خطای شبکه یا محدودیت مرورگر ممکن است موجب کم‌شماری شود. برای آمار تازه، صفحه را بازخوانی کنید.</p>
  </section>
}
