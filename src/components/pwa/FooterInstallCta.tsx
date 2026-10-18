'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Download, Smartphone } from 'lucide-react'
import { usePwa } from './PwaProvider'
import styles from '@/components/layout/SiteFooter.module.css'

/** One honest install entry point in the shared footer; browser prompts are optional. */
export function FooterInstallCta() {
  const pathname = usePathname()
  const { installed, platform, embedded, canPrompt, prompting, online, message, install } = usePwa()
  if (installed || pathname === '/install') return null

  const promptable = canPrompt && !embedded && platform !== 'ios'
  const guide = platform === 'ios' ? '/install#ios-install' : platform === 'android' ? '/install#android-install' : '/install'

  return (
    <section className={styles.installBanner} aria-label="نصب کوکافه">
      <span className={styles.installIcon} aria-hidden="true"><Smartphone size={25} /></span>
      <div className={styles.installCopy}>
        <strong>کوکافه رو روی گوشیت داشته باش</strong>
        <p>سریع‌تر به کافه‌ها، منوها و جست‌وجو دسترسی پیدا کن.</p>
        {message && <small role="status">{message}</small>}
      </div>
      {promptable ? (
        <button type="button" className={styles.installButton} disabled={prompting || !online} onClick={() => { void install() }}>
          <Download size={18} aria-hidden="true" /> {prompting ? 'پنجرهٔ نصب…' : 'نصب نرم افزار'}
        </button>
      ) : (
        <Link href={guide} className={styles.installButton}><Download size={18} aria-hidden="true" /> نصب نرم افزار</Link>
      )}
    </section>
  )
}
