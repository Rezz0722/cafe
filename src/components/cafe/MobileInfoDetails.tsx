'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/** SSR stays expanded and readable without JavaScript; mobile enhancement folds it. */
export function MobileInfoDetails({
  id,
  className,
  title,
  children,
}: {
  id?: string
  className: string
  title: string
  children: ReactNode
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    if (window.matchMedia('(max-width: 760px)').matches) {
      detailsRef.current?.removeAttribute('open')
    }
  }, [])

  return (
    <details ref={detailsRef} id={id} className={className} data-cafe-screen="info" open>
      <summary>{title}</summary>
      <div>{children}</div>
    </details>
  )
}
