'use client'

import type { menuReadiness, SetupTarget } from '@/core/places/menuReadiness'
import { fa } from '@/lib/format'
import styles from './MenuSetupChecklist.module.css'

export function MenuSetupChecklist({ readiness, onSelect }: {
  readiness: ReturnType<typeof menuReadiness>
  onSelect: (target: SetupTarget) => void
}) {
  return <section className={styles.card} aria-labelledby="menu-setup-title">
    <header className={styles.header}>
      <div><h2 id="menu-setup-title">منوی شعبه‌ات را آماده کن</h2><p>قدم بعدی را انتخاب کن؛ تغییرات هر بخش را با دکمهٔ ذخیره ثبت کن.</p></div>
      <strong>{fa(readiness.completed)} از {fa(readiness.steps.length)} قدم</strong>
    </header>
    <progress className={styles.progress} value={readiness.completed} max={readiness.steps.length} aria-label="قدم‌های تکمیل‌شدهٔ آماده‌سازی منو" />
    <ol className={styles.list}>
      {readiness.steps.map((step, index) => <li key={step.id}>
        <span className={styles.number} aria-hidden="true">{fa(index + 1)}</span>
        <div><strong>{step.title}</strong><p>{step.detail}</p><small>{step.complete ? 'اطلاعات ثبت شده' : 'نیاز به بررسی و تکمیل'}</small></div>
        <button type="button" onClick={() => onSelect(step.target)} aria-label={`${step.complete ? 'بررسی' : 'تکمیل'} ${step.title}`}>{step.complete ? 'بررسی' : 'تکمیل'}</button>
      </li>)}
    </ol>
    <footer className={styles.footer}>
      <p>این چک‌لیست راهنماست، نه تأیید صحت داده یا انتشار خودکار. «قیمت روز» مانع نمایش منوی فعلی نمی‌شود.</p>
      {!readiness.publicDestination && <p>صفحهٔ این شعبه هنوز عمومی نیست؛ برای بررسی وضعیت انتشار با مدیر کو کافه هماهنگ کنید.</p>}
      {readiness.temporarilyClosed && <p>شعبه تعطیل موقت است؛ پیش از توزیع QR، وضعیت و ساعات را بررسی کنید.</p>}
      <button type="button" onClick={() => onSelect(readiness.next?.target ?? 'qr')}>
        {readiness.next ? `قدم بعدی: ${readiness.next.title}` : 'بررسی مقصد و دریافت QR'}
      </button>
    </footer>
  </section>
}
