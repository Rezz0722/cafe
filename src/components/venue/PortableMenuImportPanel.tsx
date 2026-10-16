'use client'

import { useRef, useState } from 'react'
import { venuePortableImportAction } from '@/app/admin/venue/actions'
import { EMPTY_VENUE_STATE } from '@/app/admin/venue/state'
import { ManagedForm, useManagedActionState } from '@/components/admin/ManagedForm'
import { MAX_PORTABLE_APPLY, MAX_PORTABLE_BYTES } from '@/core/import/menuPortable'
import { fa } from '@/lib/format'
import styles from './MenuImportPanel.module.css'

export function PortableMenuImportPanel({ placeId, revision }: { placeId: number; revision: string }) {
  const [contentRevision, setContentRevision] = useState(0), [selected, setSelected] = useState<number[]>([])
  const [confirmed, setConfirmed] = useState(false), [fileError, setFileError] = useState('')
  const [reading, setReading] = useState(false), sequence = useRef(0), textField = useRef<HTMLTextAreaElement>(null)
  const [state, action, pending] = useManagedActionState(venuePortableImportAction, EMPTY_VENUE_STATE)
  const [previewKey, setPreviewKey] = useState('')
  const key = `${placeId}:${revision}:${contentRevision}`
  const preview = state.portableImportPreview?.revision === revision && previewKey === key ? state.portableImportPreview : undefined
  const refreshing = state.portableImportAppliedRevision !== undefined && Number(revision) < state.portableImportAppliedRevision
  const clearPreview = () => { setPreviewKey(''); setSelected([]); setConfirmed(false) }
  const submit = async (data: FormData) => {
    const operation = String(data.get('operation') ?? '')
    const result = await action(data)
    if (operation === 'preview') { setPreviewKey(result.portableImportPreview ? key : ''); setSelected([]); setConfirmed(false) }
    else if (result.ok) clearPreview()
    return result
  }
  return <details className={styles.panel}>
    <summary>بازیابی کنترل‌شده از خروجی CSV یا JSON کو کافه</summary>
    <p className={styles.help}>فقط آیتم جدید ساخته می‌شود؛ آیتم هم‌نام، حتی آرشیوی، تغییر نمی‌کند. JSON اطلاعات سایز و وضعیت بیشتری دارد. CSV فاقد بعضی فراداده‌هاست و بازیابی آن بی‌اتلاف نیست. عکس‌ها خودکار منتقل نمی‌شوند.</p>
    <ManagedForm action={submit} className={styles.form}>
      <input type="hidden" name="placeId" value={placeId} />
      <input type="hidden" name="revision" value={revision} />
      <label>فایل خروجی کو کافه (CSV یا JSON)
        <input type="file" accept=".csv,.json,text/csv,application/json" aria-describedby="portable-import-help portable-import-file-error" aria-invalid={!!fileError}
          onChange={async event => {
            const file = event.target.files?.[0], current = ++sequence.current
            // Submit only decoded text, never a second copy of the file in FormData.
            event.currentTarget.value = ''
            clearPreview(); setFileError(''); setReading(false)
            if (!file) return
            if (file.size > MAX_PORTABLE_BYTES) { setFileError('فایل باید حداکثر ۵۱۲ کیلوبایت باشد.'); return }
            setReading(true)
            try {
              const content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
              if (current === sequence.current && textField.current) {
                textField.current.value = content
                setContentRevision(value => value + 1)
              }
            } catch { if (current === sequence.current) setFileError('فایل UTF-8 خوانده نشد.') }
            finally { if (current === sequence.current) setReading(false) }
          }} />
      </label>
      <p id="portable-import-file-error" role={fileError ? 'alert' : undefined}>{fileError}</p>
      <label>متن فایل برای بررسی
        <textarea ref={textField} name="text" rows={5} required maxLength={MAX_PORTABLE_BYTES} dir="auto"
          aria-describedby="portable-import-help" onInput={() => { ++sequence.current; setReading(false); setContentRevision(value => value + 1); clearPreview(); setFileError('') }} />
      </label>
      <p id="portable-import-help" className={styles.help}>حداکثر ۵۱۲ کیلوبایت و ۵۰۰ آیتم؛ در هر ثبت تا {fa(MAX_PORTABLE_APPLY)} آیتم تازه. پیش‌نمایش فقط ۱۰ دقیقه معتبر است. فایل واقعی شعبه را عمومی منتشر نکنید.</p>
      <button type="submit" name="operation" value="preview" disabled={pending || reading || refreshing || !!fileError}>{reading ? 'در حال خواندن…' : 'بررسی و پیش‌نمایش؛ بدون ثبت'}</button>
      {preview && <section className={styles.preview} aria-labelledby="portable-import-preview-title">
        <h3 id="portable-import-preview-title">پیش‌نمایش {preview.format.toUpperCase()}</h3>
        <p role="status">{fa(preview.newSections)} دستهٔ جدید · {fa(preview.newItems)} آیتم جدید · {fa(preview.existingItems)} موجود/ردشده · {fa(preview.conflicts)} تعارض · {fa(preview.newVariants)} سایز جدید</p>
        <p>{fa(preview.archivedItems)} آیتم آرشیوی · {fa(preview.unknownPrices)} قیمت نامعلوم · {fa(preview.ignoredImages)} مرجع تصویرِ بدون انتقال. فراداده‌های انتقال‌نیافته: {preview.ignoredMetadata.join('، ')}.</p>
        <div className={styles.rows} role="group" aria-label="آیتم‌های فایل">
          {preview.rows.map(row => <label key={row.index}>
            <input type="checkbox" checked={selected.includes(row.index)} disabled={row.status !== 'new' || (!selected.includes(row.index) && selected.length >= MAX_PORTABLE_APPLY)}
              onChange={event => { setSelected(current => event.target.checked ? [...current, row.index] : current.filter(index => index !== row.index)); setConfirmed(false) }} />
            <span><strong>{row.section} / {row.name}</strong><small>{row.status === 'new' ? `جدید · ${fa(row.variantCount)} سایز` : row.reason}</small></span>
          </label>)}
        </div>
        <input type="hidden" name="token" value={preview.token} />
        <input type="hidden" name="selected" value={JSON.stringify(selected)} />
        <label className={styles.confirm}><input type="checkbox" name="confirmed" value="yes" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
          <span>فقط {fa(selected.length)} آیتم جدید انتخاب‌شده ساخته شود؛ هیچ آیتم موجودی تغییر نکند.</span></label>
        <button type="submit" name="operation" value="apply" disabled={!selected.length || !confirmed || pending || refreshing}>تأیید و افزودن {fa(selected.length)} آیتم</button>
      </section>}
      {state.error && <p role="alert" className={styles.help}>{state.error}</p>}
      {state.ok && state.message && <p role="status" className={styles.help}>{state.message}</p>}
    </ManagedForm>
  </details>
}
