import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useVideoPlayer, type UseVideoPlayerReturn } from '../use-video-player'
import { useReviewStore } from '@/stores/review-store'

let player: UseVideoPlayerReturn
function Harness() {
  player = useVideoPlayer(null)
  return <div data-testid="container"><video ref={player.videoRef} data-testid="video" /></div>
}

beforeEach(() => useReviewStore.getState().reset())
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('the real video fullscreen hook', () => {
  it('enters the native video player on iPhone and follows native fullscreen events', () => {
    render(<Harness />)
    const video = screen.getByTestId('video')
    const enter = vi.fn()
    Object.assign(video, { webkitEnterFullscreen: enter })
    act(() => player.toggleFullscreen(screen.getByTestId('container')))
    expect(enter).toHaveBeenCalledTimes(1)
    act(() => video.dispatchEvent(new Event('webkitbeginfullscreen')))
    expect(player.isFullscreen).toBe(true)
    act(() => video.dispatchEvent(new Event('webkitendfullscreen')))
    expect(player.isFullscreen).toBe(false)
  })

  it('preserves standard element fullscreen on desktop', () => {
    render(<Harness />)
    const request = vi.fn().mockResolvedValue(undefined)
    const native = vi.fn()
    const container = screen.getByTestId('container')
    Object.assign(container, { requestFullscreen: request })
    Object.assign(screen.getByTestId('video'), { webkitEnterFullscreen: native })
    act(() => player.toggleFullscreen(container))
    expect(request).toHaveBeenCalledTimes(1)
    expect(native).not.toHaveBeenCalled()
  })

  it('uses the prefixed container API on iPad before native video fullscreen', () => {
    render(<Harness />)
    const request = vi.fn().mockResolvedValue(undefined)
    const native = vi.fn()
    const container = screen.getByTestId('container')
    Object.assign(container, { webkitRequestFullscreen: request })
    Object.assign(screen.getByTestId('video'), { webkitEnterFullscreen: native })
    act(() => player.toggleFullscreen(container))
    expect(request).toHaveBeenCalledTimes(1)
    expect(native).not.toHaveBeenCalled()
  })
})
