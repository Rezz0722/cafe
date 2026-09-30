'use client'
import { useActionState } from 'react'
import { BadgePercent } from 'lucide-react'
import { toggleClubMembershipAction } from '@/app/profile/actions'
import { EMPTY_ACTION_STATE } from '@/app/profile/state'
import styles from './ClubJoinButton.module.css'

export function ClubJoinButton({placeId,slug,joined,signedIn,authHref}:{placeId:number;slug:string;joined:boolean;signedIn:boolean;authHref:string}){
  const [state,action,pending]=useActionState(toggleClubMembershipAction,EMPTY_ACTION_STATE)
  if(!signedIn)return <a className={styles.button} href={authHref}><BadgePercent size={18}/> عضویت در باشگاه</a>
  return <form action={action} className={styles.wrap}>
    <input type="hidden" name="placeId" value={placeId}/><input type="hidden" name="slug" value={slug}/><input type="hidden" name="active" value={joined?'0':'1'}/>
    <button className={joined?styles.joined:styles.button} disabled={pending}><BadgePercent size={18}/>{pending?'در حال ثبت…':joined?'عضو باشگاه هستی':'عضویت در باشگاه'}</button>
    {state.error&&<small role="alert">{state.error}</small>}
  </form>
}
