import type { Metadata } from 'next'
import { serializeJsonLd } from '@/core/security/jsonLd'
import Link from 'next/link'
import { Cookie, LockKeyhole, MapPin, ShieldCheck } from 'lucide-react'
import { BreadcrumbJsonLd } from '@/components/seo/PlaceJsonLd'
import { absoluteUrl, paths } from '@/routes'
import styles from '../trust.module.css'

export const metadata: Metadata = {
  title: 'حریم خصوصی',
  description: 'توضیح داده‌هایی که کو کافه برای حساب، موقعیت نزدیک من، نظرها و آمار بازدید پردازش می‌کند و نحوهٔ استفاده از کوکی‌ها.',
  alternates: { canonical: paths.privacy },
  robots: { index: true, follow: true },
}

export default function PrivacyPage() {
  const jsonLd = { '@context': 'https://schema.org', '@type': 'WebPage', '@id': absoluteUrl(paths.privacy), name: 'حریم خصوصی کو کافه', inLanguage: 'fa-IR', dateModified: '2026-09-12' }
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <BreadcrumbJsonLd items={[{ name: 'کو کافه', path: paths.home }, { name: 'حریم خصوصی', path: paths.privacy }]} />
    <main className={styles.page}>
      <nav className={styles.breadcrumbs}><Link href={paths.home}>خانه</Link><span>/</span><span>حریم خصوصی</span></nav>
      <header className={styles.hero}><span className={styles.eyebrow}><LockKeyhole size={16}/> حریم خصوصی</span><h1>چه داده‌ای را چرا استفاده می‌کنیم؟</h1><p>اصل ما جمع‌آوری حداقلی است: فقط داده‌ای که برای ورود، شخصی‌سازی، عملکرد قابلیت‌ها و بهبود سرویس لازم است.</p><small className={styles.updated}>آخرین به‌روزرسانی: ۲۱ شهریور ۱۴۰۵</small></header>
      <div className={styles.content}>
        <section className={styles.section}><h2>داده‌های حساب</h2><p>اگر حساب بسازی، بسته به روش ورود، شمارهٔ تلفن یا نام کاربری، نام نمایشی و در صورت ارائه ایمیل ذخیره می‌شود. رمز به‌صورت هش نگهداری می‌شود و متن اصلی آن قابل بازیابی نیست. نشست ورود برای امنیت می‌تواند زمان، نوع ورود، IP و مشخصات کلی مرورگر را ثبت کند.</p></section>
        <section className={styles.section}><h2>موقعیت مکانی</h2><p>قابلیت «نزدیک من» فقط پس از اجازهٔ صریح مرورگر به موقعیت دسترسی می‌گیرد. مختصات برای مرتب‌سازی فاصله استفاده می‌شود؛ اگر کاربر وارد حساب باشد، آخرین موقعیت تأییدشده می‌تواند برای تجربهٔ بعدی نگهداری شود. ردکردن مجوز مانع استفاده از جست‌وجوی عادی، محله‌ها و نقشه نیست.</p></section>
        <section className={styles.section}><h2>نظر، ذخیره و مشارکت</h2><p>کافه‌های ذخیره‌شده، پاسخ‌های سلیقه‌سنجی، نظر و امتیاز، تاریخ مراجعهٔ اختیاری، ثبت کافه و پیشنهاد اصلاح به حساب مرتبط می‌شوند تا قابل مدیریت و پیگیری باشند. نام نمایشی می‌تواند کنار نظر تأییدشده نمایش داده شود؛ شمارهٔ تلفن عمومی نمی‌شود.</p></section>
        <section className={styles.section}><h2>آمار بازدید و کوکی‌ها</h2><p>در صورت فعال‌بودن آمار، یک شناسهٔ تصادفی و بی‌نام در کوکی با عمر حداکثر یک سال برای شمارش بازدید یکتا قرار می‌گیرد. مسیر صفحه، ارجاع‌دهنده، نوع دستگاه و در صورت ورود شناسهٔ حساب ثبت می‌شود. IP در رکورد آمار بازدید ذخیره نمی‌شود. کوکی نشست نیز برای نگه‌داشتن ورود و امنیت حساب ضروری است.</p></section>
        <section className={styles.section}><h2>اشتراک‌گذاری و نگهداری</h2><p>داده برای ارائه و ایمن‌سازی سرویس، ارسال کد ورود از طریق ارائه‌دهندهٔ پیامک و نگهداری فنی زیرساخت پردازش می‌شود. اطلاعات شخصی برای فروش به تبلیغ‌دهنده جمع‌آوری نمی‌شود. مدت نگهداری به نوع داده، نیاز عملیاتی و امنیتی وابسته است؛ داده‌های منقضی مانند کد ورود قابل مصرف دوباره نیستند.</p></section>
        <div className={styles.callout}><ShieldCheck size={22}/><p>برای گزارش دادهٔ نادرست از <Link href={paths.contribute}>مسیر مشارکت</Link> استفاده کن. پیش از ارسال نظر یا اصلاح، اطلاعات شخصی شخص دیگری را داخل متن ننویس.</p></div>
        <section className={styles.section}><h2>خلاصهٔ انتخاب‌های تو</h2><ul><li><MapPin size={15}/> می‌توانی مجوز موقعیت را ندهی و همچنان از سایت استفاده کنی.</li><li><Cookie size={15}/> پاک‌کردن کوکی‌ها شناسهٔ بازدید و نشست مرورگر را حذف می‌کند.</li><li><ShieldCheck size={15}/> محتوای عمومی را بدون قراردادن شمارهٔ تلفن حساب منتشر نمی‌کنیم.</li></ul></section>
      </div>
    </main>
  </>
}
