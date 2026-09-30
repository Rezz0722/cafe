'use client'
import { useId, useMemo, useState } from 'react'
import { isTargetCheckboxDisabled, staleSelectionIds, type TopMenuTarget } from '@/core/sync/topMenuSelection'
import { normalizeFa } from '@/core/text/normalize'
import { fa } from '@/lib/format'
import styles from './OperationsPanel.module.css'

export function SyncCafePicker({ title, targets, scope, selected, onScope, onSelected, disabled, allLabel }: {
  title: string; targets: TopMenuTarget[]; scope: 'all' | 'selected'; selected: number[];
  onScope: (value: 'all' | 'selected') => void; onSelected: (ids: number[]) => void;
  disabled: boolean; allLabel: string;
}) {
  const id = useId(), [query, setQuery] = useState('')
  const visible = useMemo(() => {
    const words = normalizeFa(query).trim().split(/\s+/).filter(Boolean)
    return targets.filter(target => words.every(word => normalizeFa(`${target.name} ${target.username}`).includes(word)))
  }, [targets, query])
  const chosen = new Set(selected)
  // انتخاب قبلیِ ادمین ممکن است شامل کافه‌هایی باشد که بعداً از منبع حذف شدند.
  // خودِ `selected` دست‌نخورده می‌ماند (کاربر باید خودش تیک را بردارد)، ولی
  // دکمه‌ی زیر اجازه‌ی برداشتنِ گروهیِ همان‌ها را می‌دهد.
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
        <button type="button" disabled={!visible.length} onClick={() => onSelected([...new Set([...selected, ...visible.map(target => target.sourceId)])])}>انتخاب همهٔ نتایج</button>
        <button type="button" disabled={!selected.length} onClick={() => onSelected([])}>پاک‌کردن انتخاب‌ها</button>
        {stale.length > 0 && <button type="button" onClick={() => onSelected(selected.filter(id => !stale.includes(id)))}>برداشتن {fa(stale.length)} کافهٔ حذف‌شده از منبع</button>}
      </div>
      {stale.length > 0 && <p role="status" className={styles.pickerStaleNote}>
        {fa(stale.length)} کافه در فهرست TopMenuMarket نیست و اسکرپ با انتخاب آن‌ها متوقف می‌شود. تیکشان را بردار یا از دکمه‌ی بالا استفاده کن.
      </p>}
      {/*
        ردیفِ حذف‌شده از منبع پنهان نمی‌شود — کم‌رنگ و برچسب‌دار می‌ماند تا ادمین
        بداند این مجموعه در سایت هست و از منبع رفته. چک‌باکسش هم فقط تا وقتی
        غیرمهارت است قفل است: اگر از قبل تیک دارد، تیک برداشتنش باید ممکن باشد،
        وگرنه هیچ راهی برای اجرای اسکرپ نمی‌ماند (سرور درخواست را رد می‌کند).
      */}
      <div className={styles.pickerList}>
        {visible.map(target => {
          const locked = isTargetCheckboxDisabled(target, selected)
          return <label key={target.sourceId} className={styles.pickerRow} data-selected={chosen.has(target.sourceId) || undefined} data-stale={target.inSource === false || undefined} data-locked={locked || undefined}>
            <input type="checkbox" checked={chosen.has(target.sourceId)} disabled={locked} onChange={event => onSelected(event.target.checked ? [...selected, target.sourceId] : selected.filter(sourceId => sourceId !== target.sourceId))} />
            <span><b>{target.name}</b><small>{target.items !== undefined && `${fa(target.items)} آیتم · `}{target.placeId === null ? 'کافهٔ جدید' : 'کافهٔ موجود'}{target.username && <span dir="ltr"> · {target.username}</span>}{target.inSource === false && <em className={styles.pickerStale}>{chosen.has(target.sourceId) ? 'حذف‌شده از منبع — تیک را بردار تا این اجرا جلو برود' : 'حذف‌شده از منبع — قابل اسکرپ نیست'}</em>}</small></span>
          </label>
        })}
        {!visible.length && <p className={styles.selectionNote}>{targets.length ? 'کافه‌ای با این عبارت پیدا نشد؛ انتخاب‌های قبلی حفظ شده‌اند.' : 'کافه‌ای در این فهرست نیست؛ برای کشف کافه‌های تازه، اسکرپ همهٔ کافه‌ها را انتخاب کن.'}</p>}
      </div>
      <p className={styles.selectionNote}>فقط کافه‌های تیک‌خورده وارد این مرحله می‌شوند؛ فیلتر جست‌وجو انتخاب‌های قبلی را حذف نمی‌کند.</p>
    </>}
  </fieldset>
}
