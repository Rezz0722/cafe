'use client'
import {useState} from 'react'
import {formatVisitDate,parseVisitDate} from '@/core/date/persian'
export function PersianExpiryField({required=false,defaultValue}:{required?:boolean;defaultValue?:string|null}){
 const date=defaultValue?new Date(defaultValue):null
 const [day,setDay]=useState(date?formatVisitDate(date,'Asia/Tehran'):''),[time,setTime]=useState(date?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tehran',hour:'2-digit',minute:'2-digit',hour12:false}).format(date):'23:59')
 const iso=parseVisitDate(day)
 return <label>پایان به وقت ایران{!required?' (اختیاری)':''}<input name="expiresAt" type="hidden" value={iso?`${iso}T${time}`:''}/><input aria-label="تاریخ پایان شمسی" value={day} required={required} placeholder="۱۴۰۵/۰۷/۰۱" inputMode="numeric" dir="ltr" onChange={event=>{setDay(event.target.value);event.target.setCustomValidity(event.target.value&&!parseVisitDate(event.target.value)?'تاریخ شمسی معتبر مثل ۱۴۰۵/۰۷/۰۱ وارد کنید.':'')}}/><input aria-label="ساعت پایان" value={time} onChange={event=>setTime(event.target.value)} type="time" required={required||!!day} dir="ltr"/></label>
}
