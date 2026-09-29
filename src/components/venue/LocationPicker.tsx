'use client'
import {useEffect,useRef,useState} from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import {useTheme} from '@/components/theme/ThemeProvider'
export function LocationPicker({lat,lng,onSelect,readOnly}:{lat:string;lng:string;onSelect:(lat:number,lng:number)=>void;readOnly:boolean}){
 const {resolvedTheme}=useTheme()
 const root=useRef<HTMLDivElement>(null),callback=useRef(onSelect);callback.current=onSelect
 const [error,setError]=useState(''),[version,setVersion]=useState(0),[ready,setReady]=useState(false)
 useEffect(()=>{
  const abort=new AbortController();let map:import('maplibre-gl').Map|undefined,marker:import('maplibre-gl').Marker|undefined
  const timer=setTimeout(()=>{if(!abort.signal.aborted){setError('نقشه در دسترس نیست؛ مختصات را دستی وارد کنید یا دوباره تلاش کنید.');map?.remove();map=undefined}},20000)
  setReady(false);setError('')
  void(async()=>{try{const lib=await import('maplibre-gl');lib.setWorkerUrl('/maplibre/v6.9.0/maplibre-gl-worker.mjs');const response=await fetch(`/api/map/style?theme=${resolvedTheme}`,{signal:abort.signal});if(!response.ok)throw new Error();const style=await response.json();if(abort.signal.aborted||!root.current)return;const valid=lat!==''&&lng!==''&&Number.isFinite(Number(lat))&&Number.isFinite(Number(lng))&&Math.abs(Number(lat))<=90&&Math.abs(Number(lng))<=180
   map=new lib.Map({container:root.current,style,center:valid?[Number(lng),Number(lat)]:[59.6067,36.2972],zoom:valid?15:12,cooperativeGestures:true});map.addControl(new lib.NavigationControl(),'top-left');if(valid)marker=new lib.Marker().setLngLat([Number(lng),Number(lat)]).addTo(map)
   map.on('load',()=>{clearTimeout(timer);if(!abort.signal.aborted)setReady(true)});map.on('error',()=>{if(!abort.signal.aborted)setError('بخشی از نقشه بارگذاری نشد؛ ورود دستی مختصات همچنان ممکن است.')});if(!readOnly)map.on('click',event=>{if(!map)return;marker?.remove();marker=new lib.Marker().setLngLat(event.lngLat).addTo(map);callback.current(Number(event.lngLat.lat.toFixed(7)),Number(event.lngLat.lng.toFixed(7)))})
  }catch{if(!abort.signal.aborted)setError('نقشه بارگذاری نشد؛ مختصات را دستی وارد کنید.');clearTimeout(timer)}})()
  return()=>{abort.abort();clearTimeout(timer);marker?.remove();map?.remove()}
 // Keep the picker stationary while typing. Reopen it to center on edited coordinates.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[version,readOnly,resolvedTheme])
 return <div style={{gridColumn:'1 / -1',minWidth:0}}><p>{readOnly?'موقعیت ثبت‌شده':'روی نقشه بزنید تا مختصات انتخاب شوند؛ سپس اطلاعات را ذخیره کنید.'}</p><div ref={root} style={{height:280,borderRadius:16,overflow:'hidden'}} aria-label="انتخاب موقعیت کافه"/>{!ready&&!error&&<p role="status">در حال بارگذاری نقشه…</p>}{error&&<p role="status">{error}</p>}<button type="button" onClick={()=>setVersion(value=>value+1)}>بازخوانی نقشه با مختصات فرم</button></div>
}
