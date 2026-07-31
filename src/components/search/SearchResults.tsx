'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ResultCard } from '@/components/cafe/ResultCard'
import { BackChevron, MobileShell, shellStyles } from '@/components/layout/MobileShell'
import { CafePhoto } from '@/components/ui/CafePhoto'
import { Chip } from '@/components/ui/Chip'
import { useSavedCafes } from '@/hooks/useSavedCafes'
import { fa, faDecimal } from '@/lib/format'
import { paths } from '@/routes'
import { FILTER_ATTRIBUTES, INTENT_ATTRIBUTES } from '@/core/taxonomy/attributes'
import { countAdvanced, searchHref, type SearchState } from '@/core/search/urlState'
import { PRICE_TIER_LABELS } from '@/types'
import type { District, PlaceView } from '@/core/places/types'
import styles from './SearchResults.module.css'

const PRICE_OPTIONS: { key: 1 | 2 | 3 | null; label: string }[] = [
  { key: null, label: 'همه' },
  { key: 1, label: PRICE_TIER_LABELS[1] },
  { key: 2, label: PRICE_TIER_LABELS[2] },
  { key: 3, label: PRICE_TIER_LABELS[3] },
]

const KIND_OPTIONS: { key: 'cafe' | 'cafe_restaurant' | null; label: string }[] = [
  { key: null, label: 'همه' },
  { key: 'cafe', label: 'کافه' },
  { key: 'cafe_restaurant', label: 'کافه‌رستوران' },
]

const SORT_OPTIONS: { key: SearchState['sort']; label: string }[] = [
  { key: 'relevance', label: 'مرتبط‌ترین' },
  { key: 'rating', label: 'بیشترین امتیاز' },
  { key: 'near', label: 'نزدیک‌ترین' },
  { key: 'popular', label: 'محبوب‌ترین' },
]

/**
 * پین‌ها را روی نقشه‌ی جانشین پخش می‌کند. از روی اندیس محاسبه می‌شود تا یک
 * مجموعه‌ی نتیجه همیشه یک چیدمان بدهد.
 *
 * ⚠️  این نقشه‌ی واقعی نیست. جایگزینی‌اش با تایل نشان یا بلد، کار فاز ۱ است
 *     (بخش ۱ سند معماری — گوگل‌مپ در ایران قابل استفاده نیست).
 */
function pinPosition(index: number): { top: string; inlineStart?: string; inlineEnd?: string } {
  const top = `${18 + ((index * 29) % 64)}%`
  const offset = `${12 + ((index * 23) % 60)}%`
  return index % 2 === 0 ? { top, inlineEnd: offset } : { top, inlineStart: offset }
}

interface SearchResultsProps {
  state: SearchState
  results: PlaceView[]
  fallback: PlaceView[]
  districts: District[]
}

/**
 * نمای نتایج جست‌وجو.
 *
 * جست‌وجو *روی سرور* انجام شده و نتیجه به‌صورت prop می‌رسد. این کامپوننت فقط
 * نمایش و ناوبری را انجام می‌دهد: هر تغییر فیلتر یک `router.push` است که
 * سرور را دوباره اجرا می‌کند. یعنی هر حالتِ فیلترشده یک URL واقعیِ
 * قابل‌اشتراک و قابل‌ایندکس است.
 */
export function SearchResults({ state, results, fallback, districts }: SearchResultsProps) {
  const router = useRouter()
  const { isSaved, toggle } = useSavedCafes()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draftQuery, setDraftQuery] = useState(state.query)

  const advancedCount = countAdvanced(state)
  const trimmed = state.query.trim()
  const summary = `${fa(results.length)} کافه${trimmed ? ` برای «${trimmed}»` : ''} پیدا شد`

  const go = (next: Partial<SearchState>) => router.push(searchHref({ ...state, ...next }))

  const districtName = (id: string) => districts.find((d) => d.id === id)?.name ?? ''

  function toggleIntent(id: string) {
    const next = state.attributeIds.includes(id)
      ? state.attributeIds.filter((a) => a !== id)
      : [...state.attributeIds, id]
    go({ attributeIds: next })
  }

  function clearFilters() {
    // خودِ عبارت جست‌وجو فیلتر نیست، پس پاک‌کردن نباید به آن دست بزند.
    go({
      attributeIds: [],
      districtId: '',
      priceTier: null,
      kind: null,
      openNow: false,
      sort: 'relevance',
    })
  }

  return (
    <MobileShell>
      {/* ===== sticky search + filter rail ===== */}
      <div className={shellStyles.stickyTop}>
        <div className={styles.searchRow}>
          <button
            type="button"
            className={shellStyles.iconButton}
            aria-label="بازگشت"
            onClick={() => router.push(paths.home)}
          >
            <BackChevron />
          </button>
          <form
            className={styles.searchField}
            onSubmit={(e) => {
              e.preventDefault()
              go({ query: draftQuery })
            }}
          >
            <span className={styles.searchIcon} aria-hidden="true">
              ⌕
            </span>
            <input
              className={styles.searchInput}
              type="search"
              value={draftQuery}
              onChange={(e) => setDraftQuery(e.target.value)}
              placeholder="دنبال چی می‌گردی؟"
              aria-label="جستجوی کافه"
            />
          </form>
        </div>

        <div className={`${shellStyles.scrollX} ${styles.filterRail}`}>
          <button
            type="button"
            className={styles.filterButton}
            onClick={() => setSheetOpen(true)}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="7" y1="12" x2="17" y2="12" />
              <line x1="10" y1="18" x2="14" y2="18" />
            </svg>
            فیلترها
            {advancedCount > 0 && <span className={styles.filterCount}>{fa(advancedCount)}</span>}
          </button>

          <Chip
            label="باز الان"
            size="sm"
            selected={state.openNow}
            onClick={() => go({ openNow: !state.openNow })}
          />

          {INTENT_ATTRIBUTES.map((attr) => (
            <Chip
              key={attr.id}
              label={attr.labelFa}
              size="sm"
              selected={state.attributeIds.includes(attr.id)}
              onClick={() => toggleIntent(attr.id)}
            />
          ))}
        </div>
      </div>

      {/* ===== summary + view toggle ===== */}
      <div className={styles.summaryRow}>
        <div className={styles.summary}>{summary}</div>
        <div className={styles.viewToggle} role="tablist" aria-label="نحوهٔ نمایش">
          <button
            type="button"
            role="tab"
            aria-selected={state.view === 'list'}
            className={`${styles.viewTab} ${state.view === 'list' ? styles.viewTabActive : ''}`}
            onClick={() => go({ view: 'list' })}
          >
            لیست
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={state.view === 'map'}
            className={`${styles.viewTab} ${state.view === 'map' ? styles.viewTabActive : ''}`}
            onClick={() => go({ view: 'map' })}
          >
            نقشه
          </button>
        </div>
      </div>

      {/* ===== list view ===== */}
      {state.view === 'list' && (
        <div className={styles.listWrap}>
          {results.length > 0 ? (
            <div className={styles.list}>
              {results.map((place) => (
                <ResultCard
                  key={place.id}
                  place={place}
                  selectedAttributeIds={state.attributeIds}
                  saved={isSaved(place.slug)}
                  onToggleSave={() => toggle(place.slug)}
                />
              ))}
            </div>
          ) : (
            <>
              <div className={styles.empty}>
                <div className={styles.emptyIcon} aria-hidden="true">
                  🔍
                </div>
                <div className={styles.emptyTitle}>چیزی با این مشخصات پیدا نشد</div>
                <div className={styles.emptyText}>
                  فیلترها رو کمتر کن یا یه محلهٔ دیگه امتحان کن.
                </div>
                <button type="button" className={styles.emptyCta} onClick={clearFilters}>
                  پاک‌کردن همهٔ فیلترها
                </button>
              </div>

              <div className={styles.suggestTitle}>شاید این‌ها رو دوست داشته باشی</div>
              <div className={styles.suggestList}>
                {fallback.map((place) => (
                  <Link
                    key={place.id}
                    href={paths.cafe(place.slug)}
                    className={styles.suggestRow}
                  >
                    <div className={styles.suggestThumb}>
                      <CafePhoto
                        alt={`فضای ${place.name}`}
                        src={place.photos[0]?.url}
                        placeholder="عکس"
                      />
                    </div>
                    <div className={styles.suggestBody}>
                      <div className={styles.suggestName}>{place.name}</div>
                      <div className={styles.suggestHood}>{districtName(place.districtId)}</div>
                      <div className={styles.suggestMeta}>
                        <span className={styles.star} aria-hidden="true">
                          ★
                        </span>{' '}
                        {`${faDecimal(Number(place.rawRating.toFixed(1)))} · ${
                          PRICE_TIER_LABELS[place.priceTier]
                        }`}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ===== map view ===== */}
      {state.view === 'map' && (
        <div className={styles.mapWrap}>
          <div className={styles.mapCanvas}>
            {results.slice(0, 6).map((place, index) => {
              const { top, inlineStart, inlineEnd } = pinPosition(index)
              return (
                <Link
                  key={place.id}
                  href={paths.cafe(place.slug)}
                  className={styles.pin}
                  style={{ top, insetInlineStart: inlineStart, insetInlineEnd: inlineEnd }}
                  aria-label={`${place.name} — امتیاز ${faDecimal(
                    Number(place.rawRating.toFixed(1)),
                  )}`}
                >
                  {faDecimal(Number(place.rawRating.toFixed(1)))}
                </Link>
              )
            })}
          </div>
          <p className={styles.mapNote}>{`${summary} — روی هر پین بزن تا جزئیاتش رو ببینی.`}</p>
        </div>
      )}

      {/* ===== filter sheet ===== */}
      {sheetOpen && (
        <div
          className={shellStyles.overlay}
          role="presentation"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className={shellStyles.sheet}
            role="dialog"
            aria-modal="true"
            aria-label="فیلترها"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={shellStyles.sheetGrip} />
            <div className={styles.sheetHead}>
              <div className={shellStyles.screenTitle}>فیلترها</div>
              <button type="button" className={styles.sheetClear} onClick={clearFilters}>
                پاک‌کردن
              </button>
            </div>

            <div className={styles.sheetLabel}>محله</div>
            <div className={styles.sheetGroup}>
              <Chip
                label="همه"
                size="sm"
                selected={state.districtId === ''}
                onClick={() => go({ districtId: '' })}
              />
              {districts.map((d) => (
                <Chip
                  key={d.id}
                  label={d.name}
                  size="sm"
                  selected={state.districtId === d.id}
                  onClick={() => go({ districtId: d.id })}
                />
              ))}
            </div>

            <div className={styles.sheetLabel}>سطح قیمت</div>
            <div className={styles.sheetGroup}>
              {PRICE_OPTIONS.map((option) => (
                <Chip
                  key={option.label}
                  label={option.label}
                  size="sm"
                  selected={state.priceTier === option.key}
                  onClick={() => go({ priceTier: option.key })}
                />
              ))}
            </div>

            <div className={styles.sheetLabel}>نوع مکان</div>
            <div className={styles.sheetGroup}>
              {KIND_OPTIONS.map((option) => (
                <Chip
                  key={option.label}
                  label={option.label}
                  size="sm"
                  selected={state.kind === option.key}
                  onClick={() => go({ kind: option.key })}
                />
              ))}
            </div>

            {/* ویژگی‌های متمایزکننده — همان چیزهایی که گوگل‌مپ ندارد */}
            <div className={styles.sheetLabel}>امکانات</div>
            <div className={styles.sheetGroup}>
              {FILTER_ATTRIBUTES.filter((a) => a.kind !== 'intent').map((attr) => (
                <Chip
                  key={attr.id}
                  label={attr.labelFa}
                  size="sm"
                  selected={state.attributeIds.includes(attr.id)}
                  onClick={() => toggleIntent(attr.id)}
                />
              ))}
            </div>

            <div className={styles.sheetLabel}>مرتب‌سازی</div>
            <div className={`${styles.sheetGroup} ${styles.sheetGroupLast}`}>
              {SORT_OPTIONS.map((option) => (
                <Chip
                  key={option.key}
                  label={option.label}
                  size="sm"
                  selected={state.sort === option.key}
                  onClick={() => go({ sort: option.key })}
                />
              ))}
            </div>

            <button
              type="button"
              className={shellStyles.primaryButton}
              onClick={() => setSheetOpen(false)}
            >
              {`نمایش ${fa(results.length)} نتیجه`}
            </button>
          </div>
        </div>
      )}
    </MobileShell>
  )
}
