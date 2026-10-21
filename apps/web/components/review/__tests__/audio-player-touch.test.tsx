import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { setCoarsePointer, setViewportWidth } from '@/test/setup'
import { useReviewStore } from '@/stores/review-store'
import type { Asset, AssetVersion } from '@/types'

const wave = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => void>(),
  setOptions: vi.fn(), seekTo: vi.fn(), playPause: vi.fn(), create: vi.fn(),
}))
vi.mock('wavesurfer.js', () => ({ default: { create: (...args: unknown[]) => {
  wave.create(...args)
  return {
    on: (event: string, handler: (...args: unknown[]) => void) => wave.handlers.set(event, handler),
    load: vi.fn(), destroy: vi.fn(), setVolume: vi.fn(), setPlaybackRate: vi.fn(),
    getDuration: () => 60, setOptions: wave.setOptions, seekTo: wave.seekTo,
    playPause: wave.playPause, play: vi.fn(),
  }
} } }))
vi.mock('@/lib/api', () => ({ api: { get: vi.fn(async () => ({ url: '/audio.mp3' })) } }))
vi.mock('../review-provider', () => ({ useReview: () => ({}) }))
import { AudioPlayer } from '../audio-player'

const asset = { id: 'a1', asset_type: 'audio' } as Asset
const version = { id: 'v1' } as AssetVersion

beforeEach(() => { vi.clearAllMocks(); wave.handlers.clear(); useReviewStore.getState().reset() })
afterEach(() => { cleanup(); setCoarsePointer(false); setViewportWidth(1024) })

async function mount(touch: boolean) {
  setCoarsePointer(touch)
  setViewportWidth(touch ? 390 : 1024)
  const view = render(<AudioPlayer asset={asset} version={version} />)
  await waitFor(() => expect(wave.handlers.has('ready')).toBe(true))
  act(() => wave.handlers.get('ready')?.())
  return view
}

describe('touch audio playback', () => {
  it('enables waveform finger dragging while preserving click-only mouse behavior', async () => {
    await mount(true)
    expect(wave.setOptions).toHaveBeenLastCalledWith({ dragToSeek: true })
    act(() => setCoarsePointer(false))
    expect(wave.setOptions).toHaveBeenLastCalledWith({ dragToSeek: false })
    expect(wave.create).toHaveBeenCalledTimes(1)
  })

  it('keeps desktop waveform dragging disabled', async () => {
    await mount(false)
    expect(wave.setOptions).toHaveBeenLastCalledWith({ dragToSeek: false })
  })

  it('seeks the waveform through the touch slider and plays with one tap', async () => {
    await mount(true)
    const slider = screen.getByRole('slider')
    slider.getBoundingClientRect = () => ({ left: 0, width: 200 } as DOMRect)
    fireEvent.pointerDown(slider, { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: 100 })
    expect(wave.seekTo).toHaveBeenLastCalledWith(0.5)
    const play = screen.getByTitle('Play (Space)')
    expect(play.className).toContain('[@media(pointer:coarse)]:min-h-11')
    fireEvent.click(play)
    expect(wave.playPause).toHaveBeenCalledTimes(1)
  })
})
