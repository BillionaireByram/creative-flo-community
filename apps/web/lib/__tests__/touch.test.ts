import { afterEach, describe, expect, it, vi } from 'vitest'
import { isTouchGesture, resetPointerMemory } from '../touch'
import { setCoarsePointer } from '../../test/setup'

function pointerDown(pointerType: string) {
  const e = new Event('pointerdown', { bubbles: true }) as Event & { pointerType: string }
  Object.defineProperty(e, 'pointerType', { value: pointerType })
  document.body.dispatchEvent(e)
}

function click(pointerType?: string) {
  const e = new MouseEvent('click', { bubbles: true }) as MouseEvent & { pointerType?: string }
  if (pointerType) Object.defineProperty(e, 'pointerType', { value: pointerType })
  return e
}

describe('isTouchGesture', () => {
  afterEach(() => {
    resetPointerMemory()
    setCoarsePointer(false)
    vi.useRealTimers()
  })

  it('treats a WebKit (iOS Safari) tap as touch even though its click says pointerType "mouse"', () => {
    // Measured in Playwright WebKit: pointerdown:touch -> ... -> click:mouse.
    pointerDown('touch')
    expect(isTouchGesture(click('mouse'))).toBe(true)
  })

  it('treats a Chrome tap (click pointerType "touch") as touch', () => {
    pointerDown('touch')
    expect(isTouchGesture(click('touch'))).toBe(true)
  })

  it('treats a mouse or trackpad click as not touch, even on a coarse-pointer device (iPad + trackpad)', () => {
    setCoarsePointer(true)
    pointerDown('mouse')
    expect(isTouchGesture(click('mouse'))).toBe(false)
  })

  it('accepts a React synthetic event', () => {
    pointerDown('pen')
    expect(isTouchGesture({ nativeEvent: click('mouse') })).toBe(true)
  })

  it('ignores a stale pointerdown and falls back to the click, then the media query', () => {
    vi.useFakeTimers()
    pointerDown('touch')
    vi.advanceTimersByTime(5000)
    expect(isTouchGesture(click('mouse'))).toBe(false)
    expect(isTouchGesture(click())).toBe(false)
    setCoarsePointer(true)
    expect(isTouchGesture(click())).toBe(true)
  })
})
