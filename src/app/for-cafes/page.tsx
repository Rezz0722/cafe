import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowLeft,
  BadgeCheck,
  BarChart3,
  Check,
  Clock3,
  ExternalLink,
  MessageCircle,
  QrCode,
  Store,
  UtensilsCrossed,
} from 'lucide-react'
import { serializeJsonLd } from '@/core/security/jsonLd'
import { absoluteUrl, authUrl, paths } from '@/routes'
import styles from './page.module.css'
import { randomUUID } from 'node:crypto'
import { getSettings } from '@/core/settings/store'
import { normalizePhone } from '@/core/auth/phone'
import { PanelRequestForm } from '@/components/leads/PanelRequestForm'
import leadStyles from '@/components/leads/leads.module.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'دریافت پنل دیجیتال کافه',
  description:
    'صفحه و منوی دیجیتال کافه‌تان را با کو کافه مدیریت کنید؛ برای دریافت پنل، QR منو و دیده‌شدن بهتر با ما در تماس باشید.',
  alternates: { canonical: paths.ownerLanding },
  openGraph: {
    type: 'website',
    url: absoluteUrl(paths.ownerLanding),
    title: 'پنل دیجیتال کافه | کو کافه',
    description: 'منو، قیمت، ساعت کاری و صفحهٔ اختصاصی کافه‌تان را از یک پنل ساده مدیریت کنید.',
  },
}

const benefits = [
  { icon: UtensilsCrossed, title: 'منوی همیشه به‌روز', text: 'دسته‌بندی، آیتم، قیمت و موجودی را خودتان سریع اصلاح کنید.' },
  { icon: QrCode, title: 'QR اختصاصی شعبه', text: 'یک لینک و QR تمیز برای میز، بیو و شبکه‌های اجتماعی کافه‌تان.' },
  { icon: BarChart3, title: 'دیده‌شدن در کو کافه', text: 'صفحهٔ کافه در جست‌وجوی غذا، محله و تجربه‌های کاربران حضور دارد.' },
  { icon: Clock3, title: 'اطلاعات قابل اعتماد', text: 'ساعت کاری، تماس، آدرس، تصاویر و امکانات را در اختیار مشتری بگذارید.' },
]

const faqs = [
  ['برای گرفتن پنل چه کاری باید انجام بدهم؟', 'فرم کوتاه درخواست پنل را پر کنید یا با تماس و تلگرام پیام بدهید. کد پیگیری دریافت می‌کنید؛ دسترسی شعبه فقط بعد از تأیید شماره و بررسی مالکیت فعال می‌شود.'],
  ['آیا می‌توانم چند شعبه داشته باشم؟', 'بله. هر شعبه صفحه و منوی خودش را دارد و حساب مالک می‌تواند بین مجموعه‌های مجاز جابه‌جا شود.'],
  ['بعد از تحویل پنل چه چیزهایی را مدیریت می‌کنم؟', 'اطلاعات کافه، ساعت کاری، تصاویر، دسته‌بندی و آیتم‌های منو، قیمت‌ها، پاسخ به نظرها و امکانات باشگاه مشتریان.'],
  ['اگر اطلاعات کافه‌ام در سایت ناقص باشد چه؟', 'در زمان راه‌اندازی با هم اطلاعات پایه را بررسی می‌کنیم و بعد شما می‌توانید اصلاح‌های بعدی را از پنل انجام دهید.'],
]

export default async function ForCafesPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const settings = await getSettings()
  const OWNER_PHONE = normalizePhone(settings.contactPhone) || '09306819085'
  const OWNER_PHONE_LINK = `tel:+98${OWNER_PHONE.slice(1)}`
  const telegram = settings.siteTelegram.replace(/^https:\/\/t.me\//, '').replace(/^@/, '').replace(/\/$/, '')
  const OWNER_TELEGRAM = /^[A-Za-z0-9_]{5,32}$/.test(telegram) ? telegram : 'saghi_alireza'
  const OWNER_TELEGRAM_LINK = `https://t.me/${OWNER_TELEGRAM}`
  const source = (await searchParams).from || 'direct'
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${absoluteUrl(paths.ownerLanding)}#webpage`,
    name: 'دریافت پنل دیجیتال کافه',
    description: metadata.description,
    inLanguage: 'fa-IR',
    isPartOf: { '@id': `${absoluteUrl('/')}#website` },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <main className={styles.page}>
        <nav className={styles.breadcrumbs} aria-label="مسیر صفحه">
          <Link href={paths.home}>خانه</Link><span aria-hidden="true">/</span><span>برای کافه‌دارها</span>
        </nav>

        <section className={styles.hero} aria-labelledby="owner-hero-title">
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}><Store size={17} aria-hidden="true" /> برای کافه‌دارها</span>
            <h1 id="owner-hero-title">کافه‌ات را آنلاین، مرتب و قابل پیدا شدن نگه دار.</h1>
            <p>یک صفحهٔ اختصاصی، منوی دیجیتال و QR شعبه؛ با همراهی مستقیم تیم کو کافه راه‌اندازی می‌شود.</p>
            <div className={styles.heroActions}>
              <a className={styles.primaryButton} href="#panel-request">ثبت درخواست پنل <ArrowLeft size={17} aria-hidden="true" /></a>
              <a className={styles.secondaryButton} href={OWNER_TELEGRAM_LINK} target="_blank" rel="noreferrer">
                <MessageCircle size={18} aria-hidden="true" /> شروع گفتگو در تلگرام <ExternalLink size={14} aria-hidden="true" />
              </a>
              <a className={styles.secondaryButton} href={OWNER_PHONE_LINK}>
                تماس با علیرضا <ArrowLeft size={17} aria-hidden="true" />
              </a>
            </div>
            <p className={styles.heroNote}>پاسخ‌گویی مستقیم: {OWNER_PHONE} · تلگرام: @{OWNER_TELEGRAM}</p>
          </div>
          <div className={styles.heroPanel} aria-label="نمایی از امکانات پنل کافه">
            <div className={styles.panelTop}><span className={styles.panelDot} /><span>پنل اختصاصی شعبه</span><BadgeCheck size={19} aria-hidden="true" /></div>
            <div className={styles.panelTitle}>منوی مرتب، مشتری مطمئن‌تر</div>
            <div className={styles.panelRows}>
              <div><UtensilsCrossed size={18} aria-hidden="true" /><span><b>منو و قیمت</b><small>ویرایش سریع و دسته‌بندی‌شده</small></span><Check size={17} aria-hidden="true" /></div>
              <div><QrCode size={18} aria-hidden="true" /><span><b>QR اختصاصی</b><small>برای میز و شبکه‌های اجتماعی</small></span><Check size={17} aria-hidden="true" /></div>
              <div><BarChart3 size={18} aria-hidden="true" /><span><b>صفحهٔ کافه</b><small>قابل دیدن در جست‌وجوی کو کافه</small></span><Check size={17} aria-hidden="true" /></div>
            </div>
          </div>
        </section>

        <section id="panel-request" className={leadStyles.section} aria-labelledby="request-title">
          <h2 id="request-title">راه‌اندازی پنل کافه‌ات را از اینجا شروع کن</h2>
          <PanelRequestForm requestKey={randomUUID()} source={source} />
        </section>

        <section className={styles.benefits} aria-labelledby="benefits-title">
          <div className={styles.sectionHeading}><span>آنچه تحویل می‌گیرید</span><h2 id="benefits-title">پنل برای کارهای واقعی کافه</h2></div>
          <div className={styles.benefitGrid}>
            {benefits.map(({ icon: Icon, title, text }) => <article className={styles.benefit} key={title}><span className={styles.icon}><Icon size={20} aria-hidden="true" /></span><h3>{title}</h3><p>{text}</p></article>)}
          </div>
        </section>

        <section className={styles.process} aria-labelledby="process-title">
          <div className={styles.sectionHeading}><span>فرآیند همکاری</span><h2 id="process-title">از پیام تا تحویل پنل</h2></div>
          <ol className={styles.steps}>
            <li><b>درخواست بدهید</b><span>فرم را پر کنید و کد پیگیری بگیرید؛ تماس و تلگرام هم در دسترس‌اند.</span></li>
            <li><b>شماره و مالکیت را بررسی می‌کنیم</b><span>با شمارهٔ تأییدشده وارد شوید و شعبه را برای بررسی انسانی مالکیت انتخاب کنید.</span></li>
            <li><b>پنل را تحویل بگیرید</b><span>حساب شما به شعبه وصل می‌شود و لینک پنل و QR را دریافت می‌کنید.</span></li>
          </ol>
        </section>

        <section className={styles.contactCard} aria-labelledby="contact-title">
          <div><span className={styles.sectionKicker}>آماده‌ای شروع کنیم؟</span><h2 id="contact-title">مستقیم با علیرضا در ارتباط باش</h2><p>نام کافه، شهر و تعداد شعبه را بفرستید تا مسیر مناسب راه‌اندازی را هماهنگ کنیم.</p></div>
          <div className={styles.contactActions}>
            <a href={OWNER_PHONE_LINK} className={styles.contactPhone}><span dir="ltr">{OWNER_PHONE}</span> <span>تماس مستقیم</span></a>
            <a href={OWNER_TELEGRAM_LINK} target="_blank" rel="noreferrer" className={styles.contactTelegram}>@{OWNER_TELEGRAM} <span>تلگرام</span><ExternalLink size={14} aria-hidden="true" /></a>
          </div>
        </section>

        <section className={styles.faq} aria-labelledby="faq-title">
          <div className={styles.sectionHeading}><span>سؤال‌های معمول</span><h2 id="faq-title">قبل از شروع بدانید</h2></div>
          <div className={styles.faqGrid}>{faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
        </section>

        <footer className={styles.footerCta}>
          <div><h2>قبلاً پنل گرفته‌اید؟</h2><p>از مسیر امن وارد پنل خودتان شوید و اطلاعات شعبه را مدیریت کنید.</p></div>
          <Link href={authUrl(paths.ownerPanel)} className={styles.loginButton}>ورود به پنل کافه <ArrowLeft size={17} aria-hidden="true" /></Link>
        </footer>
      </main>
    </>
  )
}
