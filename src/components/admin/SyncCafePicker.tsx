'use client'
import { useId, useMemo, useState } from 'react'
import { staleSelectionIds, type TopMenuTarget } from '@/core/sync/topMenuSelection'
import { normalizeFa } from '@/core/text/normalize'
import { fa } from '@/lib/format'
import styles from './OperationsPanel.module.css'

export function SyncCafePicker({ title, targets, scope, selected, onScope, onSelected, disabled, allLabel, blockedSourceIds = [] }: {
  title: string; targets: TopMenuTarget[]; scope: 'all' | 'selected'; selected: number[];
  onScope: (value: 'all' | 'selected') => void; onSelected: (ids: number[]) => void;
  disabled: boolean; allLabel: string; blockedSourceIds?: number[];
}) {
  const id = useId(), [query, setQuery] = useState('')
  const visible = useMemo(() => {
    const words = normalizeFa(query).trim().split(/\s+/).filter(Boolean)
    return targets.filter(target => words.every(word => normalizeFa(`${target.name} ${target.username}`).includes(word)))
  }, [targets, query])
  const chosen = new Set(selected)
  const blocked = new Set(blockedSourceIds)
  const chosenBlocked = selected.filter(sourceId => blocked.has(sourceId))
  const selectableVisible = visible.filter(target => !blocked.has(target.sourceId))
  // حضور در منبع ممکن است بین نمایش صفحه و شروع اسکرپ عوض شود. این نشانه فقط
  // اطلاع‌رسانی است؛ اسکرپر با فهرست معتبر همان اجرا تصمیم می‌گیرد.
  const stale = useMemo(() => staleSelectionIds(targets, selected), [targets, selected])
  return <fieldset className={styles.cafePicker} disabled={disabled}>
    <legend>{title}</legend>
    <div className={styles.scopeOptions}>
      <label><input type="radio" name={`${id}-scope`} checked={scope === 'selected'} onChange={() => onScope('selected')} />انتخاب کافه‌ها</label>
      <label><input type="radio" name={`${id}-scope`} checked={scope === 'all'} onChange={() => onScope('all')} />{allLabel}</label>
    </div>
    {scope === 'all' ? <p className={styles.selectionNote}>این حالت همهٔ کافه‌های این مرحله را شامل می‌شود؛ برای به‌روزرسانی محدود، «انتخاب کافه‌ها» را بزن.</p> : <>
      <label className={styles.pickerSearch}>جست‌وجوی کافه
        <input type="search" placeholder="نام کافه یا نام آن در TopMenuMarket" value={query} onChange={event => setQuery(event.target.value)} autoComplete="off" />
      </label>
      <div className={styles.pickerTools}>
        <strong role="status">{fa(selected.length)} کافه انتخاب شده</strong>
        <button type="button" disabled={!selectableVisible.length} onClick={() => onSelected([...new Set([...selected, ...selectableVisible.map(target => target.sourceId)])])}>انتخاب همهٔ نتایج قابل‌استفاده</button>
        <button type="button" disabled={!selected.length} onClick={() => onSelected([])}>پاک‌کردن انتخاب‌ها</button>
        {chosenBlocked.length > 0 && <button type="button" onClick={() => onSelected(selected.filter(id => !blocked.has(id)))}>برداشتن {fa(chosenBlocked.length)} کافهٔ خطادار</button>}
      </div>
      {stale.length > 0 && <p role="status" className={styles.pickerStaleNote}>
        {fa(stale.length)} مورد در آخرین فهرست منبع نبود. هنگام اسکرپ، فقط مواردی که هنوز غایب‌اند خودکار کنار گذاشته و در گزارش ثبت می‌شوند؛ بقیهٔ انتخاب ادامه می‌یابد.
      </p>}
      {chosenBlocked.length > 0 && <p role="status" className={styles.pickerStaleNote}>
        دریافت اطلاعات {fa(chosenBlocked.length)} کافهٔ انتخاب‌شده ناموفق بوده است. برای اعمال بقیه، تیک آن‌ها را بردار.
      </p>}
      {/* ردیفِ غایب پنهان یا قفل نمی‌شود؛ فهرستِ قبلی ملاک قطعیِ اجرای تازه نیست. */}
      <div className={styles.pickerList}>
        {visible.map(target => {
          const failed = blocked.has(target.sourceId)
          const locked = failed && !chosen.has(target.sourceId)
          return <label key={target.sourceId} className={styles.pickerRow} data-selected={chosen.has(target.sourceId) || undefined} data-stale={target.inSource === false || failed || undefined} data-locked={locked || undefined}>
            <input type="checkbox" checked={chosen.has(target.sourceId)} disabled={locked} onChange={event => onSelected(event.target.checked ? [...selected, target.sourceId] : selected.filter(sourceId => sourceId !== target.sourceId))} />
            <span><b>{target.name}</b><small>{target.items !== undefined && `${fa(target.items)} آیتم · `}{target.placeId === null ? 'کافهٔ جدید' : 'کافهٔ موجود'}{target.username && <span dir="ltr"> · {target.username}</span>}{target.inSource === false && <em className={styles.pickerStale}>در آخرین فهرست منبع نبود؛ وضعیت در اجرای تازه دوباره بررسی می‌شود</em>}{failed && <em className={styles.pickerStale}>{chosen.has(target.sourceId) ? 'دریافت منو ناموفق — تیک را بردار' : 'دریافت منو ناموفق — قابل اعمال نیست'}</em>}</small></span>
          </label>
        })}
        {!visible.length && <p className={styles.selectionNote}>{targets.length ? 'کافه‌ای با این عبارت پیدا نشد؛ انتخاب‌های قبلی حفظ شده‌اند.' : 'کافه‌ای در این فهرست نیست؛ برای کشف کافه‌های تازه، اسکرپ همهٔ کافه‌ها را انتخاب کن.'}</p>}
      </div>
      <p className={styles.selectionNote}>فقط کافه‌های تیک‌خورده وارد این مرحله می‌شوند؛ فیلتر جست‌وجو انتخاب‌های قبلی را حذف نمی‌کند.</p>
    </>}
  </fieldset>
}
