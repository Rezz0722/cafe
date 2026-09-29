import type { Metadata } from 'next'
import { serializeJsonLd } from '@/core/security/jsonLd'
import Link from 'next/link'
import { Eye, MessageSquareText, ShieldCheck } from 'lucide-react'
import { BreadcrumbJsonLd } from '@/components/seo/PlaceJsonLd'
import { absoluteUrl, paths } from '@/routes'
import styles from '../trust.module.css'

export const metadata: Metadata = {
  title: 'سیاست محتوا، رتبه‌بندی و نظرها',
  description: 'قواعد انتشار اطلاعات، نمایش رتبه‌ها، بررسی نظر کاربران، اصلاح خطا و تفکیک محتوای کسب‌وکار در کو کافه.',
  alternates: { canonical: paths.editorialPolicy },
}

export default function EditorialPolicyPage() {
  const jsonLd = { '@context': 'https://schema.org', '@type': 'WebPage', '@id': absoluteUrl(paths.editorialPolicy), name: 'سیاست محتوا، رتبه‌بندی و نظرهای کو کافه', inLanguage: 'fa-IR', dateModified: '2026-09-12' }
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <BreadcrumbJsonLd items={[{ name: 'کو کافه', path: paths.home }, { name: 'سیاست محتوا', path: paths.editorialPolicy }]} />
    <main className={styles.page}>
      <nav className={styles.breadcrumbs}><Link href={paths.home}>خانه</Link><span>/</span><span>سیاست محتوا</span></nav>
      <header className={styles.hero}><span className={styles.eyebrow}><ShieldCheck size={16}/> اعتماد و انصاف</span><h1>سیاست محتوا، رتبه‌بندی و نظرها</h1><p>کاربر باید بداند چه چیزی واقعیت ثبت‌شده، چه چیزی نظر مردم و چه چیزی محتوای خود مجموعه است.</p><small className={styles.updated}>آخرین بازبینی: ۲۱ شهریور ۱۴۰۵</small></header>
      <div className={styles.leadGrid}>
        <article className={styles.leadCard}><Eye size={25}/><h2>شفافیت</h2><p>تعداد نظر، تاریخ داده و محدودیت‌ها کنار ادعاهای مهم می‌آیند.</p></article>
        <article className={styles.leadCard}><MessageSquareText size={25}/><h2>نظر واقعی</h2><p>نظر کاربر از اطلاعات رسمی مجموعه جداست و پیش از انتشار بررسی می‌شود.</p></article>
        <article className={styles.leadCard}><ShieldCheck size={25}/><h2>حق اصلاح</h2><p>کافه‌دار و کاربر می‌توانند خطای قابل اثبات را برای بررسی گزارش کنند.</p></article>
      </div>
      <div className={styles.content}>
        <section className={styles.section}><h2>اطلاعات مجموعه‌ها</h2><p>نام، آدرس، تلفن، ساعت، امکانات، تصاویر و منو ممکن است از منابع عمومی، مدیر یا مالک مجموعه و مشارکت کاربران بیاید. ورود داده به معنی تأیید کیفیت کسب‌وکار نیست. اصلاحات مهم پیش از انتشار بررسی می‌شوند و داده‌ای که نامعتبر تشخیص داده شود نباید در مقایسه‌ها اثر بگذارد.</p></section>
        <section className={styles.section}><h2>رتبه‌بندی و پیشنهاد</h2><p>ترتیب نتایج می‌تواند با انتخاب کاربر تغییر کند: امتیاز، فاصله، سطح قیمت یا کامل‌بودن اطلاعات. تعداد کمِ نظر به اندازهٔ یک نمونهٔ بزرگ قابل اتکا نیست؛ به همین دلیل تعداد نظر کنار امتیاز نمایش داده می‌شود. جایگاه پولی، اگر در آینده اضافه شود، باید با برچسب روشن «تبلیغ» یا «پیشنهاد ویژه» از نتیجهٔ عادی جدا باشد.</p></section>
        <section className={styles.section}><h2>نظر کاربران</h2><ul><li>نظر باید حاصل تجربهٔ واقعی و دربارهٔ همان مجموعه باشد.</li><li>توهین، تهدید، اطلاعات شخصی دیگران، تبلیغ تکراری و محتوای بی‌ربط منتشر نمی‌شود.</li><li>انتقاد منفی صرفاً به‌دلیل منفی‌بودن حذف نمی‌شود؛ معیار، ارتباط و رعایت قواعد است.</li><li>نظر ثبت‌شده می‌تواند تا زمان بررسی «در انتظار انتشار» بماند.</li><li>تاریخ مراجعه اختیاری است، اما به سنجش تازگی تجربه کمک می‌کند.</li></ul></section>
        <section className={styles.section}><h2>تعارض و اصلاح</h2><p>مالکیت یا مدیریت صفحه به کافه‌دار اجازهٔ اصلاح اطلاعات خودش را می‌دهد، اما امتیاز و نظر کاربر را به محتوای تبلیغاتی تبدیل نمی‌کند. اگر خطایی دیدی، از مسیر <Link href={paths.contribute}>مشارکت و اصلاح اطلاعات</Link> گزارش بده؛ برای درک محاسبات قیمت نیز <Link href={paths.methodology}>روش داده‌ها</Link> را ببین.</p></section>
      </div>
    </main>
  </>
}
