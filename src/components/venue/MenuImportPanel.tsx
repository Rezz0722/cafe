'use client'

import { useRef, useState } from 'react'
import { ManagedForm } from '@/components/admin/ManagedForm'
import type { VenueActionState } from '@/app/admin/venue/state'
import { MAX_MENU_IMPORT_BYTES, MAX_MENU_IMPORT_APPLY, MENU_CSV_TEMPLATE } from '@/core/import/menuCsv'
import { fa, toman } from '@/lib/format'
import styles from './MenuImportPanel.module.css'

export function MenuImportPanel({ placeId, revision, sections, action }: {
  placeId: number
  revision: string
  sections: { id: number; name: string }[]
  action: (previous: VenueActionState, data: FormData) => Promise<VenueActionState>
}) {
  const [text, setText] = useState(''), [section, setSection] = useState(''), [delimiter, setDelimiter] = useState(',')
  const [state, setState] = useState<VenueActionState>({ ok: false }), [selected, setSelected] = useState<number[]>([])
  const [confirmed, setConfirmed] = useState(false), [fileError, setFileError] = useState('')
  const [readingFile, setReadingFile] = useState(false), readSequence = useRef(0)
  const clearPreview = () => { setState({ ok: false }); setSelected([]); setConfirmed(false) }
  const preview = state.menuImportPreview?.revision === revision ? state.menuImportPreview : undefined
  const submit = async (data: FormData) => {
    const result = await action(state, data)
    setState(result)
    if (result.menuImportPreview) { setSelected([]); setConfirmed(false) }
    return result
  }
  return <details className={styles.panel}>
    <summary>ورود گروهی آیتم‌ها از فایل یا Excel</summary>
    <p className={styles.help}>فقط آیتم جدید به یک دستهٔ مشخص اضافه می‌شود. آیتم هم‌نام، حتی آرشیوی، تغییر نمی‌کند. قیمت را به تومان بنویسید؛ برای قیمت روز خالی بگذارید.</p>
    <a className={styles.template} download="kucafe-menu-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent('\uFEFF' + MENU_CSV_TEMPLATE)}`}>دانلود فایل نمونه CSV</a>
    {!sections.length ? <p>ابتدا یک دسته در منوی همین شعبه بسازید.</p> : <ManagedForm action={submit} className={styles.form}>
      <input type="hidden" name="placeId" value={placeId} />
      <input type="hidden" name="revision" value={revision} />
      <label>دستهٔ مقصد<select required name="sectionId" value={section} onChange={event => { setSection(event.target.value); clearPreview() }}><option value="">انتخاب دستهٔ همین شعبه</option>{sections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>جداکنندهٔ ستون‌ها<select name="delimiter" value={delimiter} onChange={event => { setDelimiter(event.target.value); clearPreview() }}><option value=",">ویرگول — CSV</option><option value=";">نقطه‌ویرگول — CSV</option><option value={'\t'}>Tab — کپی از Excel</option></select></label>
      <label>فایل متنی CSV یا TSV (اختیاری)<input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values,text/plain" aria-invalid={!!fileError} aria-describedby="menu-import-format menu-import-file-error" onChange={async event => {
        const file = event.target.files?.[0]
        const sequence = ++readSequence.current
        clearPreview(); setFileError(''); setReadingFile(false)
        if (!file) return
        if (file.size > MAX_MENU_IMPORT_BYTES) { setFileError('فایل حداکثر ۶۴ کیلوبایت باشد.'); return }
        setReadingFile(true)
        try { const value = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); if (sequence === readSequence.current) setText(value) }
        catch { if (sequence === readSequence.current) setFileError('فایل UTF-8 خوانده نشد؛ متن قبلی حفظ شده است. فایل را اصلاح کنید یا متن را دستی وارد کنید.') }
        finally { if (sequence === readSequence.current) setReadingFile(false) }
      }} /></label>
      <p id="menu-import-file-error" role={fileError ? 'alert' : undefined}>{fileError}</p>
      <label>متن منو<textarea required name="text" value={text} maxLength={MAX_MENU_IMPORT_BYTES} rows={5} dir="auto" aria-describedby="menu-import-format" onChange={event => { ++readSequence.current; setReadingFile(false); setText(event.target.value); clearPreview(); setFileError('') }} /></label>
      <p id="menu-import-format" className={styles.help}>فایل UTF-8 با حداکثر ۱۰۰ ردیف و ۶۴ کیلوبایت؛ سه ستون name، price، description به همین ترتیب. فایل XLSX را ابتدا به CSV تبدیل کنید یا سه ستون را با ردیف عنوان از Excel کپی کنید. عکس و سایزها در این مرحله وارد نمی‌شوند.</p>
      <button type="submit" name="operation" value="preview" disabled={readingFile || !!fileError}>{readingFile ? 'در حال خواندن فایل…' : 'نمایش پیش‌نمایش؛ بدون ثبت'}</button>
      {preview && <section aria-labelledby="menu-import-preview-title" className={styles.preview}>
        <h3 id="menu-import-preview-title">پیش‌نمایش برای «{preview.sectionName}»</h3>
        <p role="status">{fa(preview.rows.length)} ردیف بررسی شد؛ هنوز چیزی ثبت نشده است. حداکثر {fa(MAX_MENU_IMPORT_APPLY)} آیتم جدید را انتخاب کنید.</p>
        <ol className={styles.rows}>{preview.rows.map(row => <li key={row.index}>
          <label><input type="checkbox" checked={selected.includes(row.index)} disabled={!!row.error || row.duplicate || (!selected.includes(row.index) && selected.length >= MAX_MENU_IMPORT_APPLY)} onChange={event => { setSelected(current => event.target.checked ? [...current, row.index] : current.filter(index => index !== row.index)); setConfirmed(false) }} />
            <span><strong>{row.name || 'بدون نام'}</strong><small>{row.error ? row.error : row.duplicate ? 'هم‌نام از قبل وجود دارد؛ تغییری نمی‌کند' : row.price === null ? 'قیمت روز — آیتم جدید' : `${toman(row.price)} — آیتم جدید`}</small>{row.description && <small className={styles.description}>{row.description}</small>}</span>
          </label>
        </li>)}</ol>
        <input type="hidden" name="token" value={preview.token} />
        <input type="hidden" name="selected" value={JSON.stringify(selected)} />
        <label className={styles.confirm}><input type="checkbox" name="confirmed" value="yes" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />افزودن {fa(selected.length)} آیتم انتخاب‌شده به این دسته را تأیید می‌کنم؛ پس از ثبت در منوی فعلی دیده می‌شوند.</label>
        <button type="submit" name="operation" value="apply" disabled={!selected.length || !confirmed}>ثبت فقط آیتم‌های انتخاب‌شده</button>
        <p className={styles.help}>پیش‌نمایش ۱۰ دقیقه معتبر است. تغییر متن، دسته یا منوی شعبه به پیش‌نمایش تازه نیاز دارد. دکمهٔ ثبت پس از انتخاب آیتم و تأیید فعال می‌شود.</p>
      </section>}
    </ManagedForm>}
  </details>
}
