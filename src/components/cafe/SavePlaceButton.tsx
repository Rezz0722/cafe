'use client'

/**
 * دکمه‌ی ذخیره‌ی کافه.
 *
 * ═══ چرا خوش‌بینانه (optimistic) ═══
 *
 * ذخیره‌کردن یک عمل بی‌خطر و برگشت‌پذیر است. منتظر ماندنِ کاربر برای پاسخ
 * سرور فقط حس کندی می‌دهد. `useOptimistic` بلافاصله وضعیت را عوض می‌کند و
 * اگر سرور خطا داد، به حالت قبل برمی‌گردد.
 */

import { useActionState, useEffect, useOptimistic, useTransition } from 'react'
import { toggleSaveAction } from '@/app/profile/actions'
import { EMPTY_ACTION_STATE } from '@/app/profile/state'
import styles from './SavePlaceButton.module.css'
import { Heart } from 'lucide-react'

interface Props {
  placeId: number
  slug: string
  initialSaved: boolean
  signedIn: boolean
  authHref: string
}

export function SavePlaceButton({ placeId, slug, initialSaved, signedIn, authHref }: Props) {
  const [state, action] = useActionState(toggleSaveAction, EMPTY_ACTION_STATE)
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useOptimistic(initialSaved)

  // اگر سرور خطا داد، وضعیت خوش‌بینانه باید برگردد.
  useEffect(() => {
    if (state.error) {
      // با رفرش، وضعیت واقعی از سرور می‌آید.
      console.warn('[save]', state.error)
    }
  }, [state.error])

  if (!signedIn) {
    return (
      <a href={authHref} className={styles.button}>
        <Heart size={16} aria-hidden="true" /> ذخیره
      </a>
    )
  }

  return (
    <form
      action={action}
      onSubmit={() => {
        startTransition(() => setSaved(!saved))
      }}
    >
      <input type="hidden" name="placeId" value={placeId} />
      <input type="hidden" name="slug" value={slug} />
      <button
        type="submit"
        className={saved ? styles.buttonOn : styles.button}
        disabled={pending}
        aria-pressed={saved}
      >
        <Heart size={16} aria-hidden="true" fill={saved ? 'currentColor' : 'none'} />
        {saved ? 'ذخیره شد' : 'ذخیره'}
      </button>
    </form>
  )
}

export default SavePlaceButton
