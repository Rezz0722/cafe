'use client'

import { useEffect } from 'react'

export function AuthCompletion({ destination }: { destination: string }) {
  useEffect(() => { window.location.replace(destination) }, [destination])
  return <p role="status">ورود انجام شد. <a href={destination}>ادامه</a></p>
}
