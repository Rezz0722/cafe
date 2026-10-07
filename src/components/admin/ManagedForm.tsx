'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormHTMLAttributes, type SubmitEvent as ReactSubmitEvent, type ReactNode, type MouseEvent } from 'react'
import { useFormStatus } from 'react-dom'

type Result = { ok: boolean; error?: string; message?: string; preserveDraft?: boolean }
type Action = (form: FormData) => Promise<Result>
const PendingContext = createContext(false)
const discardListeners = new Set<(discarded: ReadonlySet<HTMLFormElement>) => void>()

/** Await the actual action, not a React dispatch; failed submissions never reset inputs. */
export function useManagedActionState<S extends Result>(serverAction: (previous: S, data: FormData) => Promise<S>, initial: S): [S, (data: FormData) => Promise<S>, boolean] {
  const [state, setState] = useState(initial)
  const [pending, setPending] = useState(false)
  const previous = useRef(initial)
  const inFlight = useRef<Promise<S> | null>(null)
  const action = useCallback((data: FormData): Promise<S> => {
    if (inFlight.current) return Promise.resolve({ ...initial, ok: false, error: 'عملیات قبلی هنوز تمام نشده است؛ کمی صبر کنید.' } as S)
    setPending(true)
    const task = (async () => {
      try {
        const next = await serverAction(previous.current, data)
        previous.current = next; setState(next)
        return next
      } catch {
        const next = { ...initial, ok: false, error: 'پاسخ سرور نرسید. اطلاعات فرم حفظ شده است؛ پیش از تلاش دوباره وضعیت را بررسی کنید.' } as S
        previous.current = next; setState(next)
        return next
      } finally { inFlight.current = null; setPending(false) }
    })()
    inFlight.current = task
    return task
  }, [serverAction, initial])
  return [state, action, pending]
}

export function useManagedFormStatus() {
  const native = useFormStatus()
  const managed = useContext(PendingContext)
  return { ...native, pending: native.pending || managed }
}

type Props = Omit<FormHTMLAttributes<HTMLFormElement>, 'action'> & {
  action: Action
  actions?: Record<string, Action>
  children: ReactNode
}

export function ManagedForm({ action, actions, children, onSubmit, ...props }: Props) {
  const [pending, setPending] = useState(false)
  const [feedback,setFeedback]=useState<Result|null>(null)
  const locked = useRef(false)
  const submit = async (event: ReactSubmitEvent<HTMLFormElement>) => {
    onSubmit?.(event)
    if (event.defaultPrevented) return
    event.preventDefault()
    if (locked.current) return
    const form = event.currentTarget
    const button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const selected = button?.dataset.managedAction
    const handler = selected ? actions?.[selected] : action
    if (!handler) return
    const data = new FormData(form, button)
    locked.current = true; setPending(true)
    form.dispatchEvent(new CustomEvent('managed-form-pending',{bubbles:true,detail:{pending:true}}))
    try {
      const result = await handler(data)
      setFeedback(result)
      form.dispatchEvent(new CustomEvent('managed-form-result', { bubbles: true, detail: { ok: result.ok && !result.preserveDraft } }))
    } catch {
      setFeedback({ok:false,error:'پاسخ عملیات نرسید؛ اطلاعات فرم حفظ شده است. پیش از ارسال دوباره وضعیت را بررسی کنید.'})
      form.dispatchEvent(new CustomEvent('managed-form-result',{bubbles:true,detail:{ok:false}}))
    } finally { locked.current = false; setPending(false);form.dispatchEvent(new CustomEvent('managed-form-pending',{bubbles:true,detail:{pending:false}})) }
  }
  return <form {...props} onSubmit={submit} aria-busy={pending}>
    <PendingContext.Provider value={pending}>
      <fieldset disabled={pending} style={{ display: 'contents', border: 0, padding: 0, margin: 0 }}>{children}</fieldset>
      {feedback&&(feedback.error||feedback.message)&&<p role={feedback.ok?'status':'alert'} style={{gridColumn:'1 / -1',flexBasis:'100%',margin:'8px 0',fontSize:14,lineHeight:1.8,color:feedback.ok?'#087443':'#b42318'}}>{feedback.error||feedback.message}</p>}
    </PendingContext.Provider>
  </form>
}

/** Track each form separately: saving one form must not clear another form's draft. */
export function useUnsavedForms() {
  const root = useRef<HTMLDivElement>(null)
  const forms = useRef(new Set<HTMLFormElement>())
  const busy=useRef(new Set<HTMLFormElement>())
  const [dirty, setDirty] = useState(false)
  const refresh = useCallback(() => {
    for (const form of forms.current) if (!form.isConnected) forms.current.delete(form)
    for(const form of busy.current)if(!form.isConnected)busy.current.delete(form)
    setDirty(forms.current.size > 0 || busy.current.size>0)
  }, [])
  const mark = useCallback((event: { target: EventTarget | null }) => {
    const field = event.target as HTMLElement | null
    const form = field?.closest('form')
    if (form && form.getAttribute('method') !== 'get' && !field?.closest('[data-ignore-dirty="true"]')) { forms.current.add(form); setDirty(true) }
  }, [])
  const confirmDiscard = useCallback(() => {
    if(busy.current.size){window.alert('عملیات در حال ذخیره است؛ تا دریافت نتیجه از این بخش خارج نشوید.');return false}
    if (!forms.current.size) return true
    if (!window.confirm('تغییرات ذخیره نشده‌اند. بدون ذخیره از این بخش خارج می‌شوید؟')) return false
    const discarded=new Set(forms.current)
    for (const discard of discardListeners) discard(discarded)
    return true
  }, [])
  useEffect(() => {
    const element = root.current
    if (!element) return
    const discard = (discarded: ReadonlySet<HTMLFormElement>) => { for(const form of discarded)forms.current.delete(form); refresh() }
    discardListeners.add(discard)
    const saved = (event: Event) => {
      const form = event.target as HTMLFormElement
      if ((event as CustomEvent<{ ok: boolean }>).detail.ok) forms.current.delete(form)
      else forms.current.add(form)
      refresh()
    }
    const observer = new MutationObserver(refresh)
    observer.observe(element, { childList: true, subtree: true })
    element.addEventListener('managed-form-result', saved)
    const pending=(event:Event)=>{const form=event.target as HTMLFormElement;if((event as CustomEvent).detail.pending)busy.current.add(form);else busy.current.delete(form);refresh()}
    element.addEventListener('managed-form-pending',pending)
    return () => { discardListeners.delete(discard); observer.disconnect(); element.removeEventListener('managed-form-result', saved);element.removeEventListener('managed-form-pending',pending) }
  }, [refresh])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const guardLink = useCallback((event: MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented) return
    const anchor = (event.target as HTMLElement).closest('a')
    if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download') || anchor.getAttribute('href')?.startsWith('#')) return
    if ((forms.current.size||busy.current.size) && !confirmDiscard()) { event.preventDefault(); event.stopPropagation() }
  }, [confirmDiscard])
  useEffect(() => {
    const warn = (event: globalThis.MouseEvent) => guardLink(event as unknown as MouseEvent<HTMLElement>)
    document.addEventListener('click', warn, true)
    return () => document.removeEventListener('click', warn, true)
  }, [guardLink])
  return { root, dirty, mark, confirmDiscard, guardLink }
}
