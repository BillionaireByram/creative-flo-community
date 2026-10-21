'use client'

import * as React from 'react'
import { isCoarsePointer, COARSE_POINTER_QUERY } from '@/lib/touch'
import { useMediaQuery } from '@/hooks/use-media-query'

const LONG_PRESS_MS = 450
const MOVE_TOLERANCE_PX = 10

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  onContextMenu: (e: React.MouseEvent) => void
  /** Wrap the element's onClick: the click that ends a long-press is swallowed. */
  onClickCapture: (e: React.MouseEvent) => void
}

/**
 * Long-press with a finger (touch or pen only; a mouse right-click is left alone).
 * Fires once after LONG_PRESS_MS if the finger stays put, and swallows the click
 * the browser sends when the finger lifts, so a long-press that selects a card
 * does not also open it. A scroll (finger moving) cancels it.
 */
export function useLongPress(onLongPress: (() => void) | undefined): LongPressHandlers {
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = React.useRef<{ x: number; y: number } | null>(null)
  const fired = React.useRef(false)
  const cb = React.useRef(onLongPress)
  cb.current = onLongPress

  const clear = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    start.current = null
  }, [])

  React.useEffect(() => clear, [clear])

  return React.useMemo<LongPressHandlers>(() => ({
    onPointerDown: (e) => {
      fired.current = false
      if (!cb.current || (e.pointerType !== 'touch' && e.pointerType !== 'pen')) return
      start.current = { x: e.clientX, y: e.clientY }
      timer.current = setTimeout(() => {
        timer.current = null
        fired.current = true
        try { navigator.vibrate?.(10) } catch { /* not supported */ }
        cb.current?.()
      }, LONG_PRESS_MS)
    },
    onPointerMove: (e) => {
      const s = start.current
      if (!s || !timer.current) return
      if (Math.abs(e.clientX - s.x) > MOVE_TOLERANCE_PX || Math.abs(e.clientY - s.y) > MOVE_TOLERANCE_PX) clear()
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onContextMenu: (e) => {
      // Android and iOS raise contextmenu on a long-press; ours already handled it.
      if (fired.current || (cb.current && isCoarsePointer())) e.preventDefault()
    },
    onClickCapture: (e) => {
      if (fired.current) {
        fired.current = false
        e.preventDefault()
        e.stopPropagation()
      }
    },
  }), [clear])
}

/** Reactive "primary pointer is a finger". False on the server and in tests unless a test says otherwise. */
export function useCoarsePointer(): boolean {
  return useMediaQuery(COARSE_POINTER_QUERY)
}
