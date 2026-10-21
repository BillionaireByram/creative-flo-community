import { StrictMode, type PropsWithChildren } from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useBackgroundBlur } from '../use-background-blur'
import { FakeVideoTrack, deferred, videoStream } from './recorder-fixtures'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('useBackgroundBlur', () => {
  it('re-reads configurationchange without trying to set a system-only effect', () => {
    const track = new FakeVideoTrack()
    track.settings.backgroundBlur = false
    track.capabilities.backgroundBlur = [false]
    const stream = videoStream(track)
    const { result } = renderHook(() => useBackgroundBlur(stream, true))
    expect(result.current).toEqual({ blur: false, ready: true })
    act(() => { track.settings.backgroundBlur = true; track.dispatchEvent(new Event('configurationchange')) })
    expect(result.current.blur).toBe(true)
    act(() => { track.settings.backgroundBlur = false; track.dispatchEvent(new Event('configurationchange')) })
    expect(result.current.blur).toBe(false)
    expect(track.applyConstraints).not.toHaveBeenCalled()
  })

  it('applies once under Strict Mode and preserves capture constraints', async () => {
    const track = new FakeVideoTrack()
    track.settings.backgroundBlur = false
    track.capabilities.backgroundBlur = [false, true]
    track.constraints = { width: { ideal: 2160 }, height: { ideal: 3840 }, frameRate: { ideal: 30 } }
    track.applyConstraints.mockImplementation(async () => { track.settings.backgroundBlur = true })
    const stream = videoStream(track)
    const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>
    const { result, rerender } = renderHook(({ enabled }) => useBackgroundBlur(stream, enabled), {
      initialProps: { enabled: true }, wrapper,
    })
    await waitFor(() => expect(result.current.blur).toBe(true))
    expect(track.applyConstraints).toHaveBeenCalledExactlyOnceWith({ ...track.constraints, backgroundBlur: true })
    act(() => { track.settings.backgroundBlur = false; track.dispatchEvent(new Event('configurationchange')) })
    rerender({ enabled: false })
    expect(result.current).toEqual({ blur: null, ready: false })
    rerender({ enabled: true })
    expect(result.current.blur).toBe(false)
    expect(track.applyConstraints).toHaveBeenCalledTimes(1)
  })

  it.each(['reject', 'throw'] as const)('swallows an applyConstraints %s and keeps reporting state', async (mode) => {
    const track = new FakeVideoTrack()
    track.settings.backgroundBlur = false
    track.capabilities.backgroundBlur = [false, true]
    if (mode === 'throw') track.applyConstraints.mockImplementation(() => { throw new Error('Not allowed') })
    else track.applyConstraints.mockRejectedValue(new Error('Not allowed'))
    const { result } = renderHook(() => useBackgroundBlur(videoStream(track), true))
    await waitFor(() => expect(result.current).toEqual({ blur: false, ready: true }))
    expect(track.applyConstraints).toHaveBeenCalledTimes(1)
  })

  it('does not apply when disabled, unsupported, or the capability is fixed', async () => {
    for (const capability of [undefined, [false], [true]]) {
      const track = new FakeVideoTrack()
      track.capabilities.backgroundBlur = capability
      const { unmount } = renderHook(() => useBackgroundBlur(videoStream(track), true))
      expect(track.applyConstraints).not.toHaveBeenCalled()
      unmount()
    }
    const track = new FakeVideoTrack()
    track.capabilities.backgroundBlur = [false, true]
    const { result } = renderHook(() => useBackgroundBlur(videoStream(track), false))
    expect(track.applyConstraints).not.toHaveBeenCalled()
    expect(result.current).toEqual({ blur: null, ready: false })
  })

  it('reports readiness for an unreported setting only after a video track is available', () => {
    const { result, rerender } = renderHook(({ stream }: { stream: MediaStream | null }) => useBackgroundBlur(stream, true), {
      initialProps: { stream: null as MediaStream | null },
    })
    expect(result.current).toEqual({ blur: null, ready: false })
    rerender({ stream: videoStream(new FakeVideoTrack()) })
    expect(result.current).toEqual({ blur: null, ready: true })
  })

  it('cleans up old listeners and ignores a late constraint result after the stream changes', async () => {
    const first = new FakeVideoTrack()
    first.capabilities.backgroundBlur = [false, true]
    const pending = deferred<void>()
    first.applyConstraints.mockReturnValue(pending.promise)
    const removed = vi.spyOn(first, 'removeEventListener')
    const second = new FakeVideoTrack()
    second.settings.backgroundBlur = false
    const removedSecond = vi.spyOn(second, 'removeEventListener')
    const { result, rerender, unmount } = renderHook(({ stream }) => useBackgroundBlur(stream, true), {
      initialProps: { stream: videoStream(first) },
    })
    rerender({ stream: videoStream(second) })
    expect(removed).toHaveBeenCalledWith('configurationchange', expect.any(Function))
    await act(async () => { first.settings.backgroundBlur = true; pending.resolve() })
    expect(result.current.blur).toBe(false)
    act(() => { first.dispatchEvent(new Event('configurationchange')) })
    expect(result.current.blur).toBe(false)
    unmount()
    expect(removedSecond).toHaveBeenCalledWith('configurationchange', expect.any(Function))
  })
})
