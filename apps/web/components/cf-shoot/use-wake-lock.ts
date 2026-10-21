'use client'

import { useEffect } from 'react'

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)
      || typeof navigator.wakeLock?.request !== 'function') return

    let disposed = false
    let pending = false
    let sentinel: WakeLockSentinel | null = null

    async function acquire() {
      if (disposed || pending || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return
      pending = true
      try {
        const next = await navigator.wakeLock.request('screen')
        // A request may finish after the screen closes or goes into the background.
        if (disposed || document.visibilityState !== 'visible') {
          await next.release()
        } else {
          sentinel = next
        }
      } catch {
        // Recording still works when battery settings or the browser refuse a lock.
      } finally {
        pending = false
      }
    }

    const onVisibilityChange = () => { void acquire() }
    document.addEventListener('visibilitychange', onVisibilityChange)
    void acquire()
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (sentinel) void sentinel.release().catch(() => {})
    }
  }, [active])
}
