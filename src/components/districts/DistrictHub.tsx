'use client'

/**
 * لندینگ محله‌ها: جست‌وجو + نقشه + شبکه‌ی کارت.
 *
 * ═══ چرا جست‌وجو در کلاینت ═══
 *
 * ۲۹ محله از قبل در HTML صفحه‌اند. فیلترکردنشان در مرورگر بلافاصله جواب می‌دهد
 * و یک رفت‌وبرگشت شبکه ندارد — و مهم‌تر: بدون فرم submit کار می‌کند، پس کاربر
 * با هر حرف نتیجه را می‌بیند. برای این حجم، هزینه‌اش صفر است.
 *
 * ═══ چرا نقشه و شبکه هر دو ═══
 *
 * دو نیتِ متفاوت‌اند. کاربری که می‌داند «هاشمیه» را می‌خواهد، دنبال نام است و
 * شبکه/سرچ سریع‌ترین راه اوست. کاربری که تازه به مشهد آمده نمی‌داند محله‌ها
 * کجای شهرند و فقط نقشه به او جواب می‌دهد. حذف هرکدام یکی از این دو را
 * بی‌جواب می‌گذارد.
 *
 * ═══ چرا کلیک روی نقشه یک panel باز می‌کند و مستقیم navigate نمی‌کند ═══
 *
 * روی نقشه، کلیکِ دقیق سخت است و ناوبریِ فوری یعنی کاربر به صفحه‌ای می‌رود که
 * نمی‌خواست و باید back بزند. یک panel کوچک با نام محله و شمار کافه‌ها، تأییدِ
 * ارزانی است — و از همان‌جا یک کلیک تا صفحه‌ی محله.
 */

import { useDeferredValue, useMemo, useState } from 'react'
import Link from 'next/link'
import { Coffee, MapPin, Search, X } from 'lucide-react'
import { CafeMap, type MapLabel, type MapPlace } from '@/components/map/CafeMap'
import { normalizeFa, squashFa } from '@/core/text/normalize'
import { fa, toman } from '@/lib/format'
import { paths } from '@/routes'
import styles from './DistrictHub.module.css'

export interface DistrictCard {
  id: string
  slug: string
  name: string
  placeCount: number
  /** لوگوی بهترین کافه‌ی محله — تصویرِ شاخص. */
  coverUrl: string | null
  priceMedian: number | null
  center: { lat: number; lng: number }
}

interface Props {
  cityName: string
  districts: DistrictCard[]
  totalPlaces: number
  labels: MapLabel[]
  mapConfig: {
    center: { lat: number; lng: number }
    zoom: number
    minZoom: number
    maxZoom: number
  }
}

export function DistrictHub({ cityName, districts, totalPlaces, labels, mapConfig }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<DistrictCard | null>(null)

  // تایپ‌کردن روان می‌ماند: فیلتر فوری است ولی رندرِ دوباره‌ی ۲۹ کارت نه.
  const deferredQuery = useDeferredValue(query)

  const filtered = useMemo(() => {
    const term = squashFa(deferredQuery)
    if (!term) return districts
    /*
      مقایسه روی شکل فشرده انجام می‌شود تا «احمد آباد» هم «احمدآباد» را پیدا
      کند — همان یکسان‌سازی‌ای که موتور جست‌وجو استفاده می‌کند، پس رفتار سرچِ
      این صفحه با سرچ اصلی یکی است.
    */
    return districts.filter((district) => squashFa(district.name).includes(term))
  }, [districts, deferredQuery])

  /** محله‌ها به‌شکل نشانگر نقشه — هر محله یک پین، بدون خوشه‌بندی. */
  const mapPlaces: MapPlace[] = useMemo(
    () =>
      filtered.map((district, index) => ({
        id: index,
        slug: district.slug,
        name: district.name,
        lat: district.center.lat,
        lng: district.center.lng,
        note: `${fa(district.placeCount)} کافه`,
      })),
    [filtered],
  )

  const noResults = filtered.length === 0

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>محله‌های {cityName}</h1>
        <p className={styles.lead}>
          {fa(totalPlaces)} کافه و رستوران در {fa(districts.length)} محله. محله‌ات را انتخاب
          کن یا روی نقشه پیدا کن.
        </p>

        <div className={styles.searchBox}>
          <Search size={18} aria-hidden="true" className={styles.searchIcon} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="نام محله — سجاد، احمدآباد، هاشمیه، طرقبه…"
            aria-label="جست‌وجوی محله"
            className={styles.searchInput}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="پاک‌کردن جست‌وجو"
              className={styles.searchClear}
            >
              <X size={17} aria-hidden="true" />
            </button>
          )}
        </div>

        {query && !noResults && (
          <p className={styles.resultCount} role="status">
            {fa(filtered.length)} محله پیدا شد
          </p>
        )}
      </header>

      {/* ── نقشه ─────────────────────────────────────────────────── */}
      <section className={styles.mapSection} aria-label={`نقشه‌ی محله‌های ${cityName}`}>
        <CafeMap
          places={mapPlaces}
          labels={labels}
          center={mapConfig.center}
          zoom={mapConfig.zoom}
          minZoom={mapConfig.minZoom}
          maxZoom={mapConfig.maxZoom}
          height="380px"
          // ۲۹ محله باید ۲۹ نشانگرِ نام‌دار بمانند، در هر زوم.
          cluster={false}
          alwaysLabel
          linkBase="/mashhad/"
          showLocate={false}
          onSelect={(place) => {
            const match = districts.find((district) => district.slug === place.slug)
            if (match) setSelected(match)
          }}
        />

        {selected && (
          <div className={styles.mapPanel} role="dialog" aria-label={selected.name}>
            <button
              type="button"
              className={styles.mapPanelClose}
              onClick={() => setSelected(null)}
              aria-label="بستن"
            >
              <X size={18} aria-hidden="true" />
            </button>
            <p className={styles.mapPanelName}>{selected.name}</p>
            <p className={styles.mapPanelMeta}>
              {fa(selected.placeCount)} کافه
              {selected.priceMedian !== null && <> · میانه‌ی منو {toman(selected.priceMedian)}</>}
            </p>
            <Link href={paths.district(selected.slug)} className={styles.mapPanelCta}>
              دیدن کافه‌های {selected.name}
            </Link>
          </div>
        )}
      </section>

      {/* ── شبکه‌ی کارت ──────────────────────────────────────────── */}
      {noResults ? (
        <p className={styles.empty}>
          محله‌ای با «{query}» پیدا نشد. شاید نامش را جور دیگری می‌نویسیم —{' '}
          <button type="button" onClick={() => setQuery('')} className={styles.emptyReset}>
            دیدن همه‌ی محله‌ها
          </button>
        </p>
      ) : (
        <ul className={styles.grid}>
          {filtered.map((district) => (
            <li key={district.id}>
              <Link href={paths.district(district.slug)} className={styles.card}>
                <span className={styles.cardMedia}>
                  {district.coverUrl ? (
                    <img
                      src={district.coverUrl}
                      alt=""
                      width={72}
                      height={72}
                      loading="lazy"
                      decoding="async"
                      className={styles.cardImage}
                    />
                  ) : (
                    /* هیچ‌وقت باکس خالی: کاشیِ حرف‌اول، با همان ابعاد. */
                    <span className={styles.cardInitial} aria-hidden="true">
                      {normalizeFa(district.name).charAt(0) || '؟'}
                    </span>
                  )}
                </span>

                <span className={styles.cardBody}>
                  <span className={styles.cardName}>{district.name}</span>
                  <span className={styles.cardCount}>
                    <Coffee size={13} aria-hidden="true" />
                    {fa(district.placeCount)} کافه
                  </span>
                  {district.priceMedian !== null && (
                    <span className={styles.cardPrice}>
                      میانه‌ی منو {toman(district.priceMedian)}
                    </span>
                  )}
                </span>

                <MapPin size={16} aria-hidden="true" className={styles.cardArrow} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default DistrictHub
