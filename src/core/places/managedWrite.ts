import 'server-only'
import { withDbTransaction } from '@/db/client'

class RejectedWrite<S> extends Error {
  constructor(readonly state: S) { super('Managed write rejected') }
}

/** An error result must rollback too, not just a thrown SQL exception. */
export async function runManagedWrite<S extends { ok: boolean; error?: string }>(work: () => Promise<S>): Promise<S> {
  try {
    return await withDbTransaction(async () => {
      const result = await work()
      if (!result.ok) throw new RejectedWrite(result)
      return result
    })
  } catch (error) {
    if (error instanceof RejectedWrite) return error.state as S
    return { ok: false, error: 'ذخیره انجام نشد و تغییرات دیتابیس بازگردانده شد. اطلاعات فرم حفظ شده است؛ وضعیت را بررسی و دوباره تلاش کنید.' } as S
  }
}
