import type { Metadata } from 'next'
import { serializeJsonLd } from '@/core/security/jsonLd'
import Link from 'next/link'
import { BadgeCheck, Database, RefreshCw, Scale } from 'lucide-react'
import { BreadcrumbJsonLd } from '@/components/seo/PlaceJsonLd'
import { absoluteUrl, paths } from '@/routes'
import styles from '../trust.module.css'

export const metadata: Metadata = {
  title: 'روش جمع‌آوری و به‌روزرسانی داده‌ها',
  description: 'روش کو کافه برای جمع‌آوری، همگام‌سازی، بررسی و نمایش منو، قیمت، ساعت کاری، سطح قیمت و اصلاحات کافه‌ها.',
  alternates: { canonical: paths.methodology },
}

export default function MethodologyPage() {
  const jsonLd = { '@context': 'https://schema.org', '@type': 'WebPage', '@id': absoluteUrl(paths.methodology), name: 'روش جمع‌آوری و به‌روزرسانی داده‌های کو کافه', inLanguage: 'fa-IR', dateModified: '2026-09-20' }
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <BreadcrumbJsonLd items={[{ name: 'کو کافه', path: paths.home }, { name: 'روش داده‌ها', path: paths.methodology }]} />
    <main className={styles.page}>
      <nav className={styles.breadcrumbs}><Link href={paths.home}>خانه</Link><span>/</span><span>روش داده‌ها</span></nav>
      <header className={styles.hero}><span className={styles.eyebrow}><Database size={16}/> شفافیت داده</span><h1>اطلاعات کو کافه چطور ساخته و به‌روز می‌شود؟</h1><p>منو و قیمت، داده‌های زنده و تغییرپذیرند. این صفحه روشن می‌کند چه چیزی جمع‌آوری می‌شود، چه بررسی‌هایی روی آن انجام می‌دهیم و هر عدد چه معنایی دارد.</p><small className={styles.updated}>آخرین بازبینی روش: ۲۹ شهریور ۱۴۰۵</small></header>
      <div className={styles.leadGrid}>
        <article className={styles.leadCard}><Database size={25}/><h2>دریافت</h2><p>اطلاعات عمومی منوها، دادهٔ ثبت‌شده توسط مدیر و پیشنهاد کاربران.</p></article>
        <article className={styles.leadCard}><Scale size={25}/><h2>نرمال‌سازی</h2><p>یکسان‌سازی واحد قیمت، دسته‌ها، نام‌ها و کنارگذاشتن دادهٔ نامعتبر.</p></article>
        <article className={styles.leadCard}><RefreshCw size={25}/><h2>بازبینی</h2><p>همگام‌سازی دوره‌ای و ثبت تغییرها بدون حذف بی‌ردپای تاریخچهٔ اجرا.</p></article>
      </div>
      <div className={styles.content}>
        <section className={styles.section}><h2>چرخهٔ داده</h2><ol className={styles.steps}><li><strong>جمع‌آوری:</strong> داده از منوهای عمومی، اطلاعات مدیر یا مالک مجموعه و اصلاح‌های کاربران دریافت می‌شود.</li><li><strong>تطبیق:</strong> مجموعه و آیتم موجود با شناسه‌ها و نشانه‌های پایدار تطبیق داده می‌شود تا رکورد تکراری ساخته نشود.</li><li><strong>اعتبارسنجی:</strong> قیمت، ساعت، مختصات و ساختار دسته‌ها بررسی و مقادیر نامعتبر از محاسبه کنار گذاشته می‌شوند.</li><li><strong>انتشار و گزارش:</strong> موارد جدید، تغییر قیمت و آیتم‌های حذف‌شده در گزارش همگام‌سازی مشخص می‌شوند؛ اعمال نهایی در پایگاه داده یک مرحلهٔ جدا و کنترل‌شده است.</li></ol></section>
        <section className={styles.section}><h2>قیمت‌ها چگونه تفسیر می‌شوند؟</h2><p>همهٔ قیمت‌های نمایشی تومان‌اند. اگر منبعی قیمت را به هزار تومان نوشته باشد، تشخیص واحد در زمان ورود داده انجام می‌شود. قواعدی مثل حد بالای قیمت معتبر و حذف دسته‌های خدماتی باعث می‌شوند فروش وسیله، پکیج یا خدمات نامرتبط میانگین یک کافه را خراب نکند.</p><h3>بازه و سطح قیمت یک چیز نیستند</h3><p>«کمترین تا بیشترین قیمت معتبر» بازهٔ آیتم‌های منوی همان مجموعه است. «اقتصادی، متوسط یا گران» از میانهٔ آیتم‌های مشمول و آستانه‌های مدیریتی ساخته می‌شود. بنابراین تغییر قواعد سطح قیمت لزوماً کمینه و بیشینهٔ نمایشی را تغییر نمی‌دهد.</p></section>
        <section className={styles.section}><h2>پیشنهادهای تجربه‌ای چگونه ساخته می‌شوند؟</h2><p>صفحه‌های <Link href={paths.experienceHub}>انتخاب بر اساس تجربه</Link> از برچسب آزاد یا متن تبلیغاتی ساخته نمی‌شوند. هر تجربه یک معیار اصلی دارد؛ برای نمونه، ورود به فهرست «برای کار» به ثبت مناسب‌بودن فضای کار با لپ‌تاپ نیاز دارد. پریز، اینترنت، سکوت و امکان ماندن طولانی فقط دلیل و ترتیب پیشنهاد را دقیق‌تر می‌کنند.</p><p>هر پاسخ می‌تواند «خیر»، «نسبی»، «بله» یا «هنوز بررسی‌نشده» باشد و منبع آن—مالک، تحریریه یا بازدید میدانی—جدا نگهداری می‌شود. این فهرست‌ها کاندیداهای مناسب‌اند، نه ادعای «بهترین کافه» یا امتیاز هوش مصنوعی.</p></section>
        <section className={styles.section}><h2>تازگی و محدودیت‌ها</h2><p>قیمت، موجودی و ساعت کاری ممکن است میان دو نوبت بررسی تغییر کنند. تاریخ آخرین بررسی در جایی که داده موجود باشد نمایش داده می‌شود. «باز است» نیز بر اساس ساعت ثبت‌شده و زمان محلی محاسبه می‌شود و جای تماس با مجموعه در موقعیت حساس را نمی‌گیرد.</p><p>رتبه‌بندی تنها با یک سیگنال ساخته نمی‌شود؛ امتیاز، کامل‌بودن داده و تناسب با فیلتر کاربر اهمیت دارند. نظر کم‌تعداد با تعداد نظر همراه است تا قطعیت کاذب ایجاد نکند.</p></section>
        <section className={styles.section}><h2>اصلاح خطا</h2><p>در صفحهٔ هر کافه مسیر اصلاح آدرس، تلفن، ساعت، مختصات و اطلاعات دیگر وجود دارد. پیشنهادها پیش از اعمال بررسی می‌شوند. برای ثبت مجموعهٔ تازه یا مشاهدهٔ وضعیت اصلاح‌ها به <Link href={paths.contribute}>صفحهٔ مشارکت</Link> برو.</p></section>
        <div className={styles.callout}><BadgeCheck size={22}/><p>هدف این روش «قابل توضیح بودن» نتیجه است: کاربر باید بداند عدد از کجا آمده و چرا ممکن است با منوی امروز مجموعه تفاوت داشته باشد.</p></div>
      </div>
    </main>
  </>
}
