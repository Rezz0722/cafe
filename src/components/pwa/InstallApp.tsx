'use client'

import Link from 'next/link'
import { Check, Download, ExternalLink, Plus, Share2, Smartphone } from 'lucide-react'
import { usePwa } from './PwaProvider'
import styles from './Pwa.module.css'

export function InstallLink() {
  const { installed } = usePwa()
  if (installed) return null
  return <Link href="/install" className={styles.entryLink}><Smartphone size={18} aria-hidden="true" /> نصب کوکافه روی گوشی</Link>
}

export function InstallApp() {
  const { ready, installed, standalone, embedded, platform, online, canPrompt, prompting, message, install, updateReady, update } = usePwa()
  const ios = platform === 'ios'
  return <>
    <div className={styles.installAction}>
      {installed ? <>
        <p className={styles.installed} role="status"><Check size={20} aria-hidden="true" />{standalone ? 'کوکافه را در حالت اپ باز کرده‌ای.' : 'درخواست نصب ثبت شد؛ از آیکون کوکافه روی گوشی وارد شو.'}</p>
        {updateReady && <button className={styles.primary} type="button" onClick={update}>به‌روزرسانی نسخهٔ جدید</button>}
        <Link className={styles.secondary} href="/search">بریم کافه پیدا کنیم</Link>
      </> : canPrompt && !embedded && !ios ? <button className={styles.primary} type="button" disabled={prompting || !online} onClick={() => { void install() }}><Download size={20} aria-hidden="true" />{prompting ? 'پنجرهٔ نصب باز می‌شود…' : 'نصب کوکافه'}</button>
      : <a className={styles.primary} href={ios ? '#ios-install' : '#android-install'}><Smartphone size={20} aria-hidden="true" />{!ready ? 'راهنمای نصب روی گوشی' : ios ? 'راهنمای نصب در آیفون' : platform === 'android' ? 'راهنمای نصب در اندروید' : 'راهنمای نصب کوکافه'}</a>}
      {!installed && <small>بدون دانلود فایل ناشناس؛ نصب از طریق مرورگر خودت.</small>}
      {message && <p className={styles.message} role="status">{message}</p>}
    </div>
    {embedded && <aside className={styles.embedded} role="status"><ExternalLink size={22} aria-hidden="true" /><div><strong>از داخل اینستاگرام یا یک اپ دیگر آمده‌ای؟</strong><p>برای نصب، این صفحه را از منوی همان اپ در مرورگر باز کن؛ روی آیفون Safari و روی اندروید Chrome پیشنهاد می‌شود.</p></div></aside>}
    <div className={styles.guides}>
      <section id="ios-install" className={`${styles.guide} ${ios ? styles.recommended : ''}`} aria-labelledby="ios-title">
        <div className={styles.guideHeading}><h2 id="ios-title">نصب روی آیفون</h2><span dir="ltr">Safari</span></div>
        <ol>
          <li><span>۱</span><div><strong>کوکافه را در Safari باز کن</strong><p><b dir="ltr">kucafe.ir/install</b> را باز کن؛ نه مرورگر داخلی اینستاگرام.</p></div></li>
          <li><span><Share2 size={20} aria-hidden="true" /></span><div><strong>اشتراک‌گذاری را بزن</strong><p>دکمهٔ Share را در نوار یا منوی Safari پیدا کن.</p></div></li>
          <li><span><Plus size={22} aria-hidden="true" /></span><div><strong>افزودن به صفحهٔ اصلی</strong><p><b dir="ltr">Add to Home Screen</b> را بزن؛ اگر گزینهٔ <b dir="ltr">Open as Web App</b> وجود داشت، روشنش کن و <b dir="ltr">Add</b> را بزن.</p></div></li>
        </ol>
        <p className={styles.guideNote}>در آیفون نصب خودکار نداریم. ممکن است بار اول لازم باشد با همان حساب سایت وارد اپ شوی؛ حساب جدید لازم نیست.</p>
      </section>
      <section id="android-install" className={`${styles.guide} ${platform === 'android' ? styles.recommended : ''}`} aria-labelledby="android-title">
        <div className={styles.guideHeading}><h2 id="android-title">نصب روی اندروید</h2><span dir="ltr">Chrome</span></div>
        <ol>
          <li><span>۱</span><div><strong>سایت را در Chrome باز کن</strong><p>به <b dir="ltr">kucafe.ir</b> برو و کمی صبر کن تا مرورگر نصب را آماده کند.</p></div></li>
          <li><span>۲</span><div><strong>دکمهٔ نصب یا منوی سه‌نقطه</strong><p>«نصب کوکافه» را در این صفحه بزن؛ اگر نبود، از منوی مرورگر <b dir="ltr">Install app</b> یا <b dir="ltr">Add to Home screen</b> را انتخاب کن.</p></div></li>
          <li><span><Check size={22} aria-hidden="true" /></span><div><strong>تأیید کن و از آیکون وارد شو</strong><p>کوکافه را از آیکون صفحهٔ اصلی یا فهرست اپ‌های گوشی باز کن.</p></div></li>
        </ol>
        <p className={styles.guideNote}>عنوان گزینه و نوع نصب بسته به مرورگر و گوشی فرق دارد؛ بعضی دستگاه‌ها میان‌بر می‌سازند.</p>
      </section>
    </div>
  </>
}
