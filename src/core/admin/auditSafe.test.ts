import test from 'node:test'
import assert from 'node:assert/strict'
import {safeAuditValue} from './auditSafe'
test('audit details redact credentials and personal contacts recursively',()=>{
 assert.deepEqual(safeAuditValue({passwordHash:'secret',phone:'private',before:{apiToken:'secret',name:'menu',price:120000}}),{before:{name:'menu',price:120000}})
 assert.equal((safeAuditValue(Array.from({length:40},(_,id)=>id)) as unknown[]).length,25)
})
