'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RequestCodeState } from '@/app/auth/state'
import type { OtpPurpose } from '@/core/auth/userRepo'
import { useInterval } from './useInterval'

export function useOtpChallenge(purpose: OtpPurpose, request: RequestCodeState, verification?: RequestCodeState) {
  const [challenge, setChallenge] = useState<RequestCodeState | null>(null)
  const [serverTime, setServerTime] = useState(0)
  const anchor = useRef({ server: 0, monotonic: 0 })
  const generation = useRef(0)
  const apply = useCallback((data: RequestCodeState) => {
    if (!data.ok || !data.phone || !Number.isFinite(data.serverNow) || !Number.isFinite(data.expiresAt) || !Number.isFinite(data.resendAt)) return
    anchor.current = { server: data.serverNow!, monotonic: performance.now() }
    setServerTime(data.serverNow!)
    setChallenge(data)
  }, [])
  const synchronize = useCallback(async (signal?: AbortSignal) => {
    const version = generation.current
    try {
      const response = await fetch(`/api/auth/otp?purpose=${purpose}`, { cache: 'no-store', credentials: 'same-origin', signal })
      if (!response.ok) return
      const data = await response.json() as RequestCodeState
      if (!signal?.aborted && generation.current === version) apply(data)
    } catch { /* Manual entry stays available while status synchronization is offline. */ }
  }, [apply, purpose])
  useEffect(() => {
    if (request.ok && request.phone) { generation.current++; apply(request) }
    else if (request.retryAfterSec) {
      const now = anchor.current.server + performance.now() - anchor.current.monotonic
      setChallenge(previous => previous ? { ...previous, resendAt: now + request.retryAfterSec! * 1000 } : previous)
    }
  }, [request, apply])
  useEffect(() => {
    if (verification?.ok && verification.verified) { generation.current++; apply(verification) }
  }, [verification, apply])
  useEffect(() => {
    const controller = new AbortController()
    void synchronize(controller.signal)
    const visible = () => { if (document.visibilityState === 'visible') void synchronize(controller.signal) }
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('focus', visible)
    return () => { controller.abort(); document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', visible) }
  }, [synchronize])
  const tick = () => setServerTime(anchor.current.server + performance.now() - anchor.current.monotonic)
  const codeRemaining = challenge ? Math.max(0, Math.ceil((challenge.expiresAt! - serverTime) / 1000)) : 0
  const resendRemaining = challenge ? Math.max(0, Math.ceil((challenge.resendAt! - serverTime) / 1000)) : 0
  useInterval(tick, challenge && (codeRemaining > 0 || resendRemaining > 0) ? 250 : null)
  const reset = async () => {
    const version = ++generation.current
    // Finish clearing the old cookie before showing a new request form. An
    // in-flight DELETE response must not erase a newly issued challenge cookie.
    await fetch(`/api/auth/otp?purpose=${purpose}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => {})
    if (generation.current === version) setChallenge(null)
  }
  return { challenge, codeRemaining, resendRemaining, expired: Boolean(challenge && codeRemaining === 0), reset }
}
