'use client'

import { useEffect } from 'react'

export function useLeaveGuard(active: boolean, message: string): void {
  useEffect(() => {
    if (!active) return
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target instanceof Element ? event.target : (event.target as Node | null)?.parentElement
      const anchor = target?.closest('a[href]')
      if (!anchor) return
      const targetName = anchor.getAttribute('target') ?? ''
      if ((targetName !== '' && targetName !== '_self') || anchor.hasAttribute('download')) return
      let url: URL
      try { url = new URL(anchor.getAttribute('href') ?? '', window.location.href) } catch { return }
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      if (!window.confirm(message)) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
      }
    }
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('click', onClick, true)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [active, message])
}
