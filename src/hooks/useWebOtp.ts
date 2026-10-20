'use client'

import { useCallback, useEffect, useRef } from 'react'
import { toAsciiDigits } from '@/core/text/normalize'

export function useWebOtp(length: number, onCode: (code: string) => void) {
  const callback = useRef(onCode)
  callback.current = onCode
  const controller = useRef<AbortController | null>(null)
  const started = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stop = useCallback(() => {
    controller.current?.abort(); controller.current = null
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])
  const start = useCallback(() => {
    stop()
    started.current = true
    if (!window.isSecureContext || !('OTPCredential' in window) || !navigator.credentials?.get) return
    const active = new AbortController()
    controller.current = active
    timer.current = setTimeout(stop, 120_000)
    let pending: Promise<Credential | null>
    try {
      pending = navigator.credentials.get({ otp: { transport: ['sms'] }, signal: active.signal } as CredentialRequestOptions & { otp: { transport: ['sms'] } })
    } catch { stop(); return }
    void pending
      .then(value => {
        if (active.signal.aborted || controller.current !== active) return
        const code = toAsciiDigits((value as Credential & { code?: string } | null)?.code ?? '').replace(/\D/g, '').slice(0, length)
        if (code.length === length) callback.current(code)
      }).catch(() => {}).finally(() => { if (controller.current === active) stop() })
  }, [length, stop])
  const restore = useCallback(() => { if (!started.current) start() }, [start])
  useEffect(() => stop, [stop])
  return { start, stop, restore }
}
