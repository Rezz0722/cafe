import type { Metadata } from 'next'
import { cache } from 'react'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { CheckCircle2, ChevronLeft, Clock3, MapPin, Store, XCircle } from 'lucide-react'
import { MenuItemImage } from '@/components/cafe/MenuItemImage'
import { SharePlaceButton } from '@/components/cafe/SharePlaceButton'
import { MenuItemCard } from '@/components/items/MenuItemCard'
import { Stars } from '@/components/ui/Stars'
import { itemSlug, parseItemPublicId } from '@/core/items/identity'
import { getMenuItemByPublicId, listSimilarMenuItems } from '@/core/items/queries'
import { listMenuItemReviews } from '@/core/places/queries'
import { MaintenanceScreen } from '@/components/site/MaintenanceScreen'
import { maintenanceState } from '@/core/settings/maintenance'
import { absoluteUrl, paths } from '@/routes'
import { isIndexableMenuItem } from '@/core/seo/indexability'
import { fa, toman } from '@/lib/format'
import { serializeJsonLd } from '@/core/security/jsonLd'
import styles from './page.module.css'

interface PageProps {
  params: Promise<{ publicId: string; slug: string }>
}

const loadItemReviews = cache((itemId: number) => listMenuItemReviews(itemId))

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { publicId } = await params
  const id = parseItemPublicId(publicId)
  const item = id ? await getMenuItemByPublicId(id) : null
  if (!item) return { title: 'آیتم پیدا نشد', robots: { index: false, follow: true } }

  const title = `${item.name} در ${item.place.name}`
  const description = item.description?.replace(/\s+/g, ' ').slice(0, 155) ??
    `${item.name} از منوی ${item.place.name}${item.place.districtName ? ` در ${item.place.districtName}` : ''}${item.price !== null ? `، ${toman(item.price)}` : ''}.`
  const canonical = paths.item(item.publicId, itemSlug(item.name))
  // نگاشت به غذا یا یک تصویر به‌تنهایی ارزش صفحهٔ مستقل را اثبات نمی‌کند.
  const reviews = await loadItemReviews(item.id)
  const thin = !isIndexableMenuItem(Boolean(item.image), item.description, reviews.length)

  return {
    title,
    description,
    alternates: { canonical },
    robots: thin ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'website',
      title,
      description,
      url: canonical,
      images: item.image ? [{ url: item.image.fullUrl }] : undefined,
    },
  }
}

export default async function MenuItemPage({ params }: PageProps) {
  const gate = await maintenanceState()
  if (gate.closed) return <MaintenanceScreen siteName={gate.siteName} message={gate.message} />

  const { publicId, slug } = await params
  const id = parseItemPublicId(publicId)
  if (!id) notFound()

  const item = await getMenuItemByPublicId(id)
  if (!item) notFound()

  const canonicalSlug = itemSlug(item.name)
  let requestedSlug = slug
  try {
    requestedSlug = decodeURIComponent(slug)
  } catch {
    // مقدار خراب به canonical امن هدایت می‌شود.
  }
  if (requestedSlug !== canonicalSlug) permanentRedirect(paths.item(item.publicId, canonicalSlug))

  const [similar, reviews] = await Promise.all([
    listSimilarMenuItems(item, 6),
    loadItemReviews(item.id),
  ])
  const canonicalPath = paths.item(item.publicId, canonicalSlug)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: item.name,
    description: item.description || undefined,
    image: item.image?.fullUrl ? [absoluteUrl(item.image.fullUrl)] : undefined,
    category: item.dishName ?? item.facetLabel ?? item.sectionName,
    url: absoluteUrl(canonicalPath),
    brand: { '@type': 'Brand', name: item.place.name },
    offers:
      item.price === null
        ? undefined
        : {
            '@type': 'Offer',
            priceCurrency: 'IRR',
            price: item.price * 10,
            availability: item.available
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
            seller: { '@type': 'LocalBusiness', name: item.place.name },
            url: absoluteUrl(canonicalPath),
          },
  }

  return (
    <main className={styles.wrap}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />

      <nav className={styles.breadcrumbs} aria-label="مسیر صفحه">
        <Link href={paths.home}>خانه</Link>
        <ChevronLeft size={14} aria-hidden="true" />
        <Link href={paths.menuHub}>منوهای مشهد</Link>
        {item.dishSlug && <><ChevronLeft size={14} aria-hidden="true" /><Link href={paths.dish(item.dishSlug)}>{item.dishName}</Link></>}
        <ChevronLeft size={14} aria-hidden="true" />
        <Link href={paths.cafe(item.place.slug)}>{item.place.name}</Link>
        <ChevronLeft size={14} aria-hidden="true" />
        <span aria-current="page">{item.name}</span>
      </nav>

      <section className={styles.hero}>
        <div className={styles.visual}>
          <MenuItemImage
            src={item.image?.fullUrl ?? null}
            fallbackSrc={null}
            alt={item.image ? `${item.name} در ${item.place.name}` : ''}
            width={item.image?.width}
            height={item.image?.height}
            size={720}
          />
          {!item.image && <span className={styles.photoNotice}>برای این آیتم هنوز عکس ثبت نشده</span>}
        </div>

        <div className={styles.summary}>
          <div className={styles.eyebrow}>
            <span>{item.dishName ?? item.facetLabel ?? item.sectionName}</span>
            <span className={item.available ? styles.available : styles.soldOut}>
              {item.available ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
              {item.available ? 'موجود در منو' : 'فعلاً ناموجود'}
            </span>
          </div>
          <h1>{item.name}</h1>
          {item.nameEn && <p className={styles.nameEn}>{item.nameEn}</p>}
          {item.description ? (
            <p className={styles.description}>{item.description}</p>
          ) : (
            <p className={styles.descriptionMuted}>توضیحی برای این آیتم ثبت نشده است.</p>
          )}

          {item.variants.length > 0 && (
            <div className={styles.variants}>
              <span>انتخاب‌ها و سایزها</span>
              <ul>
                {item.variants.map((variant) => (
                  <li key={variant.id} data-available={variant.available}>
                    <strong>{variant.label}</strong>
                    <span>{variant.price === null ? 'قیمت روز' : toman(variant.price)}</span>
                    {!variant.available && <em>فعلاً ناموجود</em>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.priceBox}>
            <span>{item.variants.length ? 'قیمت شروع' : 'قیمت ثبت‌شده'}</span>
            <strong>{item.price === null ? 'قیمت روز' : `${item.variants.length ? 'از ' : ''}${toman(item.price)}`}</strong>
          </div>
          {!!item.discountPercent && item.basePrice!=null && <p><del>{toman(item.basePrice)}</del> · {fa(item.discountPercent)}٪ تخفیف فعال کل منو؛ با کد باشگاه جمع نمی‌شود.</p>}
          {item.priceUpdatedAt && (
            <p className={styles.updated}>
              <Clock3 size={14} aria-hidden="true" />
              آخرین به‌روزرسانی قیمت: {new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeZone: 'Asia/Tehran' }).format(item.priceUpdatedAt)}
            </p>
          )}

          <article className={styles.venueCard}>
            <div className={styles.venueIcon}><Store size={22} aria-hidden="true" /></div>
            <div>
              <span>ارائه‌شده در</span>
              <Link href={paths.cafe(item.place.slug)}>{item.place.name}</Link>
              {item.place.districtName && (
                <p><MapPin size={14} aria-hidden="true" />{item.place.districtName}</p>
              )}
            </div>
          </article>

          <div className={styles.actions}>
            <Link href={`${paths.cafe(item.place.slug)}?menu=1&section=${item.sectionId}#menu`} className={styles.primaryAction}>
              دیدن منوی کامل کافه
            </Link>
            <SharePlaceButton name={`${item.name} در ${item.place.name}`} />
          </div>
          <p className={styles.dataNote}>قیمت و موجودی از منوی مجموعه ثبت شده و ممکن است تغییر کرده باشد.</p>
        </div>
      </section>

      <section className={styles.reviews} aria-labelledby="item-reviews-heading">
        <div className={styles.sectionHead}>
          <div>
            <span>تجربهٔ سفارش</span>
            <h2 id="item-reviews-heading">نظرهایی که این آیتم را خورده‌اند</h2>
          </div>
          <Link href={`${paths.cafe(item.place.slug)}#reviews`}>ثبت نظر دربارهٔ کافه</Link>
        </div>
        {reviews.length === 0 ? (
          <p className={styles.emptyReviews}>هنوز کسی این آیتم را در نظرش ثبت نکرده است.</p>
        ) : (
          <ul className={styles.reviewList}>
            {reviews.map((review) => (
              <li key={review.id} className={styles.review}>
                <div className={styles.reviewHead}>
                  <strong>{review.authorName || 'کاربر کو کافه'}</strong>
                  <Stars count={review.stars} size={15} showEmpty />
                </div>
                {review.text && <p className={styles.reviewText}>{review.text}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {similar.length > 0 && (
        <section className={styles.similar} aria-labelledby="similar-heading">
          <div className={styles.sectionHead}>
            <div>
              <span>برای مقایسه</span>
              <h2 id="similar-heading">آیتم‌های مشابه برای مقایسه</h2>
            </div>
            {item.dishSlug && <Link href={paths.dish(item.dishSlug)}>دیدن همه</Link>}
          </div>
          <ul className={styles.similarGrid}>
            {similar.map((candidate) => <li key={candidate.id}><MenuItemCard item={candidate} /></li>)}
          </ul>
        </section>
      )}
    </main>
  )
}
