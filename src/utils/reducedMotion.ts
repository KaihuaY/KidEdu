import { useEffect, useState } from 'react'

/** True when the OS asks for reduced motion; tracks live changes. False when matchMedia is unavailable. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    try {
      return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      const handler = () => setReduced(mq.matches)
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    } catch {
      return undefined
    }
  }, [])

  return reduced
}
