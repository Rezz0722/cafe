/** Never return SQL queries, parameters, nested causes or driver errors to a browser. */
export function publicActionError(error:unknown,fallback:string){
 return error instanceof Error && Object.getPrototypeOf(error)===Error.prototype && !('cause' in error) && !('code' in error) && !('sql' in error) ? error.message.slice(0,500) : fallback
}
