import {describe,it} from 'node:test'
import assert from 'node:assert/strict'
import {selectTopMenuReport} from './topMenuReport'
import type {TopMenuSyncReport} from './topMenuSync'
const targets=[{sourceId:10,placeId:1,name:'کافه',username:'a'},{sourceId:20,placeId:2,name:'کافه',username:'b'},{sourceId:30,placeId:null,name:'جدید',username:'c'}]
const report={reportVersion:2,cafes:[{placeId:1,name:'کافه',priceIncreases:5,priceDecreases:1,availabilityChanges:2,newItems:3,movedItems:1,archivedItems:0}],newCafes:[{sourceId:30,name:'جدید',items:4,sections:1}],changes:[{placeId:1,itemId:100},{placeId:2,itemId:200}],newItems:[{sourceId:20,sourceCafeId:10,placeName:'کافه'},{sourceId:10,sourceCafeId:20,placeName:'کافه'},{sourceId:30,placeName:'کافه'}],conflicts:[]} as unknown as TopMenuSyncReport
describe('Selected scrape reporting',()=>{
 it('uses cafe IDs rather than matching food IDs or ambiguous names',()=>{const result=selectTopMenuReport(report,targets,[10]);assert.equal(result.report.newItems.length,1);assert.equal(result.report.newItems[0].sourceCafeId,10);assert.equal(result.report.changes.length,1);assert.equal(result.summary.priceIncreases,5);assert.equal(result.summary.newItems,3);assert.equal(result.limitations.length,1)})
 it('includes the entire new cafe item count and rejects foreign selection',()=>{assert.equal(selectTopMenuReport(report,targets,[30]).summary.newItems,4);assert.throws(()=>selectTopMenuReport(report,targets,[99]))})
 it('declares legacy missing details rather than inventing complete reports',()=>assert.match(selectTopMenuReport({...report,reportVersion:undefined},targets,[10]).limitations[0],/قدیمی/))
})
