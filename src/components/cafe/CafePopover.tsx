'use client'
import {useEffect,useId,useRef,type ReactNode} from 'react'
import {X} from 'lucide-react'
import styles from './CafePopover.module.css'

export function CafePopover({label,title,children,comparison=false,onClose,variant='default'}:{label:string;title:string;children:ReactNode|((controls:{close:()=>void})=>ReactNode);comparison?:boolean;onClose?:()=>void;variant?:'default'|'primary'|'inverse'}){
 const ref=useRef<HTMLDialogElement>(null),button=useRef<HTMLButtonElement>(null),id=useId()
 const previousOverflow=useRef<string|null>(null)
 const historyClose=useRef(()=>ref.current?.close())
 const restore=()=>{window.removeEventListener('popstate',historyClose.current);if(previousOverflow.current!==null){document.body.style.overflow=previousOverflow.current;previousOverflow.current=null}button.current?.focus({preventScroll:true});onClose?.()}
 useEffect(()=>()=>{window.removeEventListener('popstate',historyClose.current);if(previousOverflow.current!==null)document.body.style.overflow=previousOverflow.current},[])
 const close=()=>{if(history.state?.kucafeDialog===id)history.back();else ref.current?.close()}
 const open=()=>{
  if(!ref.current||ref.current.open)return
  previousOverflow.current=document.body.style.overflow;document.body.style.overflow='hidden'
  window.addEventListener('popstate',historyClose.current);history.pushState({...history.state,kucafeDialog:id},'',location.href)
  ref.current.showModal();ref.current.scrollTop=0
 }
 return <>
  <button ref={button} type="button" className={`${styles.trigger} ${variant==='primary'?styles.triggerPrimary:variant==='inverse'?styles.triggerInverse:''}`} aria-haspopup="dialog" onClick={open}>{label}</button>
  <dialog ref={ref} className={`${styles.panel} ${comparison?styles.comparison:''}`} aria-label={title} onClose={restore} onCancel={e=>{e.preventDefault();close()}} onClick={e=>{if(e.target===e.currentTarget)close()}}>
   <header><h2>{title}</h2><button type="button" onClick={close} aria-label="بستن"><X size={22}/></button></header>
   <div className={styles.body}>{typeof children==='function'?children({close}):children}</div>
  </dialog>
 </>
}
export function MenuOpenButton(){return <button className={styles.menu} type="button" onClick={()=>{const launcher=document.querySelector<HTMLAnchorElement>('[data-menu-launcher]');if(launcher)launcher.click();else document.getElementById('menu')?.scrollIntoView({behavior:'smooth'})}}>دیدن منو</button>}
