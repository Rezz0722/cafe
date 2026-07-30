import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ResultCard } from '@/components/cafe/ResultCard'
import { BackChevron, MobileShell, shellStyles } from '@/components/layout/MobileShell'
import { CafePhoto } from '@/components/ui/CafePhoto'
import { Chip } from '@/components/ui/Chip'
import { CAFES } from '@/data/cafes'
import { HOODS, INTENTS, PRICE_LABELS, PRICE_OPTIONS, SORT_OPTIONS, TYPE_OPTIONS } from '@/data/taxonomy'
import { useSavedCafes } from '@/hooks/useSavedCafes'
import { useSearchFilters } from '@/hooks/useSearchFilters'
import { fa, faDecimal } from '@/lib/format'
import { countAdvanced, searchCafes } from '@/lib/search'
import { paths } from '@/routes'
import type { Cafe } from '@/types'
import styles from './SearchResultsPage.module.css'

/** Fallback recommendations shown when the filters match nothing. */
function topRated(limit: number): Cafe[] {
  return [...CAFES].sort((a, b) => b.rating - a.rating).slice(0, limit)
}

/**
 * Scatters pins across the placeholder map. Deterministic from the index so the
 * same result set always draws the same layout.
 */
function pinPosition(index: number): { top: string; inlineStart?: string; inlineEnd?: string } {
  const top = `${18 + ((index * 29) % 64)}%`
  const offset = `${12 + ((index * 23) % 60)}%`
  return index % 2 === 0 ? { top, inlineEnd: offset } : { top, inlineStart: offset }
}

export function SearchResultsPage() {
  const navigate = useNavigate()
  const { state, patch, clearFilters } = useSearchFilters()
  const { isSaved, toggle } = useSavedCafes()
  const [sheetOpen, setSheetOpen] = useState(false)

  const results = useMemo(() => searchCafes(state), [state])
  const advancedCount = countAdvanced(state)

  const trimmedQuery = state.query.trim()
  const summary = `${fa(results.length)} کافه${trimmedQuery ? ` برای «${trimmedQuery}»` : ''} پیدا شد`

  function toggleIntent(intent: string) {
    const next = state.intents.includes(intent)
      ? state.intents.filter((t) => t !== intent)
      : [...state.intents, intent]
    patch({ intents: next })
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
            onClick={() => navigate(paths.home)}
          >
            <BackChevron />
          </button>
          <div className={styles.searchField}>
            <span className={styles.searchIcon} aria-hidden="true">
              ⌕
            </span>
            <input
              className={styles.searchInput}
              type="search"
              value={state.query}
              onChange={(e) => patch({ query: e.target.value })}
              placeholder="دنبال چی می‌گردی؟"
              aria-label="جستجوی کافه"
            />
          </div>
        </div>

        <div className={`${shellStyles.scrollX} ${styles.filterRail}`}>
          <button type="button" className={styles.filterButton} onClick={() => setSheetOpen(true)}>
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
            onClick={() => patch({ openNow: !state.openNow })}
          />

          {INTENTS.map((intent) => (
            <Chip
              key={intent}
              label={intent}
              size="sm"
              selected={state.intents.includes(intent)}
              onClick={() => toggleIntent(intent)}
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
            onClick={() => patch({ view: 'list' })}
          >
            لیست
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={state.view === 'map'}
            className={`${styles.viewTab} ${state.view === 'map' ? styles.viewTabActive : ''}`}
            onClick={() => patch({ view: 'map' })}
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
              {results.map((cafe) => (
                <ResultCard
                  key={cafe.id}
                  cafe={cafe}
                  selectedTags={state.intents}
                  saved={isSaved(cafe.id)}
                  onToggleSave={() => toggle(cafe.id)}
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
                {topRated(3).map((cafe) => (
                  <Link key={cafe.id} to={paths.cafe(cafe.id)} className={styles.suggestRow}>
                    <div className={styles.suggestThumb}>
                      <CafePhoto alt={`فضای ${cafe.name}`} placeholder="عکس" />
                    </div>
                    <div className={styles.suggestBody}>
                      <div className={styles.suggestName}>{cafe.name}</div>
                      <div className={styles.suggestHood}>{cafe.hood}</div>
                      <div className={styles.suggestMeta}>
                        <span className={styles.star} aria-hidden="true">
                          ★
                        </span>{' '}
                        {`${faDecimal(cafe.rating)} · ${PRICE_LABELS[cafe.priceKey]}`}
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
            {results.slice(0, 6).map((cafe, index) => {
              const { top, inlineStart, inlineEnd } = pinPosition(index)
              return (
                <Link
                  key={cafe.id}
                  to={paths.cafe(cafe.id)}
                  className={styles.pin}
                  style={{ top, insetInlineStart: inlineStart, insetInlineEnd: inlineEnd }}
                  aria-label={`${cafe.name} — امتیاز ${faDecimal(cafe.rating)}`}
                >
                  {faDecimal(cafe.rating)}
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
                selected={state.hood === ''}
                onClick={() => patch({ hood: '' })}
              />
              {HOODS.map((hood) => (
                <Chip
                  key={hood}
                  label={hood}
                  size="sm"
                  selected={state.hood === hood}
                  onClick={() => patch({ hood })}
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
                  selected={state.price === option.key}
                  onClick={() => patch({ price: option.key })}
                />
              ))}
            </div>

            <div className={styles.sheetLabel}>نوع مکان</div>
            <div className={styles.sheetGroup}>
              {TYPE_OPTIONS.map((option) => (
                <Chip
                  key={option.label}
                  label={option.label}
                  size="sm"
                  selected={state.type === option.key}
                  onClick={() => patch({ type: option.key })}
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
                  onClick={() => patch({ sort: option.key })}
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
