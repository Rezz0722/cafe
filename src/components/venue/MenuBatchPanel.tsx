'use client'

import { useState } from 'react'
import { venueMenuBatchAction } from '@/app/admin/venue/actions'
import { EMPTY_VENUE_STATE } from '@/app/admin/venue/state'
import { useManagedActionState } from '@/components/admin/ManagedForm'
import { MAX_MENU_BATCH_ITEMS, type MenuBatchOperation } from '@/core/places/menuBatchContract'
import { fa } from '@/lib/format'
import styles from './VenuePanel.module.css'

const OPTIONS: { value: MenuBatchOperation; label: string; impact: string }[] = [
  { value: 'available', label: 'موجود کردن', impact: 'آیتم‌های فعال در منوی عمومی موجود نشان داده می‌شوند.' },
  { value: 'unavailable', label: 'ناموجود کردن', impact: 'آیتم‌ها در منوی عمومی ناموجود نشان داده می‌شوند.' },
  { value: 'feature', label: 'ویژه کردن', impact: 'نشان ویژه به آیتم‌های انتخاب‌شده اضافه می‌شود.' },
  { value: 'unfeature', label: 'برداشتن نشان ویژه', impact: 'نشان ویژه از آیتم‌ها برداشته می‌شود.' },
  { value: 'archive', label: 'آرشیو کردن', impact: 'آیتم‌ها از منوی عمومی پنهان می‌شوند.' },
  { value: 'restore', label: 'بازیابی از آرشیو', impact: 'آیتم‌ها دوباره در منوی عمومی دیده می‌شوند.' },
]

export function MenuBatchPanel({ placeId, revision, selectedIds, readOnly }: {
  placeId: number; revision: string; selectedIds: number[]; readOnly: boolean
}) {
  const [operation, setOperation] = useState<MenuBatchOperation>('available')
  const [previewState, previewAction, previewing] = useManagedActionState(venueMenuBatchAction, EMPTY_VENUE_STATE)
  const [applyState, applyAction, applying] = useManagedActionState(venueMenuBatchAction, EMPTY_VENUE_STATE)
  const [previewKey, setPreviewKey] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const key = `${placeId}:${revision}:${operation}:${selectedIds.slice().sort((a, b) => a - b).join(',')}`
  const preview = previewState.menuBatchPreview
  const ready = previewState.ok && preview && previewKey === key && preview.revision === revision &&
    preview.changedCount > 0 && preview.rejectedCount === 0
  const refreshing = applyState.menuBatchAppliedRevision !== undefined && Number(revision) < applyState.menuBatchAppliedRevision
  const impact = OPTIONS.find(option => option.value === operation)?.impact

  return <section className={styles.menuBatchPanel} aria-labelledby="menu-batch-title">
    <h3 id="menu-batch-title">مدیریت گروهی آیتم‌های انتخاب‌شده</h3>
    <p>{fa(selectedIds.length)} آیتم انتخاب شده؛ سقف هر عملیات {fa(MAX_MENU_BATCH_ITEMS)} آیتم است.</p>
    <form action={async data => {
      const result = await applyAction(data)
      if (result.ok) { setPreviewKey(''); setConfirmed(false) }
    }}>
      <input type="hidden" name="placeId" value={placeId} />
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="itemIds" value={JSON.stringify(selectedIds)} />
      <input type="hidden" name="token" value={ready ? preview?.token : ''} />
      <label htmlFor="menu-batch-operation">عملیات</label>
      <select id="menu-batch-operation" name="batchOperation" className={styles.input} value={operation}
        onChange={event => { setOperation(event.target.value as MenuBatchOperation); setPreviewKey(''); setConfirmed(false) }}>
        {OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <p className={styles.hint}>{impact}</p>
      <div className={styles.menuBatchActions}>
        <button type="button" className={styles.save} disabled={readOnly || !selectedIds.length || selectedIds.length > MAX_MENU_BATCH_ITEMS || previewing || applying || refreshing}
          onClick={async event => {
            const form = event.currentTarget.form
            if (!form) return
            const data = new FormData(form)
            data.set('operation', 'preview')
            const captured = key
            const result = await previewAction(data)
            setPreviewKey(result.ok ? captured : '')
            setConfirmed(false)
          }}>{previewing ? 'در حال بررسی…' : 'پیش‌نمایش بدون ثبت'}</button>
        <button type="submit" name="operation" value="apply" className={styles.save}
          disabled={readOnly || !ready || !confirmed || applying || previewing || refreshing}>
          {applying ? 'در حال اعمال…' : `تأیید و اعمال روی ${fa(preview?.changedCount ?? 0)} آیتم`}
        </button>
      </div>
      {preview && previewKey === key && <div className={styles.menuBatchPreview} role="status">
        <strong>{fa(preview.selectedCount)} انتخاب · {fa(preview.changedCount)} قابل تغییر · {fa(preview.unchangedCount)} بدون تغییر · {fa(preview.rejectedCount)} ردشده</strong>
        {preview.rejectedCount > 0 && <p role="alert">بعضی شناسه‌ها از منوی قابل‌مدیریت این شعبه نیستند؛ انتخاب را اصلاح کنید.</p>}
        {preview.examples.length > 0 && <ul>{preview.examples.map((example, index) => <li key={index}>{example.name}: {example.before} ← {example.after}</li>)}</ul>}
        <p>اثر روی منوی عمومی: {impact}</p>
        <label className={styles.menuBatchConfirm}><input type="checkbox" name="confirmed" value="yes" checked={confirmed}
          onChange={event => setConfirmed(event.target.checked)} disabled={!ready} />پیش‌نمایش را بررسی کردم و تغییرات گروهی را تأیید می‌کنم.</label>
      </div>}
      {previewState.error && <p role="alert" className={styles.error}>{previewState.error}</p>}
      {(applyState.error || applyState.message) && <p role={applyState.ok ? 'status' : 'alert'} className={applyState.ok ? styles.success : styles.error}>{applyState.error || applyState.message}</p>}
    </form>
  </section>
}
