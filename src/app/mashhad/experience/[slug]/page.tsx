import type { Metadata } from 'next'
import Link from 'next/link'
import { BadgeCheck, ChevronLeft, Info, Search } from 'lucide-react'
import { notFound } from 'next/navigation'
import { CafeCard } from '@/components/cafe/CafeCard'
import { ExperienceClickTracker } from '@/components/experience/ExperienceClickTracker'
import { BreadcrumbJsonLd } from '@/components/seo/PlaceJsonLd'
import { MaintenanceScreen } from '@/components/site/MaintenanceScreen'
import { ATTRIBUTE_BY_ID } from '@/core/taxonomy/attributes'
import { listFilterFacets } from '@/core/places/queries'
import { listExperienceCandidates } from '@/core/experience/queries'
import { EXPERIENCE_BY_SLUG, isExperienceSlug } from '@/core/experience/registry'
import { maintenanceState } from '@/core/settings/maintenance'
import { getLocalePolicy, getSiteName } from '@/core/settings/policies'
import { searchPath } from '@/core/search/filters'
import { faCount } from '@/lib/format'
import { absoluteUrl, paths } from '@/routes'
import styles from '../experience.module.css'

interface PageProps { params: Promise<{ slug: string }> }

export const revalidate = 300

export function generateStaticParams() {
  return [...EXPERIENCE_BY_SLUG.keys()].map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const slug = decodeURIComponent((await params).slug)
  if (!isExperienceSlug(slug)) return { title: 'تجربه پیدا نشد', robots: { index: false, follow: true } }
  const experience = EXPERIENCE_BY_SLUG.get(slug)!
  const [{ total }, locale, siteName] = await Promise.all([
    listExperienceCandidates(experience, 1),
    getLocalePolicy(),
    getSiteName(),
  ])
  const title = `${experience.title} در ${locale.cityName}`
  const description = `${faCount(total)} گزینه برای ${experience.shortTitle} در ${locale.cityName}؛ بر اساس اطلاعات ثبت‌شده، امکانات و شواهد شفاف در ${siteName}.`
  return {
    title,
    description,
    alternates: { canonical: paths.experience(slug) },
    robots: { index: total >= experience.minIndexCandidates, follow: true },
    openGraph: {
      type: 'website',
      title,
      description,
      url: paths.experience(slug),
      images: [{ url: experience.image, width: 1536, height: 1024, alt: experience.imageAlt }],
    },
  }
}

export default async function ExperiencePage({ params }: PageProps) {
  const gate = await maintenanceState()
  if (gate.closed) return <MaintenanceScreen siteName={gate.siteName} message={gate.message} />
  const slug = decodeURIComponent((await params).slug)
  if (!isExperienceSlug(slug)) notFound()
  const experience = EXPERIENCE_BY_SLUG.get(slug)!
  const [{ candidates, total }, facets, locale, siteName] = await Promise.all([
    listExperienceCandidates(experience),
    listFilterFacets(),
    getLocalePolicy(),
    getSiteName(),
  ])
  const facetLabels = Object.fromEntries(facets.map((facet) => [facet.id, facet.labelFa]))
  const criteria = [experience.primaryAttributeId, ...experience.supportingAttributeIds]
    .map((id) => ATTRIBUTE_BY_ID.get(id)?.labelFa)
    .filter((label): label is string => Boolean(label))
  const pageUrl = paths.experience(slug)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': absoluteUrl(pageUrl),
    name: `${experience.title} در ${locale.cityName}`,
    description: experience.description,
    inLanguage: 'fa-IR',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: total,
      itemListElement: candidates.map((candidate, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: candidate.card.name,
        url: absoluteUrl(paths.cafe(candidate.card.slug)),
      })),
    },
  }

  return (
    <>
      <ExperienceClickTracker />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <BreadcrumbJsonLd items={[
        { name: siteName, path: paths.home },
        { name: 'تجربه‌ها', path: paths.experienceHub },
        { name: experience.shortTitle, path: pageUrl },
      ]} />
      <main className={styles.page}>
        <nav className={styles.breadcrumbs} aria-label="مسیر صفحه">
          <Link href={paths.home}>خانه</Link><ChevronLeft size={13} />
          <Link href={paths.experienceHub}>تجربه‌ها</Link><ChevronLeft size={13} />
          <span>{experience.shortTitle}</span>
        </nav>

        <header className={styles.hero}>
          <img className={styles.heroImage} src={experience.image} alt={experience.imageAlt} width={1536} height={1024} />
          <div className={styles.heroContent}>
            <span className={styles.kicker}><BadgeCheck size={15} /> پیشنهاد بر اساس اطلاعات ثبت‌شده</span>
            <h1>{experience.title} در {locale.cityName}</h1>
            <p>{experience.description}</p>
            <div className={styles.heroMeta}>
              <span>{faCount(total)}</span>
              <Link href={searchPath({ attributes: [experience.primaryAttributeId] })}><Search size={14} /> فیلتر و مرتب‌سازی</Link>
            </div>
          </div>
        </header>

        <section className={styles.criteria}>
          <h2>چه اطلاعاتی بررسی می‌شود؟</h2>
          <p>سیگنال اصلی برای ورود به فهرست لازم است؛ موارد کمکی ترتیب و دلیل پیشنهاد را دقیق‌تر می‌کنند.</p>
          <div className={styles.criteriaChips}>{criteria.map((label) => <span key={label}>{label}</span>)}</div>
        </section>

        <section className={styles.results}>
          <div className={styles.resultsHead}>
            <div><span>کاندیداها، نه رتبه‌بندی «بهترین»</span><h2>کافه‌های مناسب این تجربه</h2><p>روی هر کارت دلیل‌هایی را می‌بینی که از اطلاعات همان کافه آمده‌اند.</p></div>
          </div>
          {candidates.length > 0 ? (
            <div className={styles.candidateGrid}>
              {candidates.map((candidate, index) => (
                <article className={styles.candidate} key={candidate.card.id}>
                  <CafeCard
                    card={candidate.card}
                    facetLabels={facetLabels}
                    experienceTracking={{ slug, resultCount: total, rank: index + 1 }}
                  />
                  <div className={styles.reasons}>
                    <strong>چرا پیشنهاد شده؟</strong>
                    {candidate.reasons.map((reason) => <span key={reason}>{reason}</span>)}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.empty}><Info size={30} /><h2>هنوز گزینهٔ تأییدشده‌ای نداریم</h2><p>این صفحه آماده است، اما تا زمانی که اطلاعات کافی ثبت نشود چیزی را به‌عنوان پیشنهاد نمایش نمی‌دهیم.</p></div>
          )}
        </section>

        <aside className={styles.method}>
          <strong>این فهرست چطور ساخته شده؟</strong>
          <p>ورود هر کافه به این صفحه به یک سیگنال اصلی ثبت‌شده نیاز دارد. مقدار «بله» بالاتر از «نسبی» قرار می‌گیرد و شواهد کمکی، Confidence و تازگی بررسی فقط ترتیب را دقیق‌تر می‌کنند. این نتیجه AI Score یا ادعای بهترین‌بودن نیست.</p>
        </aside>
      </main>
    </>
  )
}
