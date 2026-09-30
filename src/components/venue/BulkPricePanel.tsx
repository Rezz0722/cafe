'use client'

import { useState } from 'react'
import { bulkPriceAction, previewBulkPriceAction } from '@/app/admin/venue/actions'
import { EMPTY_VENUE_STATE } from '@/app/admin/venue/state'
import { ManagedForm, useManagedActionState } from '@/components/admin/ManagedForm'
import { fa, toman } from '@/lib/format'
import styles from './VenuePanel.module.css'

export function BulkPricePanel({placeId, revision, sections, selectedIds, readOnly}: {placeId:number; revision:string; sections:{id:number;name:string}[]; selectedIds:number[]; readOnly:boolean}) {
  const [state, apply, applying] = useManagedActionState(bulkPriceAction, EMPTY_VENUE_STATE)
  const [preview, inspect, inspecting] = useManagedActionState(previewBulkPriceAction, EMPTY_VENUE_STATE)
  const [inputKey, setInputKey] = useState('')
  const [previewKey, setPreviewKey] = useState('')
  const selectionKey = selectedIds.slice().sort((a,b)=>a-b).join(',')
  const key = `${revision}:${inputKey}:${selectionKey}`
  const ready = preview.ok && !!preview.preview && previewKey === key
  return <details className={styles.bulkPanel}>
    <summary><span><strong>تغییر گروهی قیمت‌ها</strong><small>انتخاب محدوده، پیش‌نمایش و بازگردانی امن</small></span></summary>
    <ManagedForm action={async form => {const result=await apply(form); if(result.ok) setPreviewKey(''); return result}} className={styles.bulkBox} onInput={() => {setInputKey(String(Date.now())); setPreviewKey('')}} onSubmit={event => {if(!ready || !window.confirm(`قیمت ${fa(preview.preview?.itemCount ?? 0)} آیتم با این پیش‌نمایش تغییر کند؟`)) event.preventDefault()}}>
      <input type="hidden" name="placeId" value={placeId}/><input type="hidden" name="revision" value={revision}/><input type="hidden" name="fingerprint" value={ready ? preview.preview!.fingerprint : ''}/><input type="hidden" name="itemIds" value={JSON.stringify(selectedIds)}/>
      <label>محدوده تغییر<select name="scope" className={styles.input} defaultValue="all" onChange={()=>{setInputKey(String(Date.now()));setPreviewKey('')}}><option value="all">همه آیتم‌های منوی فعال همین شعبه</option><option value="section">یک دسته</option><option value="items">آیتم‌های تیک‌خورده ({fa(selectedIds.length)})</option></select></label>
      <label>دسته (برای محدوده یک دسته)<select name="bulkSectionId" className={styles.input}>{sections.map(section=><option key={section.id} value={section.id}>{section.name}</option>)}</select></label>
      <label>درصد افزایش یا کاهش<input className={styles.input} name="percent" type="number" step="1" min={-90} max={200} required placeholder="مثلاً ۱۵ یا ۱۰-" dir="ltr"/></label>
      <p className={styles.hint}>قیمت‌های نامعلوم و رایگان تغییر نمی‌کنند؛ نتیجه به هزار تومان گرد می‌شود. منوی شعبه‌های دیگر در این عملیات نیست.</p>
      <div className={styles.bulkRow}><button className={styles.save} type="button" disabled={readOnly || inspecting || applying} onClick={async event=>{const form=event.currentTarget.form; if(!form?.reportValidity())return;const captured=key;const result=await inspect(new FormData(form));setPreviewKey(result.ok?captured:'')}}>{inspecting?'در حال محاسبه…':'پیش‌نمایش تغییرات'}</button><button className={styles.save} type="submit" disabled={readOnly || !ready || inspecting || applying}>{applying?'در حال اعمال…':'تأیید و اعمال قیمت‌ها'}</button></div>
      {ready && <div role="status"><strong>{fa(preview.preview!.itemCount)} آیتم · {fa(preview.preview!.variantCount)} قیمتِ سایز</strong><ul>{preview.preview!.changes.map((change,index)=><li key={index}>{change.name}{change.label?` — ${change.label}`:''}: {toman(change.oldPrice)} ← {toman(change.newPrice)}</li>)}</ul><small>نمونه حداکثر ۱۲ قیمت؛ بازگردانی در «تاریخچه» تا پیش از تغییر بعدی قیمت امکان‌پذیر است.</small></div>}
      {preview.error && <p role="alert" className={styles.error}>{preview.error}</p>}{(state.error||state.message)&&<p role={state.ok?'status':'alert'} className={state.ok?styles.success:styles.error}>{state.error||state.message}</p>}
    </ManagedForm>
  </details>
}
