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

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  bulkPriceAction,
  replyReviewAction,
  saveMenuItemAction,
  saveVenueAttributesAction,
  saveVenueHoursAction,
  saveVenueInfoAction,
} from '@/app/admin/venue/actions'
import { EMPTY_VENUE_STATE } from '@/app/admin/venue/state'
import { WEEKDAY_NAMES } from '@/core/import/normalize'
import { FILTER_ATTRIBUTES } from '@/core/taxonomy/attributes'
import type { OwnerPlaceData } from '@/core/places/manage'
import { fa, toman } from '@/lib/format'
import { Stars } from '@/components/ui/Stars'
import { paths } from '@/routes'
import styles from './VenuePanel.module.css'
import { Check, Coffee, ExternalLink } from 'lucide-react'

type Tab = 'overview' | 'info' | 'hours' | 'menu' | 'reviews'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'نمای کلی' },
  { id: 'info', label: 'اطلاعات' },
  { id: 'hours', label: 'ساعت کاری' },
  { id: 'menu', label: 'منو و قیمت' },
  { id: 'reviews', label: 'نظرها' },
]

function SaveButton({ label = 'ذخیره' }: { label?: string }) {
  const { pending } = useFormStatus()
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

export interface VenueReview {
  id: number
  authorName: string
  stars: number
  text: string | null
  status: string
  createdAt: Date
  replies: string[]
}

interface Props {
  place: OwnerPlaceData
  reviews: VenueReview[]
  /** کافه‌های دیگری که این کاربر اداره می‌کند. */
  otherPlaces: { id: number; name: string }[]
  onSelectPlace?: (id: number) => void
  readOnly: boolean
  /** بعد از چند روز قیمت «بیات» شمرده می‌شود — از تنظیمات پنل ادمین. */
  stalePriceDays?: number
}

export function VenuePanel({
  place,
  reviews,
  otherPlaces,
  readOnly,
  stalePriceDays = 90,
}: Props) {
  const [tab, setTab] = useState<Tab>('overview')

  const [infoState, infoAction] = useActionState(saveVenueInfoAction, EMPTY_VENUE_STATE)
  const [hoursState, hoursAction] = useActionState(saveVenueHoursAction, EMPTY_VENUE_STATE)
  const [attributesState, attributesAction] = useActionState(
    saveVenueAttributesAction,
    EMPTY_VENUE_STATE,
  )
  const [bulkState, bulkAction] = useActionState(bulkPriceAction, EMPTY_VENUE_STATE)
  const [itemState, itemAction] = useActionState(saveMenuItemAction, EMPTY_VENUE_STATE)
  const [replyState, replyAction] = useActionState(replyReviewAction, EMPTY_VENUE_STATE)

  const itemCount = place.sections.reduce((sum, section) => sum + section.items.length, 0)
  const pricedCount = place.sections.reduce(
    (sum, section) => sum + section.items.filter((item) => item.price !== null).length,
    0,
  )
  const staleCount = place.sections.reduce(
    (sum, section) =>
      sum +
      section.items.filter(
        (item) =>
          item.price !== null &&
          (!item.priceUpdatedAt ||
            Date.now() - new Date(item.priceUpdatedAt).getTime() >
              stalePriceDays * 24 * 3600 * 1000),
      ).length,
    0,
  )

  /** ساعت‌های موجود، به تفکیک روز و شیفت — برای پیش‌پرکردن فرم. */
  const hoursByDay = new Map<number, typeof place.hours>()
  for (const shift of place.hours) {
    const list = hoursByDay.get(shift.dow)
    if (list) list.push(shift)
    else hoursByDay.set(shift.dow, [shift])
  }

  return (
    <div className={styles.panel}>
      <header className={styles.head}>
        <div className={styles.headMain}>
          {place.logoUrl ? (
            <img src={place.logoUrl} alt="" width={52} height={52} className={styles.logo} />
          ) : (
            <span className={styles.logoEmpty} aria-hidden="true">
              <Coffee size={22} strokeWidth={1.7} />
            </span>
          )}
          <div>
            <h1 className={styles.title}>{place.name}</h1>
            <p className={styles.sub}>
              <a href={paths.cafe(place.slug)} target="_blank" rel="noreferrer">
                دیدن صفحه‌ی عمومی <ExternalLink size={13} aria-hidden="true" />
              </a>
              {place.status !== 'published' && (
                <span className={styles.draftBadge}>منتشر نشده</span>
              )}
            </p>
          </div>
        </div>

        {otherPlaces.length > 0 && (
          <form method="get" className={styles.placeSwitch}>
            <label>
              <span className={styles.srOnly}>انتخاب مجموعه</span>
              <select name="place" defaultValue={String(place.id)} onChange={(event) => event.currentTarget.form?.submit()}>
                <option value={String(place.id)}>{place.name}</option>
                {otherPlaces.map((other) => (
                  <option key={other.id} value={String(other.id)}>
                    {other.name}
                  </option>
                ))}
              </select>
            </label>
          </form>
        )}
      </header>

      {readOnly && (
        <p className={styles.readOnlyNote}>
          در حالت «مشاهده به‌عنوان» هستید — این پنل فقط‌خواندنی است.
        </p>
      )}

      <nav className={styles.tabs} aria-label="بخش‌های پنل">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? styles.tabOn : styles.tab}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {item.id === 'reviews' && reviews.length > 0 && (
              <span className={styles.tabCount}>{fa(reviews.length)}</span>
            )}
          </button>
        ))}
      </nav>

      {/* ── نمای کلی ─────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <section className={styles.section}>
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
              <span className={styles.statLabel}>میانگین قیمت</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{fa(place.qualityScore)}٪</span>
              <span className={styles.statLabel}>کامل‌بودن پروفایل</span>
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

          {/* کارهای باقی‌مانده — به‌جای یک نمودار تزئینی، فهرستِ کارِ واقعی. */}
          <div className={styles.todoBox}>
            <h2 className={styles.boxTitle}>چه چیزی می‌تواند بهتر شود</h2>
            <ul className={styles.todoList}>
              {place.geoStatus !== 'ok' && (
                <li>
                  مختصات ثبت نشده — بدون آن، مجموعه‌تان روی نقشه و در «نزدیک من»
                  دیده نمی‌شود.{' '}
                  <button type="button" onClick={() => setTab('info')}>
                    ثبت مختصات
                  </button>
                </li>
              )}
              {place.hours.length === 0 && (
                <li>
                  ساعت کاری ثبت نشده — پرتکرارترین سؤال کاربران.{' '}
                  <button type="button" onClick={() => setTab('hours')}>
                    ثبت ساعت
                  </button>
                </li>
              )}
              {!place.about && (
                <li>
                  متن «درباره» خالی است.{' '}
                  <button type="button" onClick={() => setTab('info')}>
                    نوشتن
                  </button>
                </li>
              )}
              {place.phones.length === 0 && (
                <li>
                  شماره تماس ثبت نشده.{' '}
                  <button type="button" onClick={() => setTab('info')}>
                    افزودن
                  </button>
                </li>
              )}
              {staleCount > 0 && (
                <li>
                  قیمت {fa(staleCount)} آیتم بیش از {fa(stalePriceDays)} روز به‌روز نشده.{' '}
                  <button type="button" onClick={() => setTab('menu')}>
                    به‌روزرسانی
                  </button>
                </li>
              )}
              {place.geoStatus === 'ok' &&
                place.hours.length > 0 &&
                place.about &&
                place.phones.length > 0 &&
                staleCount === 0 && <li className={styles.allDone}>
                    <Check size={15} aria-hidden="true" /> پروفایل کامل است.
                  </li>}
            </ul>
          </div>
        </section>
      )}

      {/* ── اطلاعات ──────────────────────────────────────────────── */}
      {tab === 'info' && (
        <section className={styles.section}>
          <form action={infoAction} className={styles.form}>
            <input type="hidden" name="placeId" value={place.id} />
            <Feedback state={infoState} />

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
                  defaultValue={place.lat ?? ''}
                  dir="ltr"
                  inputMode="decimal"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>طول جغرافیایی</span>
                <input
                  name="lng"
                  className={styles.input}
                  defaultValue={place.lng ?? ''}
                  dir="ltr"
                  inputMode="decimal"
                />
              </label>
            </div>
            <p className={styles.hint}>
              مختصات را از نشان یا گوگل مپس کپی کنید. بدون مختصات، مجموعه روی نقشه و در
              «نزدیک من» دیده نمی‌شود.
            </p>

            {!readOnly && <SaveButton />}
          </form>

          {/*
            ویژگی‌ها فرم جداست، نه بخشی از فرم اطلاعات.

            دلیلش ذخیره‌ی مستقل است: کافه‌داری که فقط می‌خواهد «پریز کنار میز»
            را تیک بزند، نباید ریسک کند که نام و آدرس و مختصاتش هم دوباره
            نوشته شوند. تبِ جدا هم نساختیم — این‌ها واقعیت‌های پایه‌ی مجموعه‌اند
            و جایشان همین‌جاست.
          */}
          <form action={attributesAction} className={styles.form}>
            <input type="hidden" name="placeId" value={place.id} />
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
          </form>
        </section>
      )}

      {/* ── ساعت کاری ────────────────────────────────────────────── */}
      {tab === 'hours' && (
        <section className={styles.section}>
          <form action={hoursAction} className={styles.form}>
            <input type="hidden" name="placeId" value={place.id} />
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
          </form>
        </section>
      )}

      {/* ── منو ──────────────────────────────────────────────────── */}
      {tab === 'menu' && (
        <section className={styles.section}>
          {/* پرکاربردترین کارِ کافه‌دار، در دسترس‌ترین جا. */}
          <form action={bulkAction} className={styles.bulkBox}>
            <input type="hidden" name="placeId" value={place.id} />
            <h2 className={styles.boxTitle}>تغییر دسته‌ای قیمت</h2>
            <p className={styles.hint}>
              قیمت همه‌ی {fa(pricedCount)} آیتمِ قیمت‌دار را با یک درصد تغییر دهید. نتیجه
              به هزار تومان گرد می‌شود.
            </p>
            <div className={styles.bulkRow}>
              <input
                name="percent"
                className={styles.input}
                type="number"
                step="1"
                min={-90}
                max={200}
                placeholder="۱۵"
                dir="ltr"
                required
              />
              <span className={styles.percentSign}>٪</span>
              {!readOnly && <SaveButton label="اعمال" />}
            </div>
            <Feedback state={bulkState} />
          </form>

          <Feedback state={itemState} />

          <div className={styles.menuList}>
            {place.sections.map((section) => (
              <details key={section.id} className={styles.menuSection}>
                <summary>
                  {section.name}
                  <span className={styles.sectionCount}>{fa(section.items.length)} آیتم</span>
                </summary>

                <div className={styles.itemRows}>
                  {section.items.map((item) => (
                    <form key={item.id} action={itemAction} className={styles.itemRow}>
                      <input type="hidden" name="itemId" value={item.id} />

                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" width={40} height={40} loading="lazy" />
                      ) : (
                        <span className={styles.itemNoImage} aria-hidden="true" />
                      )}

                      <span className={styles.itemName}>{item.name}</span>

                      <span className={styles.priceCell}>
                        <input
                          name="price"
                          className={styles.priceInput}
                          defaultValue={item.price ?? ''}
                          inputMode="numeric"
                          dir="ltr"
                          placeholder="قیمت روز"
                          aria-label={`قیمت ${item.name}`}
                        />
                      </span>

                      <label className={styles.itemToggle}>
                        <input
                          type="checkbox"
                          name="available"
                          defaultChecked={item.available}
                        />
                        موجود
                      </label>

                      <label className={styles.itemToggle}>
                        <input type="checkbox" name="featured" defaultChecked={item.featured} />
                        ویژه
                      </label>

                      {!readOnly && (
                        <button type="submit" className={styles.itemSave}>
                          ذخیره
                        </button>
                      )}
                    </form>
                  ))}
                </div>
              </details>
            ))}
          </div>
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

                  {review.replies.map((reply, index) => (
                    <p key={index} className={styles.replyText}>
                      <strong>پاسخ شما:</strong> {reply}
                    </p>
                  ))}

                  {!readOnly && review.replies.length === 0 && (
                    <form action={replyAction} className={styles.replyForm}>
                      <input type="hidden" name="reviewId" value={review.id} />
                      <textarea
                        name="text"
                        className={styles.textarea}
                        rows={2}
                        placeholder="پاسخ شما — بلافاصله منتشر می‌شود."
                        required
                      />
                      <SaveButton label="ثبت پاسخ" />
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

export default VenuePanel
