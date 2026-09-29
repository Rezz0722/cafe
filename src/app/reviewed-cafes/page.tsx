import type { Metadata } from 'next'
import { cache } from 'react'
import { listPlaceCards } from '@/core/places/queries'
import { PlaceCardView } from '@/components/cafe/PlaceCardView'
import { BreadcrumbJsonLd } from '@/components/seo/PlaceJsonLd'
import { serializeJsonLd } from '@/core/security/jsonLd'
import { absoluteUrl, paths } from '@/routes'
import styles from './page.module.css'

const loadCards = cache(() => listPlaceCards({ bloggerReviewedOnly: true, limit: 120, sort: 'rating' }))

export async function generateMetadata(): Promise<Metadata> {
  const cards = await loadCards()
  const title = 'کافه‌های بررسی‌شده مشهد؛ تجربه بلاگرها و ویدئو'
  const description = 'بررسی کافه‌های مشهد توسط بلاگرهای تأییدشده کو کافه؛ تجربه مراجعه، نظر و لینک ویدئوی اصلی هر بررسی در صفحه همان شعبه.'
  return {
    title,
    description,
    alternates: { canonical: paths.reviewedCafes },
    openGraph: { type: 'website', title, description, url: paths.reviewedCafes },
    robots: { index: cards.length > 0, follow: true },
  }
}

export default async function ReviewedCafesPage() {
  const cards = await loadCards()
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': absoluteUrl(paths.reviewedCafes),
    url: absoluteUrl(paths.reviewedCafes),
    name: 'کافه‌های بررسی‌شده مشهد',
    inLanguage: 'fa-IR',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: cards.length,
      itemListElement: cards.map((card, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: card.name,
        url: absoluteUrl(paths.cafe(card.slug)),
      })),
    },
  }
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <BreadcrumbJsonLd items={[{ name: 'کو کافه', path: paths.home }, { name: 'کافه‌های بررسی‌شده مشهد', path: paths.reviewedCafes }]} />
    <main className={styles.page}>
    <header className={styles.hero}><span>راهنمای تحریریه</span><h1>کافه‌های بررسی‌شده</h1><p>تجربه‌های حضوری بلاگرهای تأییدشده؛ ویدئوی اصلی هر بررسی داخل صفحه همان کافه در دسترس است.</p></header>
    {cards.length ? <ul className={styles.grid}>{cards.map(card => <li key={card.id}><PlaceCardView card={card} /></li>)}</ul> : <div className={styles.empty}>اولین بررسی‌های تأییدشده به‌زودی اینجا نمایش داده می‌شوند.</div>}
    </main>
  </>
}
