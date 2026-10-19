import type { Metadata } from 'next'
import { cache } from 'react'
import Link from 'next/link'
import { ArrowLeft, MessageCircle, Star } from 'lucide-react'
import { listPublicReviewPage } from '@/core/discovery/trustedReviews'
import { pagePath } from '@/core/discovery/pagination'
import { DiscoveryPagination } from '@/components/discovery/DiscoveryPagination'
import { BreadcrumbJsonLd } from '@/components/seo/PlaceJsonLd'
import { paths } from '@/routes'
import styles from './page.module.css'

type Props = { searchParams: Promise<{ page?: string | string[] }> }
const loadPage = cache(listPublicReviewPage)
const description = 'نظرها و امتیازهای تأییدشده درباره کافه‌ها و رستوران‌های مشهد؛ جدیدترین تجربه‌های عمومی با تفکیک نظر کاربران و بلاگرها.'

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { pagination } = await loadPage((await searchParams).page)
  const title = `نظرهای کافه‌ها و رستوران‌های مشهد${pagination.page > 1 ? `؛ صفحه ${pagination.page.toLocaleString('fa-IR')}` : ''}`
  const canonical = pagePath(paths.reviews, pagination.page)
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { type: 'website', title, description, url: canonical, images: ['/brand/og-home.png'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/brand/og-home.png'] },
    robots: { index: pagination.total > 0, follow: true },
  }
}

export default async function PublicReviewsPage({ searchParams }: Props) {
  const { reviews, pagination } = await loadPage((await searchParams).page)
  return <>
    <BreadcrumbJsonLd items={[{ name: 'کو کافه', path: paths.home }, { name: 'نظرهای عمومی', path: paths.reviews }]} />
    <main className={styles.page}>
      <header className={styles.hero}>
        <span className={styles.kicker}><MessageCircle size={17} aria-hidden="true" /> تجربه‌های منتشرشده</span>
        <h1>نظرهای کافه‌ها و رستوران‌ها</h1>
        <p>جدیدترین نظرها و امتیازهای تأییدشده دربارهٔ کافه‌ها و رستوران‌های مشهد. نظر کاربران و بلاگرها با برچسب جدا مشخص شده‌اند.</p>
        <Link href={paths.reviewedCafes} className={styles.bloggerLink}>بررسی کافه‌ها توسط بلاگرها <ArrowLeft size={16} aria-hidden="true" /></Link>
      </header>
      <section aria-labelledby="reviews-title" id="reviews" className={styles.results}>
        <div className={styles.heading}>
          <h2 id="reviews-title">تازه‌ترین نظرها</h2>
          <span>{pagination.total.toLocaleString('fa-IR')} نظر تأییدشده</span>
        </div>
        {reviews.length > 0 ? <>
          <p className={styles.range}>نمایش {(pagination.offset + 1).toLocaleString('fa-IR')} تا {(pagination.offset + reviews.length).toLocaleString('fa-IR')}</p>
          <ul className={styles.grid}>
            {reviews.map(card => <li key={card.reviewId}>
              <article className={styles.card}>
                <Link className={styles.venue} href={`${paths.cafe(card.placeSlug)}#reviews`}>
                  {card.placeImage
                    ? <img src={card.placeImage} alt="" width={64} height={64} loading="lazy" />
                    : <span className={styles.fallback}><MessageCircle size={24} aria-hidden="true" /></span>}
                  <div><h3>{card.placeName}</h3><small>{card.districtName ?? 'مشهد'}{card.placeStatus === 'temporarily_closed' ? ' · موقتاً بسته' : ''}</small></div>
                </Link>
                <div className={styles.meta}>
                  <span className={styles.badge} data-blogger={card.isBloggerReview}>{card.isBloggerReview ? 'نظر بلاگر' : 'نظر کاربر'}</span>
                  {card.stars !== null && <span className={styles.stars} aria-label={`${card.stars.toLocaleString('fa-IR')} از ۵ ستاره`}><Star size={14} fill="currentColor" aria-hidden="true" /> {card.stars.toLocaleString('fa-IR')} از ۵</span>}
                  <time dateTime={card.reviewedAt.toISOString()}>{card.reviewedAt.toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' })}</time>
                </div>
                {card.excerpt && card.excerpt !== '…'
                  ? <blockquote>{card.excerpt}</blockquote>
                  : <p className={styles.noText}>{card.excerpt ? 'متن این نظر پس از حذف اطلاعات تماس قابل نمایش نیست.' : 'این نظر فقط امتیاز دارد.'}</p>}
                <Link href={`${paths.cafe(card.placeSlug)}#reviews`} className={styles.reviewLink} aria-label={`نظرهای ${card.placeName}`}>نظرها در صفحهٔ کافه <ArrowLeft size={16} aria-hidden="true" /></Link>
              </article>
            </li>)}
          </ul>
          <DiscoveryPagination basePath={paths.reviews} {...pagination} anchor="reviews" />
        </> : <div className={styles.empty}><p>هنوز نظری برای نمایش عمومی منتشر نشده است.</p><Link href={paths.search}>کافه‌های مشهد را ببین <ArrowLeft size={16} aria-hidden="true" /></Link></div>}
      </section>
    </main>
  </>
}
