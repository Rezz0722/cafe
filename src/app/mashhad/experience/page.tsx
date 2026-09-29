import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ExperienceClickTracker } from '@/components/experience/ExperienceClickTracker'
import { BreadcrumbJsonLd } from '@/components/seo/PlaceJsonLd'
import { listExperienceSummaries } from '@/core/experience/queries'
import { getLocalePolicy, getSiteName } from '@/core/settings/policies'
import { maintenanceState } from '@/core/settings/maintenance'
import { MaintenanceScreen } from '@/components/site/MaintenanceScreen'
import { faCount } from '@/lib/format'
import { absoluteUrl, paths } from '@/routes'
import styles from './experience.module.css'

export const revalidate = 300

export async function generateMetadata(): Promise<Metadata> {
  const [locale, siteName] = await Promise.all([getLocalePolicy(), getSiteName()])
  const title = `انتخاب کافه بر اساس تجربه در ${locale.cityName}`
  const description = `کافه‌های ${locale.cityName} را برای کار، قرار، عکاسی، آرامش یا قهوه تخصصی بر اساس اطلاعات ثبت‌شده و معیارهای شفاف در ${siteName} پیدا کنید.`
  return {
    title,
    description,
    alternates: { canonical: paths.experienceHub },
    openGraph: { type: 'website', title, description, url: paths.experienceHub, images: ['/experiences/work.webp'] },
  }
}

export default async function ExperienceHubPage() {
  const gate = await maintenanceState()
  if (gate.closed) return <MaintenanceScreen siteName={gate.siteName} message={gate.message} />
  const [summaries, locale, siteName] = await Promise.all([
    listExperienceSummaries(),
    getLocalePolicy(),
    getSiteName(),
  ])
  const available = summaries.filter((item) => item.candidateCount > 0)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': absoluteUrl(paths.experienceHub),
    name: `انتخاب کافه بر اساس تجربه در ${locale.cityName}`,
    inLanguage: 'fa-IR',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: available.length,
      itemListElement: available.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.experience.title,
        url: absoluteUrl(paths.experience(item.experience.slug)),
      })),
    },
  }

  return (
    <>
      <ExperienceClickTracker />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <BreadcrumbJsonLd items={[{ name: siteName, path: paths.home }, { name: 'تجربه‌ها', path: paths.experienceHub }]} />
      <main className={styles.page}>
        <nav className={styles.breadcrumbs} aria-label="مسیر صفحه"><Link href={paths.home}>خانه</Link><ChevronLeft size={13} /><span>تجربه‌ها</span></nav>
        <header className={styles.hubIntro}>
          <div>
            <span>برای هر برنامه، انتخاب مناسب‌تر</span>
            <h1>کافه را برای چه می‌خواهی؟</h1>
            <p>به‌جای یک فهرست بلند، از نیازت شروع کن. این پیشنهادها بر اساس اطلاعات ثبت‌شده، امکانات و بررسی تحریریه ساخته می‌شوند و ادعای «بهترین» بودن ندارند.</p>
          </div>
          <strong>{available.length.toLocaleString('fa-IR')}<small>تجربهٔ فعال</small></strong>
        </header>

        <section className={styles.experienceGrid} aria-label="انتخاب تجربه">
          {available.map(({ experience, candidateCount }) => (
            <Link
              key={experience.slug}
              href={paths.experience(experience.slug)}
              className={styles.experienceCard}
              data-experience-track="card_click"
              data-experience-slug={experience.slug}
              data-experience-count={candidateCount}
            >
              <img src={experience.image} alt="" width={1536} height={1024} loading="lazy" />
              <span>
                <span><b>{experience.shortTitle}</b><small>{experience.description}</small></span>
                <em className={styles.count}>{faCount(candidateCount)}</em>
              </span>
            </Link>
          ))}
        </section>
      </main>
    </>
  )
}
