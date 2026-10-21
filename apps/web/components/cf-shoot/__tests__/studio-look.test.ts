import { describe, expect, it } from 'vitest'
import { portraitBadge, readBackgroundBlur } from '../studio-look'
import { FakeVideoTrack } from './recorder-fixtures'

function read(track: FakeVideoTrack) {
  return readBackgroundBlur(track as unknown as MediaStreamTrack)
}

describe('Studio Look state', () => {
  it.each([true, false])('reports a supported %s setting without requiring capabilities', (blur) => {
    const track = new FakeVideoTrack()
    track.settings.backgroundBlur = blur
    expect(read(track)).toEqual({ blur, settable: false })
    expect(portraitBadge(blur)).toBe(blur ? 'Portrait on' : 'Portrait off')
  })

  it('does not infer a badge from capability alone', () => {
    const track = new FakeVideoTrack()
    track.capabilities.backgroundBlur = [false, true]
    expect(read(track)).toEqual({ blur: null, settable: true })
    expect(portraitBadge(null)).toBeNull()
    expect(readBackgroundBlur(null)).toEqual({ blur: null, settable: false })
  })

  it.each<{ values: boolean[] }>([
    { values: [false] }, { values: [true] }, { values: [false, true] }, { values: [true, false] }, { values: [] },
  ])('requires both boolean values in capability $values to apply blur', ({ values }) => {
    const track = new FakeVideoTrack()
    track.capabilities.backgroundBlur = values
    expect(read(track).settable).toBe(values.includes(false) && values.includes(true))
  })

  it('tolerates missing or throwing experimental probes', () => {
    expect(readBackgroundBlur({} as MediaStreamTrack)).toEqual({ blur: null, settable: false })
    const track = new FakeVideoTrack()
    track.getSettings.mockImplementation(() => { throw new Error('Unavailable') })
    track.getCapabilities.mockImplementation(() => { throw new Error('Unavailable') })
    expect(read(track)).toEqual({ blur: null, settable: false })
  })

  it('does not treat malformed settings as an off state', () => {
    const track = { getSettings: () => ({ backgroundBlur: 'false' }), getCapabilities: () => ({ backgroundBlur: true }) }
    expect(readBackgroundBlur(track as unknown as MediaStreamTrack)).toEqual({ blur: null, settable: false })
  })
})
