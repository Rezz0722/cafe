'use client'

/**
 * پنل کافه‌دار.
 *
 * ═══ چه چیزی اینجاست و چرا ═══
 *
 * کافه‌دار سه کار را واقعاً انجام می‌دهد و بقیه‌ی چیزها را تقریباً هرگز:
 *
 *   ۱. **قیمت‌ها را به‌روز می‌کند** — با تورم، هر چند ماه. پرکاربردترین کار،
 *      پس «تغییر دسته‌ای درصدی» در دسترس‌ترین جای منو است. ویرایش تک‌تکِ
 *      ۲۸۷ آیتم یعنی این کار هرگز انجام نمی‌شود و قیمت‌های سایت بیات می‌مانند.
 *   ۲. **ساعت کاری را عوض می‌کند** — تغییر فصلی، رمضان، تعطیلی.
 *   ۳. **به نظرها جواب می‌دهد.**
 *
 * پس همین سه، به‌علاوه‌ی اطلاعات پایه، تب‌های پنل‌اند. تبِ ششمی که کسی باز
 * نمی‌کند فقط پنل را شلوغ می‌کند.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePanelTab } from '@/components/admin/usePanelTab'
import { BulkPricePanel } from './BulkPricePanel'
import { MenuSetupChecklist } from './MenuSetupChecklist'
import { MenuImportPanel } from './MenuImportPanel'
import { menuReadiness } from '@/core/places/menuReadiness'
import dynamic from 'next/dynamic'
const LocationPicker=dynamic(()=>import('./LocationPicker').then(module=>module.LocationPicker),{ssr:false})
import { AuditHistory } from '@/components/admin/AuditHistory'
import { ManagedForm, useManagedActionState, useManagedFormStatus, useUnsavedForms } from '@/components/admin/ManagedForm'
import {
  bulkPriceAction,
  createMenuItemAction,
  venueMenuImportAction,
  createMenuSectionAction,
  menuOperationAction,
  menuVariantAction,
  replyReviewAction,
  saveMenuItemAction,
  saveVenueAttributesAction,
  saveVenueHoursAction,
  saveVenueInfoAction,
  saveVenueUserAction,
  removeVenueUserAction,
  photoOperationAction,
  uploadVenueLogoAction,
  uploadVenuePhotosAction,
} from '@/app/admin/venue/actions'
import { EMPTY_VENUE_STATE } from '@/app/admin/venue/state'
import { WEEKDAY_NAMES } from '@/core/import/normalize'
import { FILTER_ATTRIBUTES } from '@/core/taxonomy/attributes'
import type { OwnerPlaceData } from '@/core/places/manage'
import { fa, toman } from '@/lib/format'
import { Stars } from '@/components/ui/Stars'
import { absoluteUrl, paths } from '@/routes'
import { itemSlug } from '@/core/items/identity'
import { FACET_BY_ID } from '@/core/taxonomy/menuTaxonomy'
import { completenessBreakdown, computeQualityFromFacts } from '@/core/quality/scores'
import { normalizeFa } from '@/core/text/normalize'
import { CATEGORY_ARTWORK_OPTIONS, categoryArtwork } from '@/core/taxonomy/categoryArtwork'
import styles from './VenuePanel.module.css'
import { Archive, ArrowDown, ArrowUp, BadgeCheck, Camera, Check, Clock3, Coffee, Copy, Download, ExternalLink, Eye, ImagePlus, Images, Info, LayoutDashboard, LocateFixed, MapPin, MessageSquareText, Printer, QrCode, RotateCcw, Search, Trash2, Users, UtensilsCrossed } from 'lucide-react'

type Tab = 'overview' | 'info' | 'media' | 'hours' | 'menu' | 'qr' | 'reviews' | 'users' | 'club' | 'history'

const TABS = [
  { id: 'overview', label: 'نمای کلی', icon: LayoutDashboard },
  { id: 'info', label: 'اطلاعات', icon: Info },
  { id: 'media', label: 'تصاویر', icon: Images },
  { id: 'hours', label: 'ساعت کاری', icon: Clock3 },
  { id: 'menu', label: 'منو و قیمت', icon: UtensilsCrossed },
  { id: 'qr', label: 'QR منو', icon: QrCode },
  { id: 'reviews', label: 'نظرها', icon: MessageSquareText },
  { id: 'users', label: 'دسترسی‌ها', icon: Users },
  { id: 'club', label: 'مشتریان و تخفیف', icon: Users },
  { id:'history', label:'تاریخچه', icon:Clock3 },
] satisfies { id: Tab; label: string; icon: typeof LayoutDashboard }[]

const TAB_COPY: Record<Tab, { title: string; description: string }> = {
  history:{title:'تاریخچه تغییرات',description:'عملیات ثبت‌شده همین شعبه و بازگردانی امن تغییر گروهی قیمت.'},
  overview: { title: 'وضعیت مجموعه', description: 'یک نگاه سریع به کیفیت صفحه و کارهایی که باید انجام شوند.' },
  info: { title: 'اطلاعات و امکانات', description: 'اطلاعاتی که کاربر قبل از انتخاب و مسیریابی نیاز دارد.' },
  media: { title: 'لوگو و گالری', description: 'تصاویر واقعی همین شعبه را مرتب کنید و عکس اصلی صفحه را انتخاب کنید.' },
  hours: { title: 'ساعت کاری', description: 'زمان دقیق فعالیت هر روز و شیفت دوم را مشخص کنید.' },
  menu: { title: 'مدیریت منو', description: 'دسته‌ها، آیتم‌ها، قیمت، موجودی و عکس‌ها را از یک‌جا مدیریت کنید.' },
  qr: { title: 'QR منوی شعبه', description: 'کد پایدار همین شعبه را برای میز، استند یا بسته‌بندی دریافت کنید.' },
  reviews: { title: 'نظرهای کاربران', description: 'بازخورد مشتری‌ها را ببینید و پاسخ رسمی مجموعه را ثبت کنید.' },
  users: { title: 'کاربران این شعبه', description: 'مالک و مدیران مجاز این شعبه را ببینید و دسترسی‌ها را کنترل کنید.' },
  club: { title: 'مشتریان و تخفیف', description: 'عضویت رضایتمندانه، پیشنهادهای باشگاه و تخفیف عمومی منو را از یک بخش مدیریت کنید.' },
}

function SaveButton({ label = 'ذخیره' }: { label?: string }) {
  const { pending } = useManagedFormStatus()
  return (
    <button type="submit" className={styles.save} disabled={pending}>
      {pending ? 'در حال ذخیره…' : label}
    </button>
  )
}

function Feedback({ state }: { state: { ok: boolean; error?: string; message?: string } }) {
  if (state.error) return <p className={styles.error}>{state.error}</p>
  if (state.ok && state.message) return <p className={styles.success}>{state.message}</p>
  return null
}

type CategoryArtworkAction = (data: FormData) => Promise<{ ok: boolean; error?: string; message?: string }>
type SharedArtworkItem = {
  mediaId: number
  label: string
  placeName: string
  url: string
  fullUrl: string
  width: number | null
  height: number | null
  usageCount: number
}

function CategoryArtworkLibrary({
  placeId,
  revision,
  section,
  action,
}: {
  placeId: number
  revision: string
  section: { id: number; name: string; facetId: string | null }
  action: CategoryArtworkAction
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<SharedArtworkItem[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const requestUrl = useCallback((nextPage: number) => {
    const params = new URLSearchParams({
      placeId: String(placeId),
      page: String(nextPage),
    })
    if (section.facetId) params.set('facet', section.facetId)
    if (query.trim()) params.set('q', query.trim())
    return `/api/admin/venue/category-artwork?${params}`
  }, [placeId, query, section.facetId])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(requestUrl(1), { signal: controller.signal, credentials: 'same-origin' })
        const payload = await response.json() as { items?: SharedArtworkItem[]; hasMore?: boolean; error?: string }
        if (!response.ok) throw new Error(payload.error || 'کتابخانه دریافت نشد.')
        setItems(payload.items ?? [])
        setPage(1)
        setHasMore(Boolean(payload.hasMore))
      } catch (cause) {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : 'کتابخانه دریافت نشد.')
        setItems([])
        setHasMore(false)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, query.trim() ? 280 : 0)
    return () => { window.clearTimeout(timer); controller.abort() }
  // section.id intentionally resets results when the active category changes.
  }, [open, query, requestUrl, section.id])

  const loadMore = async () => {
    if (loading || !hasMore) return
    const nextPage = page + 1
    setLoading(true)
    setError('')
    try {
      const response = await fetch(requestUrl(nextPage), { credentials: 'same-origin' })
      const payload = await response.json() as { items?: SharedArtworkItem[]; hasMore?: boolean; error?: string }
      if (!response.ok) throw new Error(payload.error || 'تصاویر بیشتر دریافت نشد.')
      setItems((current) => [...current, ...(payload.items ?? []).filter((item) => !current.some((old) => old.mediaId === item.mediaId))])
      setPage(nextPage)
      setHasMore(Boolean(payload.hasMore))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تصاویر بیشتر دریافت نشد.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <details className={styles.categoryArtworkLibrary} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary><Images size={16} /> انتخاب از کتابخانهٔ تصاویر</summary>
      <div className={styles.artworkLibraryBody}>
        <div className={styles.artworkLibraryTitle}>
          <strong>مجموعهٔ آمادهٔ KuCafe</strong>
          <span>{fa(CATEGORY_ARTWORK_OPTIONS.length)} تصویر هماهنگ و باکیفیت</span>
        </div>
        <ManagedForm action={action} className={styles.categoryArtworkGrid}>
          <PlaceFormIdentity placeId={placeId} revision={revision} />
          <input type="hidden" name="sectionId" value={section.id} />
          <input type="hidden" name="operation" value="section.artwork.library" />
          {CATEGORY_ARTWORK_OPTIONS.map((artwork) => (
            <button key={artwork.id} type="submit" name="artworkId" value={artwork.id} title={`انتخاب ${artwork.label}`}>
              <img src={artwork.path} alt="" width={180} height={180} loading="lazy" />
              <span>{artwork.label}</span>
            </button>
          ))}
        </ManagedForm>

        <div className={styles.sharedArtworkHead}>
          <span><strong>تصاویر کافه‌های دیگر</strong><small>تصاویر عمومی مرتبط با «{section.name}»؛ بدون ساخت فایل تکراری</small></span>
          <label>
            <Search size={15} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجوی نام دسته" maxLength={80} />
          </label>
        </div>

        {error && <p className={styles.sharedArtworkState} role="alert">{error}</p>}
        {!error && loading && items.length === 0 && <p className={styles.sharedArtworkState} role="status">در حال دریافت تصاویر مرتبط…</p>}
        {!error && !loading && items.length === 0 && <p className={styles.sharedArtworkState}>برای این دسته هنوز تصویر مشترکی پیدا نشد.</p>}
        {items.length > 0 && (
          <ManagedForm action={action} className={`${styles.categoryArtworkGrid} ${styles.sharedArtworkGrid}`}>
            <PlaceFormIdentity placeId={placeId} revision={revision} />
            <input type="hidden" name="sectionId" value={section.id} />
            <input type="hidden" name="operation" value="section.artwork.shared" />
            {items.map((artwork) => (
              <button key={artwork.mediaId} type="submit" name="mediaId" value={artwork.mediaId} title={`استفاده از ${artwork.label} — ${artwork.placeName}`}>
                <img src={artwork.url} alt="" width={artwork.width ?? 400} height={artwork.height ?? 240} loading="lazy" />
                <span><b>{artwork.label}</b><small>{artwork.placeName}</small></span>
              </button>
            ))}
          </ManagedForm>
        )}
        {hasMore && <button type="button" className={styles.sharedArtworkMore} onClick={loadMore} disabled={loading}>{loading ? 'در حال دریافت…' : 'نمایش تصاویر بیشتر'}</button>}
      </div>
    </details>
  )
}

function PlaceFormIdentity({ placeId, revision }: { placeId: number; revision: string }) {
  return <><input type="hidden" name="placeId" value={placeId} /><input type="hidden" name="revision" value={revision} /></>
}

function ItemImagePicker({ hasImage }: { hasImage: boolean }) {
  const [fileName, setFileName] = useState('')
  return (
    <label className={styles.itemImagePicker}>
      <ImagePlus size={15} aria-hidden="true" />
      <span title={fileName || undefined}>
        {fileName || (hasImage ? 'تغییر عکس' : 'افزودن عکس')}
      </span>
      <input
        name="image"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        onChange={(event) => setFileName(event.target.files?.[0]?.name ?? '')}
      />
    </label>
  )
}

function UploadProgress({ label }: { label: string }) {
  const { pending } = useManagedFormStatus()
  if (!pending) return null
  return <div className={styles.uploadProgress} role="progressbar" aria-label={label} aria-valuetext="در حال ارسال و پردازش"><span /><strong>{label}</strong><small>این صفحه را نبندید؛ تصاویر بهینه‌سازی می‌شوند.</small></div>
}

function MediaFilePicker({ mode, hasImage = false, disabled = false }: { mode: 'logo' | 'gallery'; hasImage?: boolean; disabled?: boolean }) {
  const [previews, setPreviews] = useState<{ name: string; url: string; error?: string }[]>([])
  useEffect(() => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)), [previews])
  const multiple = mode === 'gallery'
  return (
    <>
      <label className={styles.uploadDrop}>
        {multiple ? <Camera size={22} aria-hidden="true" /> : <ImagePlus size={22} aria-hidden="true" />}
        <span>
          <strong>{multiple ? 'انتخاب از دوربین یا گالری' : hasImage ? 'تغییر لوگو' : 'افزودن لوگو'}</strong>
          <small>{multiple ? 'حداکثر ۸ عکس در هر بار؛ هر فایل تا ۸ مگابایت' : 'JPG، PNG، WebP یا AVIF تا ۸ مگابایت'}</small>
        </span>
        <input
          name={multiple ? 'photos' : 'logo'}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple={multiple}
          required
          disabled={disabled}
          onChange={(event) => {
            previews.forEach((preview) => URL.revokeObjectURL(preview.url))
            const files = [...(event.target.files ?? [])]
            const countError = multiple && files.length > 8 ? 'در هر بار حداکثر ۸ تصویر انتخاب کنید.' : ''
            const sizeError = files.some((file) => file.size > 8 * 1024 * 1024) ? 'حجم هر تصویر باید کمتر از ۸ مگابایت باشد.' : ''
            event.currentTarget.setCustomValidity(countError || sizeError)
            setPreviews(files.slice(0, 8).map((file) => ({
              name: file.name,
              url: URL.createObjectURL(file),
              error: file.size > 8 * 1024 * 1024 ? 'بیش از ۸ مگابایت' : undefined,
            })))
          }}
        />
      </label>
      {previews.length > 0 && (
        <div className={styles.uploadPreviews} aria-live="polite">
          {previews.map((preview) => <span key={`${preview.name}-${preview.url}`} data-error={Boolean(preview.error)}><img src={preview.url} alt="" /><small title={preview.name}>{preview.error || preview.name}</small></span>)}
        </div>
      )}
    </>
  )
}

export interface VenueReview {
  id: number
  authorName: string
  stars: number
  text: string | null
  status: string
  createdAt: Date
  replies: string[]
  replyDetails?: { text: string; status: string }[]
  itemNames?: string[]
}

interface Props {
  districts?: {id:string;name:string}[]
  brands?: {id:number;name:string}[]
  clubPanel?: ReactNode
  ownerRepliesRequireApproval?: boolean
  place: OwnerPlaceData
  reviews: VenueReview[]
  /** کافه‌های دیگری که این کاربر اداره می‌کند. */
  otherPlaces: { id: number; name: string }[]
  onSelectPlace?: (id: number) => void
  readOnly: boolean
  /** فقط ادمین می‌تواند تعیین کند یک آیتم در سطح قیمت عمومی حساب شود یا نه. */
  canManagePriceStats?: boolean
  /** بعد از چند روز قیمت «بیات» شمرده می‌شود — از تنظیمات پنل ادمین. */
  stalePriceDays?: number
  priceStatsMaxItemPrice?: number
  priceStatsExcludeServiceSections?: boolean
  managers: { userId: string; name: string; username: string | null; phone: string | null; role: string }[]
  canManageUsers: boolean
  currentUserId: string
}

export function VenuePanel({
  place,
  reviews,
  otherPlaces,
  readOnly,
  canManagePriceStats = false,
  stalePriceDays = 90,
  priceStatsMaxItemPrice = 5_000_000,
  priceStatsExcludeServiceSections = false,
  managers,
  canManageUsers,
  currentUserId,
  ownerRepliesRequireApproval = false,
  clubPanel,
  districts=[],
  brands=[],
}: Props) {
  const draft = useUnsavedForms()
  const [tab, setTab] = usePanelTab<Tab>(TABS.filter(item => (item.id !== 'club' || !!clubPanel) && (item.id !== 'history' || !readOnly)).map(item => item.id), 'overview', draft.confirmDiscard)
  const revision = String(place.revision)
  const [menuScope, setMenuScope] = useState<'public' | 'quarantine'>('public')
  const publicSections = useMemo(() => place.sections.filter(section => section.branchScope === 'shared' || section.branchScope === 'branch'), [place.sections])
  const quarantinedSections = useMemo(() => place.sections.filter(section => section.branchScope === 'other_branch' || section.branchScope === 'unverified'), [place.sections])
  const sections = tab==='menu' && menuScope === 'quarantine' ? quarantinedSections : publicSections

  const [infoState, infoAction] = useManagedActionState(saveVenueInfoAction, EMPTY_VENUE_STATE)
  const [hoursState, hoursAction] = useManagedActionState(saveVenueHoursAction, EMPTY_VENUE_STATE)
  const [attributesState, attributesAction] = useManagedActionState(
    saveVenueAttributesAction,
    EMPTY_VENUE_STATE,
  )
  const [newItemState, newItemAction] = useManagedActionState(createMenuItemAction, EMPTY_VENUE_STATE)
  const [newSectionState, newSectionAction] = useManagedActionState(createMenuSectionAction, EMPTY_VENUE_STATE)
  const [itemState, itemAction] = useManagedActionState(saveMenuItemAction, EMPTY_VENUE_STATE)
  const [menuOpState, menuOpAction] = useManagedActionState(menuOperationAction, EMPTY_VENUE_STATE)
  const [variantState, variantAction] = useManagedActionState(menuVariantAction, EMPTY_VENUE_STATE)
  const [replyState, replyAction] = useManagedActionState(replyReviewAction, EMPTY_VENUE_STATE)
  const [userState, userAction] = useManagedActionState(saveVenueUserAction, EMPTY_VENUE_STATE)
  const [removeUserState, removeUserAction] = useManagedActionState(removeVenueUserAction, EMPTY_VENUE_STATE)
  const [logoState, logoAction] = useManagedActionState(uploadVenueLogoAction, EMPTY_VENUE_STATE)
  const [photosState, photosAction] = useManagedActionState(uploadVenuePhotosAction, EMPTY_VENUE_STATE)
  const [photoOpState, photoOpAction] = useManagedActionState(photoOperationAction, EMPTY_VENUE_STATE)
  const hasUnsavedChanges = draft.dirty
  const [latValue, setLatValue] = useState(place.lat === null ? '' : String(place.lat))
  const [lngValue, setLngValue] = useState(place.lng === null ? '' : String(place.lng))
  const [locationState, setLocationState] = useState<'idle' | 'loading' | 'denied' | 'error' | 'ready'>('idle')
  const [mapPickerOpen,setMapPickerOpen]=useState(false)

  useEffect(() => {
    setLatValue(place.lat === null ? '' : String(place.lat))
    setLngValue(place.lng === null ? '' : String(place.lng))
    setLocationState('idle')
  }, [place.id, place.lat, place.lng])

  const [menuQuery, setMenuQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [searchLimit, setSearchLimit] = useState(80)
  const [showArchived, setShowArchived] = useState(false)
  useEffect(() => { setSearchLimit(80) }, [menuQuery, menuScope, showArchived])
  const [menuComposer, setMenuComposer] = useState<'item' | 'section' | null>(null)
  const [activeMenuSectionId, setActiveMenuSectionId] = useState<number | null>(sections[0]?.id ?? null)
  const [qrCopyState, setQrCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const qualityFacts = useMemo(() => ({
    hasCoords: place.geoStatus !== 'missing' && place.lat !== null && place.lng !== null,
    hasHours: place.hours.some((shift) => !shift.closed),
    hasAddress: Boolean(place.address.trim()),
    hasPhone: place.phones.length > 0,
    hasInstagram: Boolean(place.instagram?.trim()),
    hasDescription: Boolean(place.about?.trim()),
    hasMenu: publicSections.some((section) => section.items.some((item) => !item.archivedAt)),
    photoCount: place.photos.length,
    attributeCount: Object.keys(place.attributes).length,
  }), [place,publicSections])
  const completionParts = useMemo(() => completenessBreakdown(qualityFacts), [qualityFacts])
  const setupReadiness = useMemo(() => menuReadiness(place), [place])
  const qualityScore = useMemo(() => computeQualityFromFacts(qualityFacts), [qualityFacts])
  const itemCount = sections.reduce((sum, section) => sum + section.items.filter((item) => !item.archivedAt).length, 0)
  const archivedCount = sections.reduce((sum, section) => sum + section.items.filter((item) => item.archivedAt).length, 0)
  const pricedCount = sections.reduce(
    (sum, section) => sum + section.items.filter((item) => !item.archivedAt && item.price !== null).length,
    0,
  )
  const automaticallyExcluded = (price: number | null, facetId: string | null) =>
    price !== null && (
      (priceStatsMaxItemPrice > 0 && price > priceStatsMaxItemPrice) ||
      (priceStatsExcludeServiceSections && FACET_BY_ID.get(facetId ?? '')?.kind === 'service')
    )
  const automaticExclusionReason = (price: number | null, facetId: string | null) => {
    if (price !== null && priceStatsMaxItemPrice > 0 && price > priceStatsMaxItemPrice) {
      return `قیمت این آیتم از سقف خودکار ${toman(priceStatsMaxItemPrice)} بیشتر است.`
    }
    if (priceStatsExcludeServiceSections && FACET_BY_ID.get(facetId ?? '')?.kind === 'service') {
      return 'دستهٔ این آیتم خدماتی است و طبق تنظیم عمومی کنار گذاشته می‌شود.'
    }
    return null
  }
  const excludedPriceCount = sections.reduce(
    (sum, section) => sum + section.items.filter((item) =>
      !item.archivedAt && item.price !== null && (
        item.excludeFromPriceStats || automaticallyExcluded(item.price, section.facetId)
      )
    ).length,
    0,
  )
  const staleCount = sections.reduce(
    (sum, section) =>
      sum +
      section.items.filter(
        (item) =>
          !item.archivedAt && item.price !== null &&
          (!item.priceUpdatedAt ||
            Date.now() - new Date(item.priceUpdatedAt).getTime() >
              stalePriceDays * 24 * 3600 * 1000),
      ).length,
    0,
  )
  useEffect(() => {
    if (!sections.some((section) => section.id === activeMenuSectionId)) {
      setActiveMenuSectionId(sections[0]?.id ?? null)
    }
  }, [activeMenuSectionId, place.id, sections])

  const normalizedMenuQuery = normalizeFa(menuQuery)
  const allMatchedItems = useMemo(() => {
    if (!normalizedMenuQuery) return []
    return sections.flatMap((section) => section.items
      .filter((item) => showArchived || !item.archivedAt)
      .filter((item) => normalizeFa(`${item.name} ${item.description ?? ''} ${section.name}`).includes(normalizedMenuQuery))
      .map((item) => ({ section, item })))
  }, [normalizedMenuQuery, sections, showArchived])
  const menuSectionsToRender = useMemo(() => {
    if (!normalizedMenuQuery) {
      const section = sections.find((item) => item.id === activeMenuSectionId)
      return section ? [{ ...section, items: section.items.filter((item) => showArchived || !item.archivedAt) }] : []
    }
    const allowedIds = new Set(allMatchedItems.slice(0, searchLimit).map(({ item }) => item.id))
    return sections.flatMap((section) => {
      const items = section.items.filter((item) => allowedIds.has(item.id))
      return items.length ? [{ ...section, items }] : []
    })
  }, [activeMenuSectionId, allMatchedItems, normalizedMenuQuery, sections, showArchived, searchLimit])

  /** ساعت‌های موجود، به تفکیک روز و شیفت — برای پیش‌پرکردن فرم. */
  const hoursByDay = new Map<number, typeof place.hours>()
  for (const shift of place.hours) {
    const list = hoursByDay.get(shift.dow)
    if (list) list.push(shift)
    else hoursByDay.set(shift.dow, [shift])
  }

  const selectTab = (next: Tab) => {
    if (next === tab) return
    // usePanelTab owns the discard guard; calling it here too prompts twice.
    setTab(next)
  }
  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationState('error')
      return
    }
    setLocationState('loading')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLatValue(coords.latitude.toFixed(7))
        setLngValue(coords.longitude.toFixed(7))
        draft.mark({ target: draft.root.current?.querySelector('input[name="lat"]') ?? null })
        setLocationState('ready')
      },
      (error) => setLocationState(error.code === error.PERMISSION_DENIED ? 'denied' : 'error'),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    )
  }
  const copyQrUrl = async () => {
    const value = absoluteUrl(paths.cafe(place.slug))
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
      } else {
        const field = document.createElement('textarea')
        field.value = value
        field.style.position = 'fixed'
        field.style.opacity = '0'
        document.body.appendChild(field)
        field.select()
        const copied = document.execCommand('copy')
        field.remove()
        if (!copied) throw new Error('copy failed')
      }
      setQrCopyState('copied')
      window.setTimeout(() => setQrCopyState('idle'), 1800)
    } catch {
      setQrCopyState('error')
    }
  }

  return (
    <div
      className={styles.panel}
      ref={draft.root}
      onInputCapture={draft.mark}
      onChangeCapture={draft.mark}
      onClickCapture={draft.guardLink}
    >
      <header className={styles.head}>
        <div className={styles.breadcrumb}>
          <a href={paths.admin}>مدیریت</a><span>/</span><a href={paths.ownerPanel}>مجموعه‌ها</a><span>/</span><b>{place.name}</b>
        </div>
        <div className={styles.headMain}>
          {place.logoUrl ? (
            <img src={place.logoUrl} alt="" width={52} height={52} className={styles.logo} />
          ) : (
            <span className={styles.logoEmpty} aria-hidden="true">
              <Coffee size={22} strokeWidth={1.7} />
            </span>
          )}
          <div>
            <span className={styles.panelLabel}>پنل مدیریت مجموعه</span>
            <h1 className={styles.title}>{place.name}</h1>
            <p className={styles.sub}>
              <span className={styles.statusBadge} data-status={place.status}>
                {place.status === 'published' ? <><BadgeCheck size={13} /> منتشرشده</> : place.status === 'temporarily_closed' ? 'تعطیل موقت' : place.status === 'permanently_closed' ? 'تعطیل دائم' : 'پیش‌نویس'}
              </span>
              <span>کامل‌بودن پروفایل {fa(qualityScore)}٪</span>
            </p>
          </div>
        </div>

        <div className={styles.headActions}>
          <a href={paths.cafe(place.slug)} target="_blank" rel="noreferrer" className={styles.publicLink}>
            <Eye size={16} /> مشاهده صفحه <ExternalLink size={12} />
          </a>
          {otherPlaces.length > 20 ? (
            <a href={paths.ownerPanel} className={styles.switchLink}><Coffee size={16} /> تعویض مجموعه</a>
          ) : otherPlaces.length > 0 && (
            <form method="get" className={styles.placeSwitch}>
              <label>
                <span className={styles.srOnly}>انتخاب مجموعه</span>
                <select name="place" defaultValue={String(place.id)} onChange={(event) => event.currentTarget.form?.submit()}>
                  <option value={String(place.id)}>{place.name}</option>
                  {otherPlaces.map((other) => <option key={other.id} value={String(other.id)}>{other.name}</option>)}
                </select>
              </label>
            </form>
          )}
        </div>
        <div className={styles.qualityTrack} aria-label={`کامل بودن اطلاعات ${qualityScore} درصد`}><span style={{ width: `${qualityScore}%` }} /></div>
      </header>

      {readOnly && (
        <p className={styles.readOnlyNote}>
          در حالت «مشاهده به‌عنوان» هستید — این پنل فقط‌خواندنی است.
        </p>
      )}

      {hasUnsavedChanges && <div className={styles.unsavedNotice} role="status"><span>تغییرات ذخیره‌نشده دارید</span><strong>پیش از خروج، دکمه ذخیره را بزنید.</strong></div>}

      <nav className={styles.tabs} data-panel-tabs aria-label="بخش‌های پنل">
        {TABS.filter(item => (item.id !== 'club' || !!clubPanel) && (item.id !== 'history' || !readOnly)).map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? styles.tabOn : styles.tab}
            aria-pressed={tab === item.id}
            onClick={() => selectTab(item.id)}
          >
            <item.icon size={17} aria-hidden="true" />
            {item.label}
            {item.id === 'reviews' && reviews.length > 0 && (
              <span className={styles.tabCount}>{fa(reviews.length)}</span>
            )}
          </button>
        ))}
      </nav>

      <div className={styles.tabIntro}>
        <div>
          {(() => { const Icon = TABS.find((item) => item.id === tab)!.icon; return <span><Icon size={20} /></span> })()}
          <div><h2>{TAB_COPY[tab].title}</h2><p>{TAB_COPY[tab].description}</p></div>
        </div>
        {tab === 'menu' && <span className={styles.introCount}>{fa(itemCount)} آیتم در {fa(sections.length)} دسته</span>}
      </div>

      {/* ── نمای کلی ─────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <section className={styles.section}>
          <MenuSetupChecklist readiness={setupReadiness} onSelect={setTab} />
          <div className={styles.statGrid}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{fa(itemCount)}</span>
              <span className={styles.statLabel}>آیتم منو</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{fa(pricedCount)}</span>
              <span className={styles.statLabel}>آیتم با قیمت</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>
                {place.priceMedian ? toman(place.priceMedian) : '—'}
              </span>
              <span className={styles.statLabel}>میانهٔ قیمت مشمول</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{fa(qualityScore)}٪</span>
              <span className={styles.statLabel}>کامل‌بودن پروفایل</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{place.priceTier === 1 ? 'اقتصادی' : place.priceTier === 3 ? 'گران' : 'متوسط'}</span>
              <span className={styles.statLabel}>ردهٔ قیمت فعلی</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{fa(excludedPriceCount)}</span>
              <span className={styles.statLabel}>خارج از محاسبه</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{fa(place.viewCount)}</span>
              <span className={styles.statLabel}>بازدید صفحه</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{fa(reviews.length)}</span>
              <span className={styles.statLabel}>نظر</span>
            </div>
          </div>

          <div className={styles.todoBox}>
            <div className={styles.completionHeading}>
              <div><h2 className={styles.boxTitle}>مسیر تکمیل پروفایل</h2><p>هر امتیاز دقیقاً از یکی از داده‌های زیر می‌آید.</p></div>
              <strong>{fa(qualityScore)} از ۱۰۰</strong>
            </div>
            <ul className={styles.todoList}>
              {completionParts.map((part) => {
                const target: Tab = part.id === 'hours' ? 'hours' : part.id === 'photos' ? 'media' : part.id === 'menu' ? 'menu' : 'info'
                return (
                  <li key={part.id} className={`${styles.completionItem} ${part.complete ? styles.completionDone : ''}`}>
                    <span className={styles.completionMark}>{part.complete ? <Check size={14} /> : '·'}</span>
                    <span><strong>{part.label}</strong><small>{part.detail}</small></span>
                    <em>{fa(Math.round(part.earned))}/{fa(part.maximum)}</em>
                    {!part.complete && <button type="button" onClick={() => setTab(target)}>تکمیل</button>}
                  </li>
                )
              })}
              {staleCount > 0 && (
                <li>
                  قیمت {fa(staleCount)} آیتم بیش از {fa(stalePriceDays)} روز به‌روز نشده.{' '}
                  <button type="button" onClick={() => setTab('menu')}>
                    به‌روزرسانی
                  </button>
                </li>
              )}
              {completionParts.every((part) => part.complete) && staleCount === 0 && <li className={styles.allDone}>
                    <Check size={15} aria-hidden="true" /> پروفایل کامل است.
                  </li>}
            </ul>
          </div>
        </section>
      )}

      {/* ── اطلاعات ──────────────────────────────────────────────── */}
      {tab === 'info' && (
        <section className={styles.section}>
          <div className={styles.branchScopeCard}>
            <span className={styles.branchScopeIcon}><MapPin size={19} /></span>
            <div><strong>{place.brandName ?? place.name}</strong><span>{place.branchName ? `شعبه ${place.branchName}` : 'مجموعه تک‌شعبه‌ای'}{place.isPrimaryBranch ? ' · شعبه اصلی' : ''}</span></div>
            <small>اطلاعات، تصاویر، ساعت و منوی این پنل فقط برای همین شعبه ذخیره می‌شوند.</small>
          </div>
          <ManagedForm action={infoAction} className={styles.form}>
            <PlaceFormIdentity placeId={place.id} revision={revision} />
            <Feedback state={infoState} />
            <label className={styles.field}><span className={styles.label}>نوع مجموعه</span><select name="kind" className={styles.input} defaultValue={place.kind} disabled={readOnly}><option value="cafe">کافه</option><option value="cafe_restaurant">کافه‌رستوران</option><option value="restaurant">رستوران</option><option value="bakery">بیکری</option><option value="lounge">لانژ</option><option value="shop">فروشگاه</option></select></label>
            <label className={styles.field}><span className={styles.label}>محله</span><select name="districtId" className={styles.input} defaultValue={place.districtId??'auto'} disabled={readOnly}><option value="auto">تشخیص از آدرس و مختصات جدید</option><option value="">بدون انتساب محله</option>{districts.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><small>در جابه‌جایی کافه، محله جدید یا تشخیص خودکار را انتخاب کنید.</small></label>
            {canManagePriceStats&&<><label className={styles.field}><span className={styles.label}>مجموعه مادر</span><select name="brandId" className={styles.input} defaultValue={place.brandId??''}><option value="">مجموعه مستقل</option>{brands.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className={styles.field}><span className={styles.label}>نام شعبه</span><input name="branchName" className={styles.input} defaultValue={place.branchName??''} maxLength={160}/></label><label className={styles.switchLabel}><input type="checkbox" name="isPrimaryBranch" defaultChecked={place.isPrimaryBranch}/>شعبه اصلی مجموعه</label></>}

            <label className={styles.field}>
              <span className={styles.label}>نام مجموعه</span>
              <input name="name" className={styles.input} defaultValue={place.name} required />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>نام انگلیسی</span>
              <input
                name="nameEn"
                className={styles.input}
                defaultValue={place.nameEn ?? ''}
                dir="ltr"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>درباره</span>
              <textarea
                name="about"
                className={styles.textarea}
                rows={4}
                defaultValue={place.about ?? ''}
                placeholder="در دو سه خط بگویید اینجا چه جایی است."
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>آدرس</span>
              <input name="address" className={styles.input} defaultValue={place.address} />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>شماره تماس</span>
              <input
                name="phones"
                className={styles.input}
                defaultValue={place.phones.join('، ')}
                dir="ltr"
                placeholder="05138472000، 09151234567"
              />
              <span className={styles.hint}>
                چند شماره را با کاما جدا کنید. شماره‌ی ۸ رقمی خودکار ۰۵۱ می‌گیرد.
              </span>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>اینستاگرام</span>
              <input
                name="instagram"
                className={styles.input}
                defaultValue={place.instagram ?? ''}
                dir="ltr"
                placeholder="cafe_name"
              />
            </label>

            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>عرض جغرافیایی</span>
                <input
                  name="lat"
                  className={styles.input}
                  value={latValue}
                  onChange={(event) => setLatValue(event.target.value)}
                  dir="ltr"
                  inputMode="decimal"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>طول جغرافیایی</span>
                <input
                  name="lng"
                  className={styles.input}
                  value={lngValue}
                  onChange={(event) => setLngValue(event.target.value)}
                  dir="ltr"
                  inputMode="decimal"
                />
              </label>
            </div>
            <p className={styles.hint}>
              مختصات را از نشان یا گوگل مپس کپی کنید. بدون مختصات، مجموعه روی نقشه و در
              «نزدیک من» دیده نمی‌شود.
            </p>
            <div className={styles.locationTools}>
              <button type="button" onClick={useCurrentLocation} disabled={readOnly || locationState === 'loading'}><LocateFixed size={16} />{locationState === 'loading' ? 'در حال دریافت…' : 'استفاده از موقعیت فعلی'}</button>
              {latValue && lngValue && <a href={`https://nshn.ir/?lat=${encodeURIComponent(latValue)}&lng=${encodeURIComponent(lngValue)}`} target="_blank" rel="noreferrer"><MapPin size={16} /> بررسی روی نشان</a>}
              {locationState === 'ready' && <span className={styles.locationSuccess}>مختصات دریافت شد؛ برای ثبت، ذخیره را بزنید.</span>}
              {locationState === 'denied' && <span className={styles.locationError}>اجازه موقعیت داده نشد؛ مختصات را دستی وارد کنید.</span>}
              {locationState === 'error' && <span className={styles.locationError}>دریافت موقعیت ممکن نشد؛ دوباره تلاش کنید یا دستی وارد کنید.</span>}
            </div>
            <details style={{gridColumn:'1 / -1'}} onToggle={event=>setMapPickerOpen(event.currentTarget.open)}><summary style={{minHeight:44,cursor:'pointer'}}>انتخاب موقعیت روی نقشه</summary>{mapPickerOpen&&<LocationPicker lat={latValue} lng={lngValue} readOnly={readOnly} onSelect={(lat,lng)=>{setLatValue(String(lat));setLngValue(String(lng));draft.mark({target:draft.root.current?.querySelector('input[name="lat"]')??null})}}/>}</details>

            {!readOnly && <SaveButton />}
          </ManagedForm>

          {/*
            ویژگی‌ها فرم جداست، نه بخشی از فرم اطلاعات.

            دلیلش ذخیره‌ی مستقل است: کافه‌داری که فقط می‌خواهد «پریز کنار میز»
            را تیک بزند، نباید ریسک کند که نام و آدرس و مختصاتش هم دوباره
            نوشته شوند. تبِ جدا هم نساختیم — این‌ها واقعیت‌های پایه‌ی مجموعه‌اند
            و جایشان همین‌جاست.
          */}
          <ManagedForm action={attributesAction} className={styles.form}>
            <PlaceFormIdentity placeId={place.id} revision={revision} />
            <Feedback state={attributesState} />

            <h2 className={styles.boxTitle}>امکانات و فضا</h2>
            <p className={styles.hint}>
              این‌ها از منو قابل استخراج نیستند — فقط شما می‌دانید. هرچه ثبت کنید، مجموعه‌تان
              در فیلترهای «مناسب کار»، «فضای باز» و مثل این‌ها پیدا می‌شود. چیزی که مطمئن
              نیستید را روی «ثبت‌نشده» بگذارید؛ برچسب اشتباه بدتر از نبودنش است، چون کاربر
              می‌آید و آن‌طور نمی‌بیند.
            </p>

            <div className={styles.attrGrid}>
              {FILTER_ATTRIBUTES.map((def) => {
                const current = place.attributes[def.id]
                return (
                  <label key={def.id} className={styles.attrField}>
                    <span className={styles.label}>{def.labelFa}</span>
                    <select
                      name={`attr_${def.id}`}
                      className={styles.input}
                      defaultValue={current === undefined ? '' : String(current)}
                      disabled={readOnly}
                    >
                      <option value="">ثبت‌نشده</option>
                      <option value="2">بله</option>
                      <option value="1">تاحدی</option>
                      <option value="0">نه</option>
                    </select>
                  </label>
                )
              })}
            </div>

            {!readOnly && <SaveButton label="ذخیره‌ی امکانات" />}
          </ManagedForm>
        </section>
      )}

      {/* ── لوگو و گالری ──────────────────────────────────────────── */}
      {tab === 'media' && (
        <section className={styles.section}>
          <div className={styles.mediaLayout}>
            <div className={styles.mediaCard}>
              <div className={styles.mediaCardHead}>
                <div><h2 className={styles.boxTitle}>لوگوی مجموعه</h2><p className={styles.hint}>لوگو برای هویت برند است و جای تصویر محیط را نمی‌گیرد.</p></div>
                {place.logoUrl ? <img src={place.logoUrl} alt={`لوگوی ${place.name}`} width={80} height={80} className={styles.logoPreview} /> : <span className={styles.logoPreviewEmpty}><Coffee size={26} /></span>}
              </div>
              <ManagedForm action={logoAction} className={styles.mediaUploadForm}>
                <PlaceFormIdentity placeId={place.id} revision={revision} />
                <Feedback state={logoState} />
                <MediaFilePicker mode="logo" hasImage={Boolean(place.logoUrl)} disabled={readOnly} />
                <UploadProgress label="در حال بارگذاری لوگو…" />
                {!readOnly && <SaveButton label="بارگذاری لوگو" />}
              </ManagedForm>
              {!readOnly && place.logoUrl && (
                <ManagedForm action={photoOpAction} className={styles.inlineDanger} onSubmit={(event) => { if (!window.confirm('لوگوی فعلی حذف شود؟')) event.preventDefault() }}>
                  <PlaceFormIdentity placeId={place.id} revision={revision} />
                  <button type="submit" name="operation" value="logo.remove"><Trash2 size={14} /> حذف لوگو</button>
                </ManagedForm>
              )}
            </div>

            <div className={styles.mediaCard}>
              <h2 className={styles.boxTitle}>تصاویر محیط شعبه</h2>
              <p className={styles.hint}>عکس واقعی ورودی، سالن، فضای باز یا میزها را اضافه کنید. عکس منو و آیتم‌ها بخش جداگانه دارند.</p>
              <ManagedForm action={photosAction} className={styles.mediaUploadForm}>
                <PlaceFormIdentity placeId={place.id} revision={revision} />
                <Feedback state={photosState} />
                <MediaFilePicker mode="gallery" disabled={readOnly} />
                <UploadProgress label="در حال ارسال و بهینه‌سازی تصاویر…" />
                <label className={styles.field}><span className={styles.label}>توضیح تصاویر (اختیاری)</span><input name="alt" className={styles.input} maxLength={255} placeholder={`مثلاً فضای داخلی ${place.name}`} disabled={readOnly} /></label>
                {!readOnly && <SaveButton label="افزودن به گالری" />}
              </ManagedForm>
            </div>
          </div>

          <Feedback state={photoOpState} />
          {place.photos.length === 0 ? (
            <div className={styles.galleryEmpty}><Images size={28} /><strong>هنوز تصویر محیط ثبت نشده</strong><span>سه عکس واقعی، امتیاز این بخش را کامل می‌کند.</span></div>
          ) : (
            <div className={styles.galleryManager}>
              {place.photos.map((photo, index) => {
                const isCover = place.coverMediaId === photo.mediaId
                return (
                  <article key={photo.id} className={styles.galleryManagerItem}>
                    <div className={styles.galleryManagerImage}>
                      <img src={photo.url} alt={photo.alt || `تصویر ${place.name}`} width={photo.width ?? 400} height={photo.height ?? 300} loading="lazy" />
                      {isCover && <span><BadgeCheck size={13} /> تصویر اصلی</span>}
                      <b>{fa(index + 1)}</b>
                    </div>
                    <p>{photo.alt || `تصویر محیط ${place.name}`}</p>
                    {!readOnly && (
                      <ManagedForm action={photoOpAction} className={styles.galleryManagerActions}>
                        <input type="hidden" name="revision" value={revision} />
                        <input type="hidden" name="photoId" value={photo.id} />
                        {!isCover && <button type="submit" name="operation" value="photo.cover" className={styles.coverButton}>انتخاب به‌عنوان اصلی</button>}
                        <button type="submit" name="operation" value="photo.up" disabled={index === 0} aria-label="انتقال تصویر به جلو"><ArrowUp size={15} /></button>
                        <button type="submit" name="operation" value="photo.down" disabled={index === place.photos.length - 1} aria-label="انتقال تصویر به عقب"><ArrowDown size={15} /></button>
                        <button type="submit" name="operation" value="photo.delete" className={styles.dangerButton} aria-label="حذف تصویر" onClick={(event) => { if (!window.confirm('این تصویر از گالری حذف شود؟')) event.preventDefault() }}><Trash2 size={15} /></button>
                      </ManagedForm>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* ── ساعت کاری ────────────────────────────────────────────── */}
      {tab === 'hours' && (
        <section className={styles.section}>
          <ManagedForm action={hoursAction} className={styles.form}>
            <PlaceFormIdentity placeId={place.id} revision={revision} />
            <Feedback state={hoursState} />

            <p className={styles.hint}>
              اگر ظهر و شب باز هستید، شیفت دوم را پر کنید. ساعت بستنِ بعد از نیمه‌شب
              (مثلاً ۰۰:۳۰) خودکار تشخیص داده می‌شود.
            </p>

            <div className={styles.hoursGrid}>
              {WEEKDAY_NAMES.map((dayName, dow) => {
                const dayShifts = hoursByDay.get(dow) ?? []
                const isClosed = dayShifts.length > 0 && dayShifts.every((shift) => shift.closed)
                const first = dayShifts.find((shift) => shift.shiftIndex === 0 && !shift.closed)
                const second = dayShifts.find((shift) => shift.shiftIndex === 1 && !shift.closed)

                return (
                  <div key={dow} className={styles.hourRow}>
                    <span className={styles.dayName}>{dayName}</span>

                    <label className={styles.closedToggle}>
                      <input type="checkbox" name={`closed_${dow}`} defaultChecked={isClosed} />
                      تعطیل
                    </label>

                    <span className={styles.shiftPair}>
                      <input
                        type="time"
                        name={`open_${dow}_0`}
                        defaultValue={first?.opensAt ?? ''}
                        className={styles.timeInput}
                        aria-label={`${dayName} — باز شدن شیفت اول`}
                      />
                      <span className={styles.dash}>تا</span>
                      <input
                        type="time"
                        name={`close_${dow}_0`}
                        defaultValue={first?.closesAt ?? ''}
                        className={styles.timeInput}
                        aria-label={`${dayName} — بستن شیفت اول`}
                      />
                    </span>

                    <span className={styles.shiftPair}>
                      <input
                        type="time"
                        name={`open_${dow}_1`}
                        defaultValue={second?.opensAt ?? ''}
                        className={styles.timeInput}
                        aria-label={`${dayName} — باز شدن شیفت دوم`}
                      />
                      <span className={styles.dash}>تا</span>
                      <input
                        type="time"
                        name={`close_${dow}_1`}
                        defaultValue={second?.closesAt ?? ''}
                        className={styles.timeInput}
                        aria-label={`${dayName} — بستن شیفت دوم`}
                      />
                    </span>
                  </div>
                )
              })}
            </div>

            {!readOnly && <SaveButton label="ذخیره‌ی ساعت کاری" />}
          </ManagedForm>
        </section>
      )}

      {/* ── منو ──────────────────────────────────────────────────── */}
      {tab === 'menu' && (
        <section className={styles.section}>
          {!readOnly && menuScope === 'public' && <MenuImportPanel key={place.id} placeId={place.id} revision={revision} sections={publicSections.map(section => ({ id: section.id, name: section.name }))} action={venueMenuImportAction} />}
          {canManagePriceStats && quarantinedSections.length > 0 && <div className={styles.priceStatsNotice}>
            <strong>{menuScope === 'public' ? 'منوی فعال همین شعبه' : 'داده‌های قرنطینه‌شده؛ در منوی عمومی نمایش داده نمی‌شوند'}</strong>
            <span>{fa(quarantinedSections.length)} دسته با مالکیت شعبه دیگر یا نامشخص جدا نگه داشته شده است؛ این داده‌ها حذف نشده‌اند.</span>
            <button type="button" onClick={() => { if (draft.confirmDiscard()) setMenuScope(menuScope === 'public' ? 'quarantine' : 'public') }}>{menuScope === 'public' ? 'بررسی داده‌های قرنطینه‌شده' : 'بازگشت به منوی فعال شعبه'}</button>
          </div>}
          {!readOnly && (
            <div className={styles.menuComposer}>
              <div className={styles.menuActionBar}>
                {sections.length > 0 && <button type="button" data-active={menuComposer === 'item'} onClick={() => { if (draft.confirmDiscard()) setMenuComposer((value) => value === 'item' ? null : 'item') }}><UtensilsCrossed size={17} /> افزودن آیتم</button>}
                <button type="button" data-active={menuComposer === 'section'} onClick={() => { if (draft.confirmDiscard()) setMenuComposer((value) => value === 'section' ? null : 'section') }}><LayoutDashboard size={17} /> افزودن دسته</button>
                <span>ابتدا دسته و آیتم را بسازید؛ «سایز و تنوع قیمت» داخل ویرایش هر آیتم است.</span>
              </div>
              {menuComposer === 'item' && sections.length > 0 && (
                <ManagedForm action={newItemAction} className={styles.createBox}>
                  <PlaceFormIdentity placeId={place.id} revision={revision} />
                  <h2 className={styles.boxTitle}>افزودن آیتم منو</h2>
                  <p className={styles.hint}>آیتم بعد از ذخیره، صفحهٔ مستقل می‌گیرد و در جست‌وجوی محصول دیده می‌شود.</p>
                  <div className={styles.createFields}>
                    <input className={styles.input} name="name" placeholder="نام آیتم" maxLength={250} required />
                    <select className={styles.input} name="sectionId" defaultValue="" required>
                      <option value="" disabled>انتخاب دسته</option>
                      {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
                    </select>
                    <input className={styles.input} name="price" placeholder="قیمت تومان؛ خالی = قیمت روز" inputMode="numeric" dir="ltr" />
                    <input className={styles.input} name="description" placeholder="توضیح کوتاه (اختیاری)" maxLength={500} />
                    <label className={styles.createImageField}>
                      <span>عکس آیتم (اختیاری)</span>
                      <input
                        name="image"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/avif"
                      />
                    </label>
                  </div>
                  {canManagePriceStats && (
                    <label className={styles.priceStatsCheck}>
                      <input type="checkbox" name="excludeFromPriceStats" />
                      <span><strong>در محاسبهٔ سطح قیمت حساب نشود</strong><small>برای تجهیزات، کالا یا خدماتی که نمایندهٔ هزینهٔ سفارش غذا و نوشیدنی نیست.</small></span>
                    </label>
                  )}
                  <SaveButton label="ساخت آیتم" />
                  <Feedback state={newItemState} />
                </ManagedForm>
              )}

              {menuComposer === 'section' && <ManagedForm action={newSectionAction} className={styles.createBox}>
                <PlaceFormIdentity placeId={place.id} revision={revision} />
                <h2 className={styles.boxTitle}>افزودن دسته</h2>
                <p className={styles.hint}>برای بخش‌هایی مثل قهوه، صبحانه یا پاستا یک دستهٔ روشن بسازید.</p>
                <div className={styles.createSectionRow}>
                  <input className={styles.input} name="name" placeholder="نام دستهٔ جدید" maxLength={200} required />
                  <SaveButton label="ساخت دسته" />
                </div>
                <Feedback state={newSectionState} />
              </ManagedForm>}
            </div>
          )}

          {/* پرکاربردترین کارِ کافه‌دار، در دسترس‌ترین جا. */}
          {menuScope === 'public' && <BulkPricePanel placeId={place.id} revision={revision} sections={publicSections} selectedIds={selectedIds} readOnly={readOnly} />}

          <Feedback state={itemState} />
          <Feedback state={menuOpState} />
          <Feedback state={variantState} />

          {canManagePriceStats && (
            <div className={styles.priceStatsNotice}>
              <strong>منطق سطح قیمت</strong>
              <span>
                ردهٔ اقتصادی/متوسط/گران از میانهٔ آیتم‌های مشمول ساخته می‌شود؛ اکنون {fa(excludedPriceCount)} آیتم کنار گذاشته شده و سقف خودکار {priceStatsMaxItemPrice > 0 ? toman(priceStatsMaxItemPrice) : 'غیرفعال'} است. مرزها و حذف دسته‌های خدماتی از تب «تنظیمات ← داده و قیمت» پنل مدیریت قابل تغییرند.
              </span>
            </div>
          )}

          <div className={styles.menuTools}>
            <label className={styles.menuSearchLabel}>
              <span className={styles.srOnly}>جست‌وجوی آیتم منو</span>
              <input
                className={styles.input}
                value={menuQuery}
                onChange={(event) => { if (draft.confirmDiscard()) setMenuQuery(event.target.value) }}
                placeholder="جست‌وجو در نام یا توضیح آیتم…"
              />
            </label>
            {archivedCount > 0 && (
              <label className={styles.archiveToggle}>
                <input type="checkbox" checked={showArchived} onChange={(event) => { if (draft.confirmDiscard()) setShowArchived(event.target.checked) }} />
                نمایش {fa(archivedCount)} آیتم آرشیوی
              </label>
            )}
            {!readOnly && menuScope==='public' && itemCount > 0 && (
              <ManagedForm action={menuOpAction} className={styles.bulkAvailability} onSubmit={(event) => { if (!window.confirm('وضعیت موجودی همهٔ آیتم‌های فعال عوض شود؟')) event.preventDefault() }}>
                <PlaceFormIdentity placeId={place.id} revision={revision} />
                <button type="submit" name="operation" value="bulk.available">همه موجود</button>
                <button type="submit" name="operation" value="bulk.unavailable">همه ناموجود</button>
              </ManagedForm>
            )}
          </div>

          {!normalizedMenuQuery && sections.length > 0 && (
            <div className={styles.menuCategoryRail} role="tablist" aria-label="دسته‌های منو">
              {sections.map((section) => {
                const active = section.id === activeMenuSectionId
                const count = section.items.filter((item) => !item.archivedAt).length
                return <button key={section.id} type="button" role="tab" aria-selected={active} data-active={active} onClick={() => { if (draft.confirmDiscard()) setActiveMenuSectionId(section.id) }}><span>{section.name}</span><small>{fa(count)}</small></button>
              })}
            </div>
          )}

          {normalizedMenuQuery && (
            <div className={styles.menuSearchStatus} role="status">
              <strong>{fa(allMatchedItems.length)} نتیجه</strong>
              <span>{allMatchedItems.length > searchLimit ? `${fa(searchLimit)} نتیجه اول؛ با «نمایش نتیجه بعدی» همه موارد را ببینید.` : 'در تمام دسته‌های منو'}</span>
              <button type="button" onClick={() => setMenuQuery('')}>پاک‌کردن جست‌وجو</button>
            </div>
          )}

          {normalizedMenuQuery && allMatchedItems.length > searchLimit && <button type="button" className={styles.save} onClick={()=>{if(draft.confirmDiscard())setSearchLimit(limit=>limit+80)}}>نمایش ۸۰ نتیجه بعدی</button>}
          <div className={styles.menuList}>
            {menuSectionsToRender.map((section) => {
              const sectionIndex = sections.findIndex((candidate) => candidate.id === section.id)
              const sourceSection = sections[sectionIndex] ?? section
              const visibleItems = section.items
              return (
              <details key={`${section.id}-${normalizedMenuQuery || 'active'}`} className={styles.menuSection} open>
                <summary>
                  {section.name}
                  <span className={styles.sectionCount}>{normalizedMenuQuery ? `${fa(visibleItems.length)} نتیجه` : `${fa(sourceSection.items.filter((item) => !item.archivedAt).length)} آیتم`}</span>
                </summary>

                {!readOnly && (
                  <ManagedForm action={menuOpAction} className={styles.sectionTools}>
                    <PlaceFormIdentity placeId={place.id} revision={revision} />
                    <input type="hidden" name="sectionId" value={section.id} />
                    {canManagePriceStats && <><label>مالکیت منوی دسته<select name="branchScope" defaultValue={section.branchScope} className={styles.input}><option value="branch">همین شعبه</option><option value="shared">مشترکِ تأییدشده</option><option value="other_branch">شعبه دیگر — خارج از منوی عمومی</option><option value="unverified">نامشخص — قرنطینه</option></select></label><button name="operation" value="section.scope" onClick={event => { if (!window.confirm('مالکیت این دسته و نمایش عمومی همه آیتم‌های آن تغییر کند؟')) event.preventDefault() }}>ذخیره مالکیت دسته</button></>}
                    <input name="name" className={styles.sectionNameInput} defaultValue={section.name} maxLength={200} required />
                    <button type="submit" name="operation" value="section.rename">ذخیره نام</button>
                    <button type="submit" name="operation" value="section.up" disabled={sectionIndex === 0} title="انتقال دسته به بالا"><ArrowUp size={16} /></button>
                    <button type="submit" name="operation" value="section.down" disabled={sectionIndex === sections.length - 1} title="انتقال دسته به پایین"><ArrowDown size={16} /></button>
                    {sourceSection.items.length === 0 && <button type="submit" name="operation" value="section.delete" className={styles.dangerButton} onClick={(event) => { if (!window.confirm(`دستهٔ خالی «${section.name}» حذف شود؟`)) event.preventDefault() }}><Trash2 size={15} /> حذف دسته</button>}
                  </ManagedForm>
                )}

                {!readOnly && !normalizedMenuQuery && (
                  <div className={styles.categoryArtworkManager}>
                    <div className={styles.categoryArtworkCurrent}>
                      <img src={categoryArtwork(section.name, section.facetId, section.imageUrl)} alt="" width={112} height={112} />
                      <span><strong>تصویر دسته</strong><small>{section.imageUrl ? 'تصویر اختصاصی این دسته در منوی عمومی نمایش داده می‌شود.' : 'فعلاً تصویر هوشمند متناسب با نام دسته نمایش داده می‌شود.'}</small></span>
                    </div>
                    <CategoryArtworkLibrary placeId={place.id} revision={revision} section={section} action={menuOpAction} />
                    <ManagedForm action={menuOpAction} className={styles.categoryArtworkUpload}>
                      <PlaceFormIdentity placeId={place.id} revision={revision} />
                      <input type="hidden" name="sectionId" value={section.id} />
                      <label><ImagePlus size={15} /><span>آپلود تصویر اختصاصی</span><input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/avif" /></label>
                      <button type="submit" name="operation" value="section.artwork.upload">ذخیره تصویر</button>
                      {section.imageUrl && <button type="submit" name="operation" value="section.artwork.remove" className={styles.dangerButton}>حذف و بازگشت به پیش‌فرض</button>}
                    </ManagedForm>
                  </div>
                )}

                <div className={styles.itemRows}>
                  {visibleItems.map((item) => {
                    const itemIndex = sourceSection.items.findIndex((candidate) => candidate.id === item.id)
                    return (
                    <details key={item.id} className={`${styles.itemEditor} ${item.archivedAt ? styles.itemArchived : ''}`}>
                      <summary className={styles.itemSummary}>
                        {!readOnly && menuScope === 'public' && !item.archivedAt && <label data-ignore-dirty="true" title="انتخاب برای تغییر گروهی قیمت" onClick={event=>event.stopPropagation()}><input type="checkbox" aria-label={`انتخاب ${item.name}`} checked={selectedIds.includes(item.id)} onChange={event=>setSelectedIds(ids=>event.target.checked?[...ids,item.id]:ids.filter(id=>id!==item.id))}/></label>}
                        {item.imageUrl ? <img src={item.imageUrl} alt="" width={48} height={48} loading="lazy" /> : <span className={styles.itemNoImage}><Coffee size={17} /></span>}
                        <span className={styles.itemSummaryMain}>
                          <strong>{item.name}</strong>
                          <small>{item.description || 'بدون توضیح'}</small>
                        </span>
                        <span className={styles.itemSummaryPrice}>{item.price === null ? 'قیمت روز' : `${item.variants.length ? 'از ' : ''}${toman(item.price)}`}</span>
                        <span className={styles.itemSummaryTags}>
                          <em data-on={item.available}>{item.available ? 'موجود' : 'ناموجود'}</em>
                          {item.featured && <em data-featured="true">ویژه</em>}
                          {item.variants.length > 0 && <em data-variants="true">{fa(item.variants.length)} سایز</em>}
                          {(item.excludeFromPriceStats || automaticallyExcluded(item.price, section.facetId)) && <em data-excluded="true">خارج از آمار قیمت</em>}
                          {item.archivedAt && <em>آرشیو</em>}
                        </span>
                      </summary>

                      <ManagedForm action={itemAction} actions={{ menu: menuOpAction }} className={styles.itemEditForm}>
                        <input type="hidden" name="itemId" value={item.id} />
                        <PlaceFormIdentity placeId={place.id} revision={revision} />
                        <div className={styles.itemFields}>
                          <label className={styles.field}><span className={styles.label}>نام آیتم</span><input name="name" className={styles.input} defaultValue={item.name} maxLength={250} required disabled={readOnly || Boolean(item.archivedAt)} /></label>
                          <label className={styles.field}><span className={styles.label}>{item.variants.length ? 'قیمت شروع (خودکار)' : 'قیمت (تومان)'}</span><input name="price" className={styles.input} defaultValue={item.price ?? ''} inputMode="numeric" dir="ltr" placeholder="خالی = قیمت روز" disabled={readOnly || Boolean(item.archivedAt) || item.variants.length > 0} />{item.variants.length > 0 && <small className={styles.fieldHelp}>از کمترین سایز موجود محاسبه می‌شود.</small>}</label>
                          <label className={styles.field}><span className={styles.label}>دسته</span><select name="sectionId" className={styles.input} defaultValue={section.id} disabled={readOnly || Boolean(item.archivedAt)}>{sections.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select></label>
                          <label className={`${styles.field} ${styles.itemDescriptionField}`}><span className={styles.label}>توضیحات</span><textarea name="description" className={styles.textarea} defaultValue={item.description ?? ''} maxLength={1000} rows={2} placeholder="مواد تشکیل‌دهنده یا توضیح کوتاه" disabled={readOnly || Boolean(item.archivedAt)} /></label>
                        </div>

                        {!item.archivedAt && <div className={styles.itemOptionRow}>
                          <label className={styles.switchLabel}><input type="checkbox" name="available" defaultChecked={item.available} disabled={readOnly} /><span />موجود در منو</label>
                          <label className={styles.switchLabel}><input type="checkbox" name="featured" defaultChecked={item.featured} disabled={readOnly} /><span />آیتم ویژه</label>
                          {canManagePriceStats && (
                            <label className={styles.priceStatsCheck}>
                              <input type="checkbox" name="excludeFromPriceStats" defaultChecked={item.excludeFromPriceStats} />
                              <span><strong>از محاسبهٔ سطح قیمت حذف شود</strong><small>مثلاً فروش دستگاه، کالا یا خدمتی که غذای منو نیست.</small></span>
                            </label>
                          )}
                          {canManagePriceStats && automaticExclusionReason(item.price, section.facetId) && (
                            <span className={styles.autoExcludedNote}>{automaticExclusionReason(item.price, section.facetId)}</span>
                          )}
                          <a href={paths.item(item.publicId, itemSlug(item.name))} target="_blank" rel="noreferrer" className={styles.publicItemLink}>صفحهٔ عمومی <ExternalLink size={12} /></a>
                        </div>}

                        {!readOnly && !item.archivedAt && <div className={styles.itemMediaControls}><ItemImagePicker hasImage={Boolean(item.imageUrl)} />{item.imageUrl && <label className={styles.itemRemoveImage}><input type="checkbox" name="removeImage" /> حذف عکس فعلی</label>}</div>}

                        {!readOnly && <div className={styles.itemFooter}>
                          {!item.archivedAt ? <>
                            <button type="submit" className={styles.itemPrimarySave}>ذخیره تغییرات</button>
                            <span className={styles.itemActions}>
                              <button type="submit" data-managed-action="menu" name="operation" value="item.up" disabled={itemIndex === 0} title="بالاتر"><ArrowUp size={15} /> بالا</button>
                              <button type="submit" data-managed-action="menu" name="operation" value="item.down" disabled={itemIndex === sourceSection.items.length - 1} title="پایین‌تر"><ArrowDown size={15} /> پایین</button>
                              <button type="submit" data-managed-action="menu" name="operation" value="item.duplicate"><Copy size={15} /> کپی</button>
                              <button type="submit" data-managed-action="menu" name="operation" value="item.archive" className={styles.archiveButton}><Archive size={15} /> آرشیو</button>
                            </span>
                          </> : <span className={styles.itemActions}><button type="submit" data-managed-action="menu" name="operation" value="item.restore"><RotateCcw size={15} /> بازیابی</button><button type="submit" data-managed-action="menu" name="operation" value="item.delete" className={styles.dangerButton} onClick={(event) => { if (!window.confirm(`آیتم «${item.name}» برای همیشه حذف شود؟`)) event.preventDefault() }}><Trash2 size={15} /> حذف نهایی</button></span>}
                        </div>}
                      </ManagedForm>

                      {!item.archivedAt && (
                        <div className={styles.variantManager}>
                          <div className={styles.variantHeading}>
                            <div><strong>سایز و تنوع قیمت</strong><small>برای کوچک/بزرگ یا تک‌نفره/دونفره؛ قیمت شروع آیتم خودکار است.</small></div>
                            <span>{fa(item.variants.length)} مورد</span>
                          </div>
                          {item.variants.map((variant, variantIndex) => (
                            <ManagedForm key={variant.id} action={variantAction} className={styles.variantRow}>
                              <PlaceFormIdentity placeId={place.id} revision={revision} />
                              <input type="hidden" name="itemId" value={item.id} />
                              <input type="hidden" name="variantId" value={variant.id} />
                              <label><span>نام سایز</span><input name="variantLabel" defaultValue={variant.label} maxLength={120} required disabled={readOnly} /></label>
                              <label><span>قیمت (تومان)</span><input name="variantPrice" defaultValue={variant.price ?? ''} inputMode="numeric" dir="ltr" placeholder="قیمت روز" disabled={readOnly} /></label>
                              <label className={styles.variantAvailability}><input type="checkbox" name="variantAvailable" defaultChecked={variant.available} disabled={readOnly} /> موجود</label>
                              {!readOnly && <div className={styles.variantActions}>
                                <button type="submit" name="operation" value="variant.save">ذخیره</button>
                                <button type="submit" name="operation" value="variant.up" disabled={variantIndex === 0} title="بالاتر"><ArrowUp size={14} /></button>
                                <button type="submit" name="operation" value="variant.down" disabled={variantIndex === item.variants.length - 1} title="پایین‌تر"><ArrowDown size={14} /></button>
                                <button type="submit" name="operation" value="variant.delete" className={styles.variantDelete} onClick={(event) => { if (!window.confirm(`سایز «${variant.label}» حذف شود؟`)) event.preventDefault() }} title="حذف"><Trash2 size={14} /></button>
                              </div>}
                            </ManagedForm>
                          ))}
                          {!readOnly && (
                            <ManagedForm action={variantAction} className={styles.variantCreate}>
                              <PlaceFormIdentity placeId={place.id} revision={revision} />
                              <input type="hidden" name="itemId" value={item.id} />
                              <input name="variantLabel" placeholder="مثلاً بزرگ" maxLength={120} required />
                              <input name="variantPrice" placeholder="قیمت تومان" inputMode="numeric" dir="ltr" />
                              <button type="submit" name="operation" value="variant.create"><ImagePlus size={14} /> افزودن سایز</button>
                            </ManagedForm>
                          )}
                        </div>
                      )}
                    </details>
                    )
                  })}
                </div>
              </details>
            )})}
            {menuSectionsToRender.length === 0 && <p className={styles.emptyNote}>{normalizedMenuQuery ? 'آیتمی با این عبارت پیدا نشد.' : 'این دسته آیتمی برای نمایش ندارد.'}</p>}
          </div>
        </section>
      )}

      {/* ── QR منوی عمومی همین شعبه ──────────────────────────────── */}
      {tab === 'qr' && (
        <section className={styles.section}>
          {place.status !== 'published' && place.status !== 'temporarily_closed' ? (
            <div className={styles.galleryEmpty}><QrCode size={30} /><strong>QR هنوز قابل انتشار نیست</strong><span>ابتدا وضعیت شعبه باید منتشرشده باشد تا مقصد عمومی معتبر داشته باشد.</span></div>
          ) : <div className={styles.qrWorkspace}>
            <div className={styles.qrPrintCard}>
              <span className={styles.qrEyebrow}>منوی آنلاین و به‌روز</span>
              <h2>{place.name}</h2>
              <img
                src={`/api/qr/cafe/${encodeURIComponent(place.slug)}`}
                alt={`QR منوی ${place.name}`}
                width={320}
                height={320}
              />
              <strong>برای دیدن منو اسکن کنید</strong>
              <small dir="ltr">kucafe.ir/cafe/{place.slug}</small>
            </div>
            <div className={styles.qrGuide}>
              <h2 className={styles.boxTitle}>آماده برای چاپ</h2>
              <p>این QR همیشه به صفحه عمومی همین شعبه می‌رود؛ تغییر قیمت یا آیتم منو نیاز به چاپ دوباره ندارد.</p>
              <label className={styles.qrUrl}><span>مقصد QR</span><input readOnly dir="ltr" value={absoluteUrl(paths.cafe(place.slug))} /></label>
              <div className={styles.qrActions}>
                <a href={`/api/qr/cafe/${encodeURIComponent(place.slug)}?download=1`} download><Download size={17} /> دانلود SVG باکیفیت</a>
                <button type="button" onClick={() => window.print()}><Printer size={17} /> چاپ کارت</button>
                <button type="button" onClick={copyQrUrl}><Copy size={17} /> {qrCopyState === 'copied' ? 'کپی شد' : qrCopyState === 'error' ? 'کپی نشد؛ لینک را انتخاب کنید' : 'کپی لینک'}</button>
              </div>
              <ul>
                <li>فایل SVG برای چاپ بزرگ بدون افت کیفیت مناسب است.</li>
                <li>حداقل اندازه پیشنهادی چاپ ۳×۳ سانتی‌متر است.</li>
                <li>اطراف QR را سفید و بدون نوشته یا برش نگه دارید.</li>
              </ul>
            </div>
          </div>}
        </section>
      )}

      {/* ── نظرها ────────────────────────────────────────────────── */}
      {tab === 'reviews' && (
        <section className={styles.section}>
          <Feedback state={replyState} />

          {reviews.length === 0 ? (
            <p className={styles.emptyNote}>هنوز نظری برای این مجموعه ثبت نشده.</p>
          ) : (
            <ul className={styles.reviewList}>
              {reviews.map((review) => (
                <li key={review.id} className={styles.reviewItem}>
                  <div className={styles.reviewHead}>
                    <strong>{review.authorName || 'کاربر کو کافه'}</strong>
                    <Stars count={review.stars} size={14} showEmpty />
                    {review.status !== 'approved' && (
                      <span className={styles.pendingBadge}>
                        {review.status === 'pending' ? 'در انتظار تأیید' : 'منتشر نشده'}
                      </span>
                    )}
                  </div>

                  {review.text && <p className={styles.reviewText}>{review.text}</p>}
                  {review.itemNames && review.itemNames.length > 0 && <p className={styles.reviewItems}>سفارش: {review.itemNames.join('، ')}</p>}

                  {(review.replyDetails ?? review.replies.map(text => ({ text, status: 'approved' }))).map((reply, index) => (
                    <p key={index} className={styles.replyText}>
                      <strong>پاسخ رسمی:</strong> {reply.text} <small>{reply.status === 'pending' ? ' · در انتظار بررسی' : reply.status === 'rejected' ? ' · منتشر نشده' : ' · منتشرشده'}</small>
                    </p>
                  ))}

                  {!readOnly && (review.replies.length === 0 || review.replyDetails?.every(reply => reply.status === 'rejected')) && (
                    <ManagedForm action={replyAction} className={styles.replyForm}>
                      <input type="hidden" name="reviewId" value={review.id} />
                      <label className={styles.srOnly} htmlFor={`owner-reply-${review.id}`}>پاسخ رسمی مجموعه به نظر</label><textarea
                        id={`owner-reply-${review.id}`}
                        name="text"
                        className={styles.textarea}
                        rows={2}
                        placeholder={ownerRepliesRequireApproval ? 'پاسخ شما — پس از بررسی منتشر می‌شود.' : 'پاسخ شما — بلافاصله منتشر می‌شود.'}
                        required
                      />
                      <SaveButton label="ثبت پاسخ" />
                    </ManagedForm>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'history' && !readOnly && <AuditHistory placeId={place.id} revision={revision}/>}
      {tab === 'club' && <section className={styles.section}>{clubPanel}</section>}

      {/* ── دسترسی کاربران همین شعبه ─────────────────────────────── */}
      {tab === 'users' && (
        <section className={styles.section}>
          <Feedback state={removeUserState} />
          <div className={styles.managerList}>
            {managers.length === 0 ? (
              <p className={styles.emptyNote}>هنوز کاربری به این شعبه متصل نیست.</p>
            ) : managers.map((manager) => (
              <div key={manager.userId} className={styles.managerRow}>
                <span className={styles.managerAvatar} aria-hidden="true"><Users size={18} /></span>
                <span className={styles.managerIdentity}>
                  <strong>{manager.name || manager.username || manager.phone || 'کاربر بدون نام'}</strong>
                  <small dir="ltr">{manager.username ? `@${manager.username}` : manager.phone || 'شناسه ثبت نشده'}</small>
                </span>
                <span className={styles.managerRole}>{manager.role === 'owner' ? 'مالک' : manager.role === 'manager' ? 'مدیر شعبه' : 'همکار'}</span>
                {canManageUsers && manager.userId !== currentUserId && (
                  <ManagedForm action={removeUserAction} onSubmit={(event) => { if (!window.confirm('دسترسی این کاربر به همین شعبه برداشته شود؟')) event.preventDefault() }}>
                    <input type="hidden" name="placeId" value={place.id} />
                    <input type="hidden" name="userId" value={manager.userId} />
                    <button type="submit" className={styles.managerRemove}>حذف دسترسی</button>
                  </ManagedForm>
                )}
              </div>
            ))}
          </div>

          {canManageUsers ? (
            <ManagedForm action={userAction} className={`${styles.form} ${styles.managerForm}`}>
              <input type="hidden" name="placeId" value={place.id} />
              <div className={styles.managerFormHead}>
                <div><strong>افزودن مدیر شعبه</strong><small>اگر حساب وجود داشته باشد، بدون تغییر رمز به همین شعبه متصل می‌شود.</small></div>
              </div>
              <Feedback state={userState} />
              {userState.credentials && (
                <div className={styles.credentialsBox} role="status">
                  <strong>این اطلاعات فقط همین یک‌بار نمایش داده می‌شود</strong>
                  <span>نام کاربری: <code dir="ltr">{userState.credentials.username}</code></span>
                  <span>رمز موقت: <code dir="ltr">{userState.credentials.password}</code></span>
                </div>
              )}
              <div className={styles.row}>
                <label className={styles.field}><span className={styles.label}>نام</span><input className={styles.input} name="name" maxLength={120} autoComplete="name" /></label>
                <label className={styles.field}><span className={styles.label}>شماره موبایل</span><input className={styles.input} name="phone" inputMode="tel" dir="ltr" autoComplete="tel" placeholder="09xxxxxxxxx" /></label>
              </div>
              <label className={styles.field}><span className={styles.label}>نام کاربری (اختیاری)</span><input className={styles.input} name="username" dir="ltr" autoCapitalize="none" autoCorrect="off" placeholder="cafe.manager" /></label>
              <input type="hidden" name="role" value="manager" />
              <p className={styles.hint}>مدیر شعبه می‌تواند اطلاعات، ساعت، منو و نظرها را مدیریت کند؛ اما اجازه افزودن کاربر یا دسترسی به شعبه‌های دیگر را ندارد.</p>
              <SaveButton label="افزودن مدیر شعبه" />
            </ManagedForm>
          ) : (
            <p className={styles.readOnlyNote}>فقط مالک شعبه یا مدیر سیستم می‌تواند دسترسی کاربران را تغییر دهد.</p>
          )}
        </section>
      )}
    </div>
  )
}

export default VenuePanel
