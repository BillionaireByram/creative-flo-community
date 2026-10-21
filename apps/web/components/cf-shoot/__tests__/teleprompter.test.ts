import { describe, expect, it } from 'vitest'
import {
  FONT_SIZES, SPEED_DEFAULT, SPEED_MAX, SPEED_MIN, activeLineIndex, initialScroll,
  pause, play, scrubTo, speedToPxPerSec, splitLines, tick, toggle,
} from '../teleprompter'

describe('teleprompter speed', () => {
  it.each([[1, 14], [4, 47.6], [10, 114.8], [-5, 14], [25, 114.8]])(
    'maps speed %s to %s pixels per second at 40px', (speed, expected) => {
      expect(speedToPxPerSec(speed, 40)).toBeCloseTo(expected)
    },
  )

  it('keeps the same lines per second across text sizes', () => {
    expect(SPEED_MIN).toBe(1)
    expect(SPEED_MAX).toBe(10)
    expect(SPEED_DEFAULT).toBe(4)
    expect(FONT_SIZES).toEqual({ S: 24, M: 32, L: 40, XL: 52 })
    for (const fontPx of Object.values(FONT_SIZES)) {
      expect(speedToPxPerSec(4, fontPx) / (fontPx * 1.4)).toBeCloseTo(0.85)
    }
    expect(speedToPxPerSec(5, 48)).toBeCloseTo(2 * speedToPxPerSec(5, 24))
  })
})

describe('scroll clock', () => {
  it('accumulates play, ticks, pause and resume using explicit fake timestamps', () => {
    const initial = initialScroll()
    expect(initial).toEqual({ offset: 0, playing: false, lastTs: null })
    let state = play(initial, 1000)
    state = tick(state, 1100, 100, 1000)
    expect(state.offset).toBe(10)
    state = pause(state, 1150)
    expect(state.offset).toBe(15)
    expect(state.playing).toBe(false)
    state = tick(state, 4000, 100, 1000)
    expect(state.offset).toBe(15)
    state = play(state, 5000)
    state = tick(state, 5200, 100, 1000)
    expect(state.offset).toBe(35)
    state = pause(state, 5250)
    expect(state.offset).toBe(40)
    expect(initial).toEqual({ offset: 0, playing: false, lastTs: null })
  })

  it('does not reset a playing clock or advance a paused one', () => {
    const paused = initialScroll()
    expect(tick(paused, 9999, 100, 1000)).toBe(paused)
    expect(pause(paused, 9999)).toBe(paused)
    const playing = play(paused, 0)
    expect(play(playing, 100)).toBe(playing)
    expect(tick(playing, 200, 100, 1000).offset).toBe(20)
  })

  it('toggles and uses the last tick rate for the final partial frame', () => {
    let state = toggle(initialScroll(), 0)
    state = tick(state, 100, 80, 1000)
    state = toggle(state, 200)
    expect(state.offset).toBe(16)
    expect(state.playing).toBe(false)
    state = toggle(state, 1000)
    expect(tick(state, 1100, 80, 1000).offset).toBe(24)
  })

  it('clamps at max while keeping the playing state', () => {
    const state = tick(play(initialScroll(), 0), 250, 100, 12)
    expect(state.offset).toBe(12)
    expect(state.playing).toBe(true)
    expect(tick(state, 500, 100, 12).offset).toBe(12)
    expect(pause(state, 600).offset).toBe(12)
    expect(tick(play(initialScroll(), 0), 100, -100, 12).offset).toBe(0)
  })

  it('caps elapsed time at 250ms after a hidden tab or a long pause between frames', () => {
    let state = tick(play(initialScroll(), 0), 10_000, 100, 1000)
    expect(state.offset).toBe(25)
    expect(state.lastTs).toBe(10_000)
    state = tick(state, 10_100, 100, 1000)
    expect(state.offset).toBe(35)
    expect(pause(state, 20_000).offset).toBe(60)
  })

  it('does not move backwards if timestamps regress', () => {
    const state = tick(play(initialScroll(), 1000), 900, 100, 1000)
    expect(state.offset).toBe(0)
  })

  it('starts without a jump when given a playing state with no timestamp', () => {
    expect(tick({ offset: 5, playing: true, lastTs: null }, 1000, 100, 1000).offset).toBe(5)
  })

  it('keeps timing independent between teleprompter instances', () => {
    const first = tick(play(initialScroll(), 0), 100, 20, 100)
    const second = tick(play(initialScroll(), 0), 100, 100, 100)
    expect(pause(first, 200).offset).toBe(4)
    expect(pause(second, 200).offset).toBe(20)
  })

  it('clamps scrubbing and resets the playing timestamp', () => {
    const idle = initialScroll()
    expect(scrubTo(idle, -10, 100, 50)).toEqual({ offset: 0, playing: false, lastTs: null })
    expect(scrubTo(idle, 200, 100, 50).offset).toBe(100)
    expect(scrubTo(idle, 20, -10, 50).offset).toBe(0)
    const playing = tick(play(idle, 0), 50, 100, 1000)
    const scrubbed = scrubTo(playing, 40, 100, 1000)
    expect(scrubbed.lastTs).toBe(1000)
    expect(scrubbed.playing).toBe(true)
    expect(tick(scrubbed, 1100, 100, 100).offset).toBe(50)
    expect(pause(scrubbed, 1100).offset).toBe(50)
  })
})

describe('script lines', () => {
  it.each([
    [0, [10, 40, 80], 0, 0],
    [20, [0, 40, 80], 20, 1],
    [60, [0, 40, 80], 20, 2],
    [500, [0, 40, 80], 0, 2],
    [100, [], 20, 0],
  ] as Array<[number, number[], number, number]>)('finds the last line at the focus position', (offset, tops, focus, expected) => {
    expect(activeLineIndex(offset, tops, focus)).toBe(expected)
  })

  it('trims lines and drops empty paragraphs, including Windows newlines', () => {
    expect(splitLines('  Hook. Next sentence.\r\n\r\n First beat \n \n CTA '))
      .toEqual(['Hook. Next sentence.', 'First beat', 'CTA'])
    expect(splitLines(' \n ')).toEqual([])
  })
})
