import { describe, expect, it } from 'vitest'
import { takeAssetName, takeFileName } from '../naming'

// The constructor uses local time so the expected label holds in every timezone.
const at = new Date(2026, 0, 2, 3, 4, 59)

describe('take names', () => {
  it('formats and zero-pads the local date and time', () => {
    expect(takeAssetName('My script', at)).toBe('Take · My script · 2026-01-02 03:04')
    expect(takeAssetName('My script', new Date(2026, 10, 23, 14, 56)))
      .toBe('Take · My script · 2026-11-23 14:56')
  })

  it.each([null, undefined, '', ' \n\t '])('uses Freestyle for an empty title (%s)', (title) => {
    expect(takeAssetName(title, at)).toBe('Take · Freestyle · 2026-01-02 03:04')
    expect(takeFileName(title, at, 'mp4')).toBe('take-freestyle-20260102-0304.mp4')
  })

  it('trims and collapses whitespace', () => {
    expect(takeAssetName(' \t My   first\n script \r\n ', at))
      .toBe('Take · My first script · 2026-01-02 03:04')
  })

  it('limits the title to 80 characters including the ellipsis', () => {
    expect(takeAssetName('x'.repeat(81), at)).toBe(`Take · ${'x'.repeat(79)}… · 2026-01-02 03:04`)
    expect(takeAssetName('x'.repeat(80), at)).toBe(`Take · ${'x'.repeat(80)} · 2026-01-02 03:04`)
  })

  it('does not split an emoji when truncating', () => {
    expect(takeAssetName('🎥'.repeat(81), at)).toBe(`Take · ${'🎥'.repeat(79)}… · 2026-01-02 03:04`)
  })

  it('makes lowercase ASCII filenames without edge or repeated dashes', () => {
    expect(takeFileName('  B\'s BIG idea: Take #2! ', at, 'webm'))
      .toBe('take-b-s-big-idea-take-2-20260102-0304.webm')
    expect(takeFileName('My   Script', at, 'mp4')).toBe('take-my-script-20260102-0304.mp4')
    expect(takeFileName('🎥 !!!', at, 'webm')).toBe('take-freestyle-20260102-0304.webm')
  })

  it('also bounds long filenames using the normalized title', () => {
    expect(takeFileName('X'.repeat(100), at, 'mp4')).toBe(`take-${'x'.repeat(79)}-20260102-0304.mp4`)
  })
})
