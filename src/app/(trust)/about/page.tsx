import type { Metadata } from 'next'
import { serializeJsonLd } from '@/core/security/jsonLd'
import Link from 'next/link'
import { BadgeCheck, Compass, Database, Store, Target } from 'lucide-react'
import { BreadcrumbJsonLd } from '@/components/seo/PlaceJsonLd'
import { absoluteUrl, paths } from '@/routes'
import { BRAND_ALIASES } from '@/core/seo/brand'
import styles from '../trust.module.css'

export const metadata: Metadata = {
  title: 'دربارهٔ کو کافه',
  description: 'کو کافه راهنمای منو، قیمت، ساعت کاری، امکانات و مسیر کافه‌ها و رستوران‌های مشهد است؛ برای انتخاب آگاهانه‌تر پیش از رفتن.',
  alternates: { canonical: paths.about },
  openGraph: { type: 'website', url: paths.about, title: 'دربارهٔ کو کافه' },
}

export default function AboutPage() {
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'AboutPage', '@id': absoluteUrl(paths.about),
    name: 'دربارهٔ کو کافه', inLanguage: 'fa-IR',
    mainEntity: { '@type': 'Organization', '@id': `${absoluteUrl(paths.home)}#organization`, name: 'کو کافه', alternateName: BRAND_ALIASES, url: absoluteUrl(paths.home) },
  }
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <BreadcrumbJsonLd items={[{ name: 'کو کافه', path: paths.home }, { name: 'دربارهٔ ما', path: paths.about }]} />
    <main className={styles.page}>
      <nav className={styles.breadcrumbs}><Link href={paths.home}>خانه</Link><span>/</span><span>دربارهٔ ما</span></nav>
      <header className={styles.hero}><span className={styles.eyebrow}><Compass size={16} /> دربارهٔ کو کافه</span><h1>قبل از رفتن، انتخابت را بشناس</h1><p>کو کافه برای یک سؤال ساده ساخته شده: «با بودجه و حال‌وهوای من، کجا بروم و آنجا چه چیزی با چه قیمتی پیدا می‌کنم؟»</p><small className={styles.updated}>آخرین بازبینی محتوا: شهریور ۱۴۰۵</small></header>
      <div className={styles.leadGrid}>
        <article className={styles.leadCard}><Target size={25}/><h2>برای انتخاب واقعی</h2><p>نتیجه بر اساس منو، قیمت، محله، ساعت و امکانات؛ نه فقط یک فهرست نام.</p></article>
        <article className={styles.leadCard}><Database size={25}/><h2>دادهٔ قابل بررسی</h2><p>زمان به‌روزرسانی و منبع هر داده تا جای ممکن در صفحهٔ مجموعه مشخص می‌شود.</p></article>
        <article className={styles.leadCard}><Store size={25}/><h2>برای کافه‌دارها</h2><p>مدیریت صفحه، منو، قیمت و اطلاعات کسب‌وکار از پنل اختصاصی.</p></article>
      </div>
      <div className={styles.content}>
        <section className={styles.section}><h2>کو کافه دقیقاً چه کاری می‌کند؟</h2><p>کو کافه با نام لاتین KuCafe و نشانی kucafe.ir، گاهی به‌شکل «کوکافه» هم جست‌وجو می‌شود. اینجا می‌توانی نام کافه، محله یا چیزی را که میل داری جست‌وجو کنی؛ منوی ثبت‌شده، بازه و سطح قیمت، ساعت کاری، امکانات، نظرها، موقعیت روی نقشه و مسیر را یک‌جا ببینی. صفحات خوراکی و دسته‌های منو نیز مقایسه را از «کجا بروم؟» به «این خوراکی را کجا و با چه قیمتی پیدا کنم؟» تبدیل می‌کنند.</p></section>
        <section className={styles.section}><h2>دامنهٔ فعلی</h2><p>تمرکز فعلی کو کافه شهر مشهد و مجموعه‌های کافه و رستوران این شهر است. صفحه‌ای که دادهٔ کافی ندارد نباید صرفاً برای پرکردن نتایج ساخته شود؛ گسترش شهرها و دسته‌ها باید همراه با دادهٔ قابل اتکا انجام شود.</p></section>
        <section className={styles.section}><h2>تعهد ما به شفافیت</h2><p>قیمت و ساعت کاری می‌توانند تغییر کنند. به همین دلیل، ادعای «همیشه قطعی» نداریم و زمان بررسی داده را مهم می‌دانیم. داده‌های ناسازگار، قیمت‌های خدماتی یا پرت نیز نباید بدون توضیح وارد مقایسهٔ قیمت شوند. جزئیات این منطق در صفحهٔ <Link href={paths.methodology}>روش جمع‌آوری و ارزیابی داده</Link> آمده است.</p></section>
        <div className={styles.callout}><BadgeCheck size={22}/><p>اطلاعات غلط دیدی؟ از گزینهٔ «اصلاح اطلاعات» در صفحهٔ همان کافه استفاده کن. پیشنهاد قبل از انتشار بررسی می‌شود.</p></div>
        <section className={styles.section}><h2>از کجا شروع کنم؟</h2><div className={styles.actions}><Link href={paths.menuHub}>دیدن منو و قیمت‌ها</Link><Link href={paths.districtHub}>انتخاب بر اساس محله</Link></div></section>
      </div>
    </main>
  </>
}
