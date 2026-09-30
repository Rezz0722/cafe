'use client'
import {useEffect,useId,useRef,useState,type ReactNode} from 'react'
import {X} from 'lucide-react'
import styles from './CafePopover.module.css'

export function CafePopover({label,title,children,scan=false,onClose,variant='default'}:{label:string;title:string;children:ReactNode|((controls:{close:()=>void})=>ReactNode);scan?:boolean;onClose?:()=>void;variant?:'default'|'primary'|'inverse'}){
 const ref=useRef<HTMLDialogElement>(null),button=useRef<HTMLButtonElement>(null),id=useId()
 const previousOverflow=useRef<string|null>(null)
 const [loading,setLoading]=useState(false)
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null)
 const clearTimer=()=>{if(timer.current)clearTimeout(timer.current);timer.current=null}
 const historyClose=useRef(()=>ref.current?.close())
 const restore=()=>{clearTimer();setLoading(false);window.removeEventListener('popstate',historyClose.current);if(previousOverflow.current!==null){document.body.style.overflow=previousOverflow.current;previousOverflow.current=null}button.current?.focus({preventScroll:true});onClose?.()}
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);window.removeEventListener('popstate',historyClose.current);if(previousOverflow.current!==null)document.body.style.overflow=previousOverflow.current},[])
 const close=()=>{clearTimer();if(history.state?.kucafeDialog===id)history.back();else ref.current?.close()}
 const open=()=>{
  if(!ref.current||ref.current.open)return
  clearTimer();previousOverflow.current=document.body.style.overflow;document.body.style.overflow='hidden'
  window.addEventListener('popstate',historyClose.current);history.pushState({...history.state,kucafeDialog:id},'',location.href)
  setLoading(scan);ref.current.showModal();ref.current.scrollTop=0
  if(scan)timer.current=setTimeout(()=>{setLoading(false);timer.current=null},window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:2400)
 }
 return <>
  <button ref={button} type="button" className={`${styles.trigger} ${variant==='primary'?styles.triggerPrimary:variant==='inverse'?styles.triggerInverse:''}`} aria-haspopup="dialog" onClick={open}>{label}</button>
  <dialog ref={ref} className={`${styles.panel} ${scan?styles.comparison:''}`} aria-label={title} onClose={restore} onCancel={e=>{e.preventDefault();close()}} onClick={e=>{if(e.target===e.currentTarget)close()}}>
   <header><h2>{title}</h2><button type="button" onClick={close} aria-label="بستن"><X size={22}/></button></header>
   {loading?<div className={styles.loading} role="status" aria-live="polite">
    <div className={styles.orb} aria-hidden="true"><i/><i/><i/><i/><span/></div>
    <strong>یک نگاه به قیمت‌ها…</strong><p>آماده‌سازی مقایسه از داده‌های ثبت‌شدهٔ منوها</p>
    <div className={styles.dots} aria-hidden="true"><i/><i/><i/></div>
   </div>:<div className={`${styles.body} ${scan?styles.reveal:''}`}>{typeof children==='function'?children({close}):children}</div>}
  </dialog>
 </>
}
export function MenuOpenButton(){return <button className={styles.menu} type="button" onClick={()=>{const launcher=document.querySelector<HTMLAnchorElement>('[data-menu-launcher]');if(launcher)launcher.click();else document.getElementById('menu')?.scrollIntoView({behavior:'smooth'})}}>دیدن منو</button>}
