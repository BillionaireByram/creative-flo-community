import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecordScreen } from '../record-screen'
import { useCamera } from '../use-camera'
import { DEFAULT_SETTINGS } from '../settings'
import { FakeMediaRecorder, FakeVideoTrack, deferred, restoreProperties, setProperty, videoStream } from './recorder-fixtures'

vi.mock('../use-camera', () => ({ useCamera: vi.fn() }))
vi.mock('../use-wake-lock', () => ({ useWakeLock: () => undefined }))
vi.mock('../teleprompter-overlay', () => ({ TeleprompterOverlay: () => null }))

let track: FakeVideoTrack

beforeEach(() => {
  track = new FakeVideoTrack()
  vi.mocked(useCamera).mockReturnValue({ status: 'live', stream: videoStream(track), error: null, restart: vi.fn() })
  FakeMediaRecorder.instances = []
  FakeMediaRecorder.isTypeSupported.mockReturnValue(true)
  setProperty(globalThis, 'MediaRecorder', FakeMediaRecorder)
  setProperty(URL, 'createObjectURL', vi.fn(() => 'blob:screen'))
  setProperty(URL, 'revokeObjectURL', vi.fn())
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  restoreProperties()
})

function props() {
  return { settings: { ...DEFAULT_SETTINGS, studioTipSeen: true, countdown: false }, text: 'Hello camera', title: 'My script',
    onChange: vi.fn(), onBack: vi.fn(), onTake: vi.fn(), onLimit: vi.fn() }
}

describe('RecordScreen completion', () => {
  it('delivers an automatic stop and allows a second recording', async () => {
    const callbacks = props()
    render(<RecordScreen {...callbacks} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    const recorder = FakeMediaRecorder.instances[0]
    await act(async () => {
      recorder.emitData(new Blob(['auto take']))
      recorder.emitStop()
    })
    expect(callbacks.onTake).toHaveBeenCalledTimes(1)
    expect(callbacks.onTake).toHaveBeenCalledWith(expect.objectContaining({ recovered: true, blob: expect.any(Blob) }), true)
    expect(screen.getByRole('button', { name: 'Start recording' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    expect(FakeMediaRecorder.instances).toHaveLength(2)
    expect(FakeMediaRecorder.instances[1].state).toBe('recording')
  })

  it('shows the countdown, limits screen-reader updates, and delivers a capped take for review', async () => {
    vi.useFakeTimers()
    const callbacks = props()
    render(<RecordScreen {...callbacks} maxDurationMs={61_000} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    act(() => { FakeMediaRecorder.instances[0].emitData(new Blob(['capped'])) })
    expect(screen.queryByText('Auto-stops in 1:00')).not.toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByText('Auto-stops in 1:00')).toBeInTheDocument()
    expect(screen.getByText('Auto-stops in 60 seconds')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(18_000) })
    expect(screen.getByText('Auto-stops in 0:42')).toBeInTheDocument()
    expect(screen.getByText('Auto-stops in 60 seconds')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(12_000) })
    expect(screen.getByText('Auto-stops in 30 seconds')).toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(callbacks.onTake).toHaveBeenCalledTimes(1)
    expect(callbacks.onTake).toHaveBeenCalledWith(expect.objectContaining({ durationMs: 61_000 }), true)
    expect(callbacks.onLimit).toHaveBeenCalledTimes(1)
  })

  it('uses the same completion path for close while keeping the take out of review', async () => {
    const callbacks = props()
    render(<RecordScreen {...callbacks} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    act(() => { FakeMediaRecorder.instances[0].emitData(new Blob(['keep on close'])) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stop recording and return to setup' })) })
    expect(callbacks.onTake).toHaveBeenCalledTimes(1)
    expect(callbacks.onTake).toHaveBeenCalledWith(expect.objectContaining({ blob: expect.any(Blob) }), false)
    expect(callbacks.onBack).toHaveBeenCalledTimes(1)
  })
})

describe('RecordScreen Studio Look', () => {
  it('reports Portrait on and configuration changes through a live region', () => {
    track.settings.backgroundBlur = true
    render(<RecordScreen {...props()} />)
    const badge = screen.getByText('Portrait on')
    expect(badge.parentElement).toHaveAttribute('aria-live', 'polite')
    expect(screen.queryByRole('region', { name: 'Studio Look tip' })).not.toBeInTheDocument()
    act(() => { track.settings.backgroundBlur = false; track.dispatchEvent(new Event('configurationchange')) })
    expect(screen.getByRole('button', { name: 'Portrait off' })).toBeEnabled()
    act(() => { track.settings.backgroundBlur = true; track.dispatchEvent(new Event('configurationchange')) })
    expect(screen.getByText('Portrait on')).toBeInTheDocument()
  })

  it.each([false, undefined])('auto-shows the tip once for blur=%s, including unreported effects', (blur) => {
    track.settings.backgroundBlur = blur
    const callbacks = props()
    callbacks.settings.studioTipSeen = false
    const { rerender } = render(<RecordScreen {...callbacks} />)
    expect(screen.getByRole('region', { name: 'Studio Look tip' })).toHaveTextContent('Turn on Portrait: swipe down from the top-right corner to open Control Center, tap Video Effects, then tap Portrait. Come back here and the badge turns on.')
    expect(callbacks.onChange).toHaveBeenCalledExactlyOnceWith({ studioTipSeen: true })
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus()
    if (blur === undefined) expect(screen.queryByText('Portrait off')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('region', { name: 'Studio Look tip' })).not.toBeInTheDocument()
    rerender(<RecordScreen {...callbacks} text="Another script" />)
    act(() => { track.dispatchEvent(new Event('configurationchange')) })
    expect(callbacks.onChange).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('region', { name: 'Studio Look tip' })).not.toBeInTheDocument()
  })

  it('does not open or mark the tip when Portrait is already on', () => {
    track.settings.backgroundBlur = true
    const callbacks = props()
    callbacks.settings.studioTipSeen = false
    render(<RecordScreen {...callbacks} />)
    expect(callbacks.onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument()
  })

  it('opens a seen tip manually and restores badge focus on Done or Escape', () => {
    track.settings.backgroundBlur = false
    const callbacks = props()
    render(<RecordScreen {...callbacks} />)
    const badge = screen.getByRole('button', { name: 'Portrait off' })
    badge.focus()
    fireEvent.click(badge)
    expect(badge).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(badge).toHaveFocus()
    fireEvent.click(badge)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Done' }), { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Studio Look tip' })).not.toBeInTheDocument()
    expect(badge).toHaveFocus()
    expect(callbacks.onBack).not.toHaveBeenCalled()
    expect(callbacks.onChange).not.toHaveBeenCalled()
  })

  it('keeps focus within the existing camera dialog while the tip is open', () => {
    track.settings.backgroundBlur = false
    render(<RecordScreen {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Portrait off' }))
    const first = screen.getByRole('button', { name: 'Back to setup' })
    const last = screen.getByRole('button', { name: 'Start recording' })
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
  })

  it('hides all Studio Look UI and avoids constraint requests when disabled', () => {
    track.settings.backgroundBlur = false
    track.capabilities.backgroundBlur = [false, true]
    const callbacks = props()
    callbacks.settings.studioLook = false
    callbacks.settings.studioTipSeen = false
    render(<RecordScreen {...callbacks} />)
    expect(screen.queryByText('Portrait off')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Studio Look tip' })).not.toBeInTheDocument()
    expect(track.applyConstraints).not.toHaveBeenCalled()
    expect(callbacks.onChange).not.toHaveBeenCalled()
  })

  it('waits for a live camera before showing the one-time unsupported-browser tip', () => {
    vi.mocked(useCamera).mockReturnValue({ status: 'starting', stream: null, error: null, restart: vi.fn() })
    const callbacks = props()
    callbacks.settings.studioTipSeen = false
    const { rerender } = render(<RecordScreen {...callbacks} />)
    expect(callbacks.onChange).not.toHaveBeenCalled()
    vi.mocked(useCamera).mockReturnValue({ status: 'live', stream: videoStream(track), error: null, restart: vi.fn() })
    rerender(<RecordScreen {...callbacks} />)
    expect(screen.getByRole('region', { name: 'Studio Look tip' })).toBeInTheDocument()
    expect(callbacks.onChange).toHaveBeenCalledWith({ studioTipSeen: true })
  })

  it('waits for automatic blur before deciding whether a tip is needed', async () => {
    track.settings.backgroundBlur = false
    track.capabilities.backgroundBlur = [false, true]
    const pending = deferred<void>()
    track.applyConstraints.mockReturnValue(pending.promise)
    const callbacks = props()
    callbacks.settings.studioTipSeen = false
    render(<RecordScreen {...callbacks} />)
    expect(screen.queryByRole('region', { name: 'Studio Look tip' })).not.toBeInTheDocument()
    await act(async () => { track.settings.backgroundBlur = true; pending.resolve() })
    expect(screen.getByText('Portrait on')).toBeInTheDocument()
    expect(callbacks.onChange).not.toHaveBeenCalled()
  })

  it('closes the tip and disables its badge during countdown, recording and stopping', async () => {
    vi.useFakeTimers()
    track.settings.backgroundBlur = false
    const callbacks = props()
    callbacks.settings.countdown = true
    render(<RecordScreen {...callbacks} />)
    const badge = screen.getByRole('button', { name: 'Portrait off' })
    fireEvent.click(badge)
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    expect(screen.queryByRole('region', { name: 'Studio Look tip' })).not.toBeInTheDocument()
    expect(badge).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Flip camera' })).toBeDisabled()
    for (let second = 0; second < 3; second += 1) act(() => { vi.advanceTimersByTime(1000) })
    expect(FakeMediaRecorder.instances[0].state).toBe('recording')
    expect(badge).toBeDisabled()
    const recorder = FakeMediaRecorder.instances[0]
    recorder.autoStop = false
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))
    expect(badge).toBeDisabled()
    await act(async () => { recorder.emitData(new Blob(['take'])); recorder.emitStop() })
    expect(badge).toBeEnabled()
    expect(screen.queryByRole('region', { name: 'Studio Look tip' })).not.toBeInTheDocument()
    expect(callbacks.onTake).toHaveBeenCalledTimes(1)
  })

  it('allows recording immediately while the one-time tip is open', () => {
    const callbacks = props()
    callbacks.settings.studioTipSeen = false
    render(<RecordScreen {...callbacks} />)
    expect(screen.getByRole('region', { name: 'Studio Look tip' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    expect(FakeMediaRecorder.instances[0].state).toBe('recording')
    expect(screen.queryByRole('region', { name: 'Studio Look tip' })).not.toBeInTheDocument()
  })

  it('passes capture quality through to camera acquisition', () => {
    const callbacks = props()
    callbacks.settings.quality = '1080p'
    render(<RecordScreen {...callbacks} />)
    expect(useCamera).toHaveBeenCalledWith({ facing: 'user', quality: '1080p', enabled: true })
  })
})
