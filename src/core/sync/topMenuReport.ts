import type {TopMenuSyncReport} from './topMenuSync'
import type {TopMenuTarget} from './topMenuSelection'

/** Selection is by café identity, never by menu-item source ID or fuzzy name. */
export function selectTopMenuReport(report:TopMenuSyncReport,targets:TopMenuTarget[],sourceIds:number[]){
  const ids=new Set(sourceIds),selected=targets.filter(target=>ids.has(target.sourceId))
  if(selected.length!==ids.size)throw new Error('کافه‌ای خارج از گزارش انتخاب شده است.')
  const places=new Set(selected.flatMap(target=>target.placeId?[target.placeId]:[]))
  const names=new Map<string,Set<number>>()
  for(const target of targets){
    for(const name of [target.name,...report.cafes.filter(cafe=>cafe.placeId===target.placeId).map(cafe=>cafe.name)]){
      const owners=names.get(name)??new Set<number>();owners.add(target.sourceId);names.set(name,owners)
    }
  }
  const belongs=(row:{sourceCafeId?:number;placeName:string})=>{
    if(row.sourceCafeId)return ids.has(row.sourceCafeId)
    const owners=names.get(row.placeName)
    return !!owners&&owners.size===1&&ids.has([...owners][0])
  }
  const cafes=report.cafes.filter(cafe=>places.has(cafe.placeId)),newCafes=report.newCafes.filter(cafe=>ids.has(cafe.sourceId))
  const sum=(key:'priceIncreases'|'priceDecreases'|'availabilityChanges'|'newItems'|'movedItems'|'archivedItems')=>cafes.reduce((total,cafe)=>total+(cafe[key]??0),0)
  const rows={cafes,newCafes,changes:report.changes.filter(change=>places.has(change.placeId)),newItems:report.newItems.filter(belongs),conflicts:(report.conflicts??[]).filter(belongs)}
  const limitations:string[]=[]
  if(report.reportVersion!==2)limitations.push('گزارش قدیمی است؛ جزئیات ذخیره‌شده ممکن است سقف ۱۰۰۰ مورد داشته باشند. آمار افزایشی کافه‌ها حفظ شده است، اما جزئیات حذف‌شده قابل بازیابی نیستند.')
  if([...report.newItems,...(report.conflicts??[])].some(row=>!row.sourceCafeId&&(names.get(row.placeName)?.size??0)>1))limitations.push('جزئیات قدیمی با نام کافهٔ مبهم عمداً وارد گزارش انتخابی نشده‌اند.')
  return {scope:'selected-cafes',sourceIds:[...ids],summary:{sourceCafes:selected.length,priceIncreases:sum('priceIncreases'),priceDecreases:sum('priceDecreases'),availabilityChanges:sum('availabilityChanges'),newItems:sum('newItems')+newCafes.reduce((total,cafe)=>total+cafe.items,0),newCafes:newCafes.length,movedItems:sum('movedItems'),archivedItems:sum('archivedItems')},limitations,report:rows}
}
