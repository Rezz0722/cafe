import type { Metadata } from 'next'
import { Check, MapPin, UtensilsCrossed } from 'lucide-react'
import { InstallApp } from '@/components/pwa/InstallApp'
import styles from '@/components/pwa/Pwa.module.css'

export const metadata: Metadata = {
  title: 'نصب کوکافه روی اندروید و آیفون',
  description: 'نصب نسخهٔ وب‌اپ کوکافه روی گوشی؛ دسترسی مستقیم به کافه‌های مشهد، منو، قیمت، نقشه و باشگاه مشتریان.',
  alternates: { canonical: '/install' },
  robots: { index: false, follow: true },
}

export default function InstallPage() {
  return <main className={styles.page}>
    <section className={styles.hero} aria-labelledby="install-title">
      <div><span className={styles.eyebrow}>کوکافه، یک لمس نزدیک‌تر</span><h1 id="install-title">جای خوب،<br />روی صفحهٔ گوشی‌ات.</h1><p className={styles.intro}>کوکافه را به گوشی اضافه کن؛ دفعهٔ بعد مستقیم سراغ منو، قیمت و کافه‌های موردعلاقه‌ات برو. همین حساب و امکانات سایت، در نسخهٔ وب‌اپ.</p></div>
      <div className={styles.preview} aria-label="آیکون نسخه نصب‌پذیر کوکافه"><img src="/brand/app-icon-192.png" width={192} height={192} alt="" /><strong>کوکافه</strong><span>منو · کشف کافه · باشگاه مشتریان</span><small>KuCafe · kucafe.ir</small></div>
    </section>
    <ul className={styles.features} aria-label="امکانات نسخه نصب‌پذیر"><li><UtensilsCrossed size={18} aria-hidden="true" />منو و قیمت کافه‌ها</li><li><MapPin size={18} aria-hidden="true" />کشف و مسیریابی</li><li><Check size={18} aria-hidden="true" />همان حساب و علاقه‌مندی‌ها</li></ul>
    <InstallApp />
    <section className={styles.trust} aria-labelledby="install-trust"><h2 id="install-trust">قیمت معتبر، با اتصال اینترنت</h2><p>این نسخه وب‌اپ است، نه اپ بومی فروشگاه‌ها. نصب از مرورگر انجام می‌شود و امکانات سایت برای دریافت اطلاعات به اینترنت نیاز دارند. در قطع اتصال، صفحهٔ راهنما نشان می‌دهیم؛ قیمت، تخفیف و اطلاعات شخصی را در کش آفلاین نگه نمی‌داریم.</p><p>روی کامپیوتر هم در مرورگرهای پشتیبانی‌کننده، گزینهٔ نصب را در نوار آدرس یا منوی مرورگر پیدا می‌کنی.</p></section>
  </main>
}
