export const SPEED_MIN = 1
export const SPEED_MAX = 10
export const SPEED_DEFAULT = 4
export const FONT_SIZES = { S: 24, M: 32, L: 40, XL: 52 } as const

export function speedToPxPerSec(speed: number, fontPx: number): number {
  const bounded = Math.min(SPEED_MAX, Math.max(SPEED_MIN, Number.isNaN(speed) ? SPEED_DEFAULT : speed))
  // 1.4 is the rendered line height; scaling by it preserves lines per second
  // across font sizes. The slider covers 0.25 through 2.05 lines per second.
  return fontPx * 1.4 * (0.25 + (bounded - 1) * 0.2)
}

export interface ScrollState {
  offset: number
  playing: boolean
  lastTs: number | null
}

const timing = Symbol('scrollTiming')
interface TimedScrollState extends ScrollState {
  [timing]?: { pxPerSec: number; maxOffset: number }
}

function clamp(offset: number, maxOffset: number): number {
  return Math.min(Math.max(0, maxOffset), Math.max(0, offset))
}

export function initialScroll(): ScrollState {
  return { offset: 0, playing: false, lastTs: null }
}

export function play(s: ScrollState, now: number): ScrollState {
  return s.playing ? s : { ...s, playing: true, lastTs: now }
}

export function pause(s: ScrollState, now: number): ScrollState {
  if (!s.playing) return s
  // pause has no rate/bounds arguments. Carry the last tick's values on the
  // state, keeping the functions pure and independent for multiple overlays.
  const previous = (s as TimedScrollState)[timing]
  const advanced = previous ? tick(s, now, previous.pxPerSec, previous.maxOffset) : s
  return { ...advanced, playing: false, lastTs: null }
}

export function toggle(s: ScrollState, now: number): ScrollState {
  return s.playing ? pause(s, now) : play(s, now)
}

export function tick(s: ScrollState, now: number, pxPerSec: number, maxOffset: number): ScrollState {
  if (!s.playing) return s
  const dt = Math.min(250, Math.max(0, now - (s.lastTs ?? now)))
  const next: TimedScrollState = {
    ...s,
    offset: clamp(s.offset + dt / 1000 * pxPerSec, maxOffset),
    lastTs: now,
    [timing]: { pxPerSec, maxOffset },
  }
  return next
}

export function scrubTo(s: ScrollState, offset: number, maxOffset: number, now: number): ScrollState {
  const previous = (s as TimedScrollState)[timing]
  const next: TimedScrollState = {
    ...s,
    offset: clamp(offset, maxOffset),
    lastTs: s.playing ? now : s.lastTs,
    ...(previous ? { [timing]: { ...previous, maxOffset } } : {}),
  }
  return next
}

export function activeLineIndex(offset: number, lineTops: number[], focusPx: number): number {
  let active = 0
  lineTops.forEach((top, index) => {
    if (top <= offset + focusPx) active = index
  })
  return active
}

export function splitLines(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}
