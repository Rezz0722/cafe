import Link from 'next/link'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { paths } from '@/routes'

export default function NotFound() {
  return (
    <div className="page">
      <SiteHeader />
      <main
        className="container"
        style={{ padding: '80px 0', textAlign: 'center', minHeight: '40vh' }}
      >
        <div style={{ fontSize: 52, marginBottom: 12 }} aria-hidden="true">
          ☕
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 10 }}>
          این صفحه پیدا نشد
        </h1>
        <p style={{ color: 'var(--c-ink-soft, #777)', marginBottom: 22 }}>
          شاید کافه‌ای که دنبالش بودی جابه‌جا شده یا هنوز ثبت نشده.
        </p>
        <Link
          href={paths.home}
          style={{
            display: 'inline-block',
            padding: '11px 22px',
            borderRadius: 999,
            background: 'var(--c-primary, #5996ff)',
            color: '#fff',
            fontWeight: 700,
          }}
        >
          بازگشت به صفحهٔ اصلی
        </Link>
      </main>
      <SiteFooter />
    </div>
  )
}
