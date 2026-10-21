/**
 * Touch vs mouse, decided per gesture.
 *
 * Folders and assets follow the desktop file-browser model with a mouse: click
 * selects, double-click opens. A finger has no double-click (iOS turns the
 * second tap into a zoom), so on touch a single tap opens and selection moves to
 * the visible checkbox, a long-press, or a Select mode.
 *
 * "Touch" is read from the gesture itself, not from the device: an iPad with a
 * trackpad clicks like a laptop, and a touchscreen laptop taps like a phone.
 * Order of evidence:
 *   1. the pointerdown that started this gesture (recorded document-wide, kept
 *      for RECENT_MS). This must come first: WebKit (iOS Safari) delivers the
 *      click that follows a finger tap with pointerType "mouse", while the
 *      pointerdown before it correctly says "touch". Trusting the click alone
 *      made a tap on an iPhone select instead of open.
 *   2. the click's own pointerType (Chrome reports "touch" here),
 *   3. the primary-pointer media query.
 */

export const COARSE_POINTER_QUERY = '(pointer: coarse)'

/** A click lands within a few hundred ms of its pointerdown, longer after a long-press. */
const RECENT_MS = 1500

let lastPointerType: string | null = null
let lastPointerAt = 0
let listening = false

function listen() {
  if (listening || typeof document === 'undefined') return
  listening = true
  // Capture phase: recorded before any component handler can stop propagation.
  document.addEventListener(
    'pointerdown',
    (e) => {
      lastPointerType = (e as PointerEvent).pointerType || null
      lastPointerAt = Date.now()
    },
    { capture: true, passive: true },
  )
}
listen()

/** Whether the primary pointer on this device is a finger. */
export function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia(COARSE_POINTER_QUERY).matches
}

function isTouchType(t: string | null | undefined): boolean {
  return t === 'touch' || t === 'pen'
}

/** True when this click/tap came from a finger (or stylus) rather than a mouse or trackpad. */
export function isTouchGesture(e?: { nativeEvent?: Event } | Event | null): boolean {
  if (lastPointerType && Date.now() - lastPointerAt < RECENT_MS) return isTouchType(lastPointerType)
  const native = (e && 'nativeEvent' in e ? e.nativeEvent : e) as (Event & { pointerType?: string }) | null | undefined
  const own = native?.pointerType
  if (own) return isTouchType(own)
  return isCoarsePointer()
}

/** Test hook: forget the last pointer seen. */
export function resetPointerMemory() {
  lastPointerType = null
  lastPointerAt = 0
}
