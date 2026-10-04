import type { LeadErrors } from './policy'
export interface LeadActionState { ok?: boolean; error?: string; message?: string; trackingCode?: string; errors?: LeadErrors }
