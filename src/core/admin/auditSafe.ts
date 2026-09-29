const privateKeys=/password|hash|token|secret|cookie|authorization|phone|email|ipAddress|^ip$|username/i
export function safeAuditValue(value:unknown,depth=0):unknown {
 if(depth>6)return '…'
 if(typeof value==='string')return value.slice(0,1000)
 if(Array.isArray(value))return value.slice(0,25).map(item=>safeAuditValue(item,depth+1))
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!privateKeys.test(key)).slice(0,40).map(([key,item])=>[key,safeAuditValue(item,depth+1)]))
 return value
}
