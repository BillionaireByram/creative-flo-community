import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCamera } from '../use-camera'
import { createRecorder, useRecorder } from '../use-recorder'
import { videoConstraints } from '../media'
import type { Take } from '../use-recorder'
import { useWakeLock } from '../use-wake-lock'

class FakeMediaRecorder extends EventTarget {
  static instances: FakeMediaRecorder[] = []
  static isTypeSupported = vi.fn((mime: string) => mime === 'video/mp4')
  state: RecordingState = 'inactive'
  mimeType: string
  timeslice: number | undefined
  autoStop = true
  finalChunk: Blob | null = null
  ondataavailable: ((event: BlobEvent) => void) | null = null
  onstop: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  constructor(readonly stream: MediaStream, readonly options: MediaRecorderOptions = {}) {
    super()
    this.mimeType = options.mimeType ?? 'video/webm'
    FakeMediaRecorder.instances.push(this)
  }

  start = vi.fn((timeslice?: number) => {
    this.timeslice = timeslice
    this.state = 'recording'
  })

  stop = vi.fn(() => {
    this.state = 'inactive'
    if (this.autoStop) {
      if (this.finalChunk) this.emitData(this.finalChunk)
      this.emitStop()
    }
  })

  emitData(data: Blob) {
    const event = new Event('dataavailable')
    Object.defineProperty(event, 'data', { value: data })
    this.dispatchEvent(event)
    this.ondataavailable?.(event as BlobEvent)
  }

  emitStop() {
    const event = new Event('stop')
    this.dispatchEvent(event)
    this.onstop?.(event)
  }

  emitError(error: Error) {
    const event = new Event('error')
    Object.defineProperty(event, 'error', { value: error })
    this.dispatchEvent(event)
    this.onerror?.(event)
  }
}

function fakeStream() {
  const tracks = [{ stop: vi.fn(), getSettings: vi.fn(() => ({ width: 1080, height: 1920 })) }, { stop: vi.fn() }]
  const stream = { getTracks: () => tracks, getVideoTracks: () => [tracks[0]] } as unknown as MediaStream
  return { stream, tracks }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

const overrides: Array<{ target: object; key: PropertyKey; descriptor: PropertyDescriptor | undefined }> = []
function setProperty(target: object, key: PropertyKey, value: unknown) {
  overrides.push({ target, key, descriptor: Object.getOwnPropertyDescriptor(target, key) })
  Object.defineProperty(target, key, { configurable: true, writable: true, value })
}

const getUserMedia = vi.fn<(constraints?: MediaStreamConstraints) => Promise<MediaStream>>()
const createObjectURL = vi.fn(() => 'blob:x')

beforeEach(() => {
  vi.resetAllMocks()
  FakeMediaRecorder.instances = []
  FakeMediaRecorder.isTypeSupported.mockImplementation((mime) => mime === 'video/mp4')
  createObjectURL.mockReturnValue('blob:x')
  setProperty(window, 'isSecureContext', true)
  setProperty(navigator, 'mediaDevices', { getUserMedia })
  setProperty(globalThis, 'MediaRecorder', FakeMediaRecorder)
  if (typeof URL !== 'undefined') setProperty(URL, 'createObjectURL', createObjectURL)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  for (const { target, key, descriptor } of overrides.reverse()) {
    if (descriptor) Object.defineProperty(target, key, descriptor)
    else Reflect.deleteProperty(target, key)
  }
  overrides.length = 0
})

describe('useCamera', () => {
  it('opens the requested camera and stops every track on unmount', async () => {
    const camera = fakeStream()
    getUserMedia.mockResolvedValue(camera.stream)
    const { result, unmount } = renderHook(() => useCamera({ facing: 'user', quality: '4k', enabled: true }))
    await waitFor(() => expect(result.current.status).toBe('live'))
    expect(result.current.stream).toBe(camera.stream)
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'user', width: { ideal: 2160 }, height: { ideal: 3840 }, frameRate: { ideal: 30 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    })
    unmount()
    for (const track of camera.tracks) expect(track.stop).toHaveBeenCalledTimes(1)
  })

  it('reopens with the selected quality and releases the old stream', async () => {
    const first = fakeStream()
    const second = fakeStream()
    getUserMedia.mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream)
    const { result, rerender } = renderHook(
      ({ quality }: { quality: '4k' | '1080p' }) => useCamera({ facing: 'user', quality, enabled: true }),
      { initialProps: { quality: '4k' } },
    )
    await waitFor(() => expect(result.current.stream).toBe(first.stream))
    rerender({ quality: '1080p' })
    await waitFor(() => expect(result.current.stream).toBe(second.stream))
    expect(getUserMedia).toHaveBeenLastCalledWith(videoConstraints('user', '1080p'))
    for (const track of first.tracks) expect(track.stop).toHaveBeenCalledTimes(1)
  })

  it('stops the old camera before opening the other facing', async () => {
    const front = fakeStream()
    const back = fakeStream()
    getUserMedia.mockResolvedValueOnce(front.stream).mockResolvedValueOnce(back.stream)
    const { result, rerender, unmount } = renderHook(
      ({ facing }: { facing: 'user' | 'environment' }) => useCamera({ facing, quality: '4k', enabled: true }),
      { initialProps: { facing: 'user' } },
    )
    await waitFor(() => expect(result.current.stream).toBe(front.stream))
    rerender({ facing: 'environment' })
    await waitFor(() => expect(result.current.stream).toBe(back.stream))
    for (const track of front.tracks) {
      expect(track.stop).toHaveBeenCalledTimes(1)
      expect(track.stop.mock.invocationCallOrder[0]).toBeLessThan(getUserMedia.mock.invocationCallOrder[1])
    }
    expect(getUserMedia).toHaveBeenLastCalledWith(expect.objectContaining({
      video: expect.objectContaining({ facingMode: 'environment' }),
    }))
    unmount()
    for (const track of back.tracks) expect(track.stop).toHaveBeenCalledTimes(1)
  })

  it('stops tracks when disabled and stays idle without opening a camera', async () => {
    const camera = fakeStream()
    getUserMedia.mockResolvedValue(camera.stream)
    const { result, rerender } = renderHook(
      ({ enabled }) => useCamera({ facing: 'user', quality: '4k', enabled }), { initialProps: { enabled: false } },
    )
    expect(result.current.status).toBe('idle')
    expect(getUserMedia).not.toHaveBeenCalled()
    rerender({ enabled: true })
    await waitFor(() => expect(result.current.status).toBe('live'))
    rerender({ enabled: false })
    expect(result.current.status).toBe('idle')
    expect(result.current.stream).toBeNull()
    for (const track of camera.tracks) expect(track.stop).toHaveBeenCalledTimes(1)
  })

  it('classifies denied permission and can restart after it is allowed', async () => {
    const camera = fakeStream()
    getUserMedia.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
      .mockResolvedValueOnce(camera.stream)
    const { result } = renderHook(() => useCamera({ facing: 'user', quality: '4k', enabled: true }))
    await waitFor(() => expect(result.current.error?.kind).toBe('permission-denied'))
    expect(result.current.status).toBe('error')
    act(() => result.current.restart())
    await waitFor(() => expect(result.current.status).toBe('live'))
    expect(result.current.error).toBeNull()
  })

  it('rejects insecure contexts before calling getUserMedia', () => {
    setProperty(window, 'isSecureContext', false)
    const { result } = renderHook(() => useCamera({ facing: 'user', quality: '4k', enabled: true }))
    expect(result.current.status).toBe('error')
    expect(result.current.error?.kind).toBe('insecure')
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('handles a missing camera API without throwing', () => {
    setProperty(navigator, 'mediaDevices', undefined)
    const { result } = renderHook(() => useCamera({ facing: 'user', quality: '4k', enabled: true }))
    expect(result.current.error?.kind).toBe('unsupported-camera')
  })

  it('stops a stale camera result after a facing change', async () => {
    const oldCamera = fakeStream()
    const newCamera = fakeStream()
    const oldRequest = deferred<MediaStream>()
    getUserMedia.mockReturnValueOnce(oldRequest.promise).mockResolvedValueOnce(newCamera.stream)
    const { result, rerender } = renderHook(
      ({ facing }: { facing: 'user' | 'environment' }) => useCamera({ facing, quality: '4k', enabled: true }),
      { initialProps: { facing: 'user' } },
    )
    rerender({ facing: 'environment' })
    await waitFor(() => expect(result.current.stream).toBe(newCamera.stream))
    await act(async () => { oldRequest.resolve(oldCamera.stream) })
    expect(result.current.stream).toBe(newCamera.stream)
    for (const track of oldCamera.tracks) expect(track.stop).toHaveBeenCalledTimes(1)
    for (const track of newCamera.tracks) expect(track.stop).not.toHaveBeenCalled()
  })

  it('stops a camera granted after unmount', async () => {
    const camera = fakeStream()
    const request = deferred<MediaStream>()
    getUserMedia.mockReturnValue(request.promise)
    const { unmount } = renderHook(() => useCamera({ facing: 'user', quality: '4k', enabled: true }))
    unmount()
    await act(async () => { request.resolve(camera.stream) })
    for (const track of camera.tracks) expect(track.stop).toHaveBeenCalledTimes(1)
  })
})

describe('useRecorder', () => {
  it('uses the selected MIME and one-second chunks, resolving all chunks on stop', async () => {
    const camera = fakeStream()
    const { result } = renderHook(() => useRecorder(camera.stream))
    act(() => { expect(result.current.start()).toBe(true) })
    const recorder = FakeMediaRecorder.instances[0]
    expect(recorder.stream).toBe(camera.stream)
    expect(recorder.options).toEqual({ mimeType: 'video/mp4', videoBitsPerSecond: 12_000_000 })
    expect(recorder.start).toHaveBeenCalledWith(1000)
    expect(recorder.timeslice).toBe(1000)
    expect(result.current.status).toBe('recording')
    act(() => {
      recorder.emitData(new Blob(['abc']))
      recorder.emitData(new Blob(['defg']))
      recorder.emitData(new Blob([]))
    })
    recorder.finalChunk = new Blob(['hi'])
    await act(async () => {
      const take = await result.current.stop()
      expect(take).toMatchObject({ url: 'blob:x', mimeType: 'video/mp4' })
      expect(take?.blob.size).toBe(9)
      expect(take?.blob.type).toBe('video/mp4')
      expect(take?.id).toBeTruthy()
      expect(take?.createdAt).toBeInstanceOf(Date)
      expect(take?.durationMs).toBeGreaterThanOrEqual(0)
      expect(createObjectURL).toHaveBeenCalledWith(take?.blob)
    })
    expect(result.current.status).toBe('idle')
    for (const track of camera.tracks) expect(track.stop).not.toHaveBeenCalled()
  })

  it.each([
    [2160, 3840, 20_000_000], [3840, 2160, 20_000_000], [1080, 1920, 12_000_000],
  ])('reads actual %s x %s settings when recording starts', (width, height, bitrate) => {
    const getSettings = vi.fn(() => ({ width: 640, height: 480 }))
    const camera = { getVideoTracks: () => [{ getSettings }] } as unknown as MediaStream
    const { result } = renderHook(() => useRecorder(camera))
    expect(getSettings).not.toHaveBeenCalled()
    getSettings.mockReturnValue({ width, height })
    act(() => { expect(result.current.start()).toBe(true) })
    expect(FakeMediaRecorder.instances[0].options).toEqual({ mimeType: 'video/mp4', videoBitsPerSecond: bitrate })
  })

  it('uses the actual recorder MIME, falling back to the picked one when empty', async () => {
    FakeMediaRecorder.isTypeSupported.mockImplementation((mime) => mime.startsWith('video/webm'))
    const camera = fakeStream()
    const { result } = renderHook(() => useRecorder(camera.stream))
    act(() => { result.current.start() })
    const first = FakeMediaRecorder.instances[0]
    expect(first.options.mimeType).toBe('video/webm;codecs=vp9,opus')
    first.mimeType = 'video/webm;codecs=vp8,opus'
    await act(async () => {
      const take = await result.current.stop()
      expect(take?.mimeType).toBe('video/webm;codecs=vp8,opus')
    })
    act(() => { result.current.start() })
    FakeMediaRecorder.instances[1].mimeType = ''
    await act(async () => {
      expect((await result.current.stop())?.mimeType).toBe('video/webm;codecs=vp9,opus')
    })
  })

  it('waits for stop and includes the final chunk with duplicate stop callers', async () => {
    const camera = fakeStream()
    const { result } = renderHook(() => useRecorder(camera.stream))
    act(() => { result.current.start() })
    const recorder = FakeMediaRecorder.instances[0]
    recorder.autoStop = false
    let pending!: Promise<Take | null>
    let duplicate!: Promise<Take | null>
    const resolved = vi.fn()
    act(() => {
      pending = result.current.stop()
      duplicate = result.current.stop()
      void pending.then(resolved)
    })
    expect(result.current.status).toBe('stopping')
    expect(resolved).not.toHaveBeenCalled()
    expect(recorder.stop).toHaveBeenCalledTimes(1)
    await act(async () => {
      recorder.emitData(new Blob(['last']))
      recorder.emitStop()
      const take = await pending
      expect(take?.blob.size).toBe(4)
      expect(await duplicate).toBe(take)
    })
    expect(createObjectURL).toHaveBeenCalledTimes(1)
  })

  it('updates elapsed time four times per second and freezes it at stop', async () => {
    vi.useFakeTimers()
    const camera = fakeStream()
    const { result } = renderHook(() => useRecorder(camera.stream))
    act(() => { result.current.start() })
    act(() => { vi.advanceTimersByTime(250) })
    expect(result.current.elapsedMs).toBe(250)
    act(() => { vi.advanceTimersByTime(750) })
    expect(result.current.elapsedMs).toBe(1000)
    await act(async () => {
      expect((await result.current.stop())?.durationMs).toBe(1000)
    })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.elapsedMs).toBe(1000)
  })

  it('reports unsupported-recorder when MediaRecorder is missing', () => {
    setProperty(globalThis, 'MediaRecorder', undefined)
    const camera = fakeStream()
    const { result } = renderHook(() => useRecorder(camera.stream))
    act(() => { expect(result.current.start()).toBe(false) })
    expect(result.current.error?.kind).toBe('unsupported-recorder')
    expect(result.current.status).toBe('idle')
  })

  it('reports unsupported-recorder when no MIME is supported', () => {
    FakeMediaRecorder.isTypeSupported.mockReturnValue(false)
    const camera = fakeStream()
    const { result } = renderHook(() => useRecorder(camera.stream))
    act(() => { expect(result.current.start()).toBe(false) })
    expect(result.current.error?.kind).toBe('unsupported-recorder')
  })

  it('returns false without a stream and null when there is nothing to stop', async () => {
    const { result } = renderHook(() => useRecorder(null))
    act(() => { expect(result.current.start()).toBe(false) })
    await expect(result.current.stop()).resolves.toBeNull()
  })

  it('does not start a second recorder while already recording', () => {
    const camera = fakeStream()
    const { result } = renderHook(() => useRecorder(camera.stream))
    act(() => {
      expect(result.current.start()).toBe(true)
      expect(result.current.start()).toBe(false)
    })
    expect(FakeMediaRecorder.instances).toHaveLength(1)
  })

  it('stops and discards on unmount without creating a take URL', () => {
    const camera = fakeStream()
    const { result, unmount } = renderHook(() => useRecorder(camera.stream))
    act(() => { result.current.start() })
    const recorder = FakeMediaRecorder.instances[0]
    recorder.emitData(new Blob(['discard']))
    unmount()
    expect(recorder.stop).toHaveBeenCalledTimes(1)
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('settles a pending stop on unmount even without a browser stop event', async () => {
    const camera = fakeStream()
    const { result, unmount } = renderHook(() => useRecorder(camera.stream))
    act(() => { result.current.start() })
    FakeMediaRecorder.instances[0].autoStop = false
    let pending!: Promise<Take | null>
    act(() => { pending = result.current.stop() })
    unmount()
    await expect(pending).resolves.toBeNull()
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('does not revoke completed take URLs when unmounted', async () => {
    const revokeObjectURL = vi.fn()
    setProperty(URL, 'revokeObjectURL', revokeObjectURL)
    const camera = fakeStream()
    const { result, unmount } = renderHook(() => useRecorder(camera.stream))
    act(() => { result.current.start() })
    await act(async () => { await result.current.stop() })
    unmount()
    expect(revokeObjectURL).not.toHaveBeenCalled()
  })

  it('settles recording errors and releases the recorder', async () => {
    const camera = fakeStream()
    const { result } = renderHook(() => useRecorder(camera.stream))
    act(() => { result.current.start() })
    const recorder = FakeMediaRecorder.instances[0]
    act(() => {
      recorder.emitData(new Blob(['partial']))
      recorder.emitError(new DOMException('Device busy', 'NotReadableError'))
    })
    expect(result.current.error?.kind).toBe('camera-busy')
    expect(result.current.status).toBe('idle')
    expect(recorder.stop).toHaveBeenCalledTimes(1)
    await act(async () => {
      const take = await result.current.stop()
      expect(take?.recovered).toBe(true)
      expect(take?.blob.size).toBe(7)
    })
  })

  it('allows createRecorder to leave MIME selection to the browser', () => {
    const camera = fakeStream()
    createRecorder(camera.stream, null)
    expect(FakeMediaRecorder.instances[0].options).toEqual({ videoBitsPerSecond: 12_000_000 })
  })
})

describe('useWakeLock', () => {
  it('requests a screen lock, re-acquires after visibility returns and releases on disable', async () => {
    const first = { released: false, release: vi.fn().mockResolvedValue(undefined) }
    const second = { released: false, release: vi.fn().mockResolvedValue(undefined) }
    const request = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    setProperty(navigator, 'wakeLock', { request })
    setProperty(document, 'visibilityState', 'visible')
    const { rerender } = renderHook(({ active }) => useWakeLock(active), { initialProps: { active: true } })
    await act(async () => { await Promise.resolve() })
    expect(request).toHaveBeenCalledWith('screen')
    first.released = true
    setProperty(document, 'visibilityState', 'hidden')
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(request).toHaveBeenCalledTimes(1)
    setProperty(document, 'visibilityState', 'visible')
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(request).toHaveBeenCalledTimes(2)
    rerender({ active: false })
    expect(second.release).toHaveBeenCalledTimes(1)
  })

  it('releases a lock granted after unmount', async () => {
    const pending = deferred<WakeLockSentinel>()
    const release = vi.fn().mockResolvedValue(undefined)
    setProperty(navigator, 'wakeLock', { request: vi.fn().mockReturnValue(pending.promise) })
    setProperty(document, 'visibilityState', 'visible')
    const { unmount } = renderHook(() => useWakeLock(true))
    unmount()
    await act(async () => { pending.resolve({ release, released: false } as unknown as WakeLockSentinel) })
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('tolerates a missing or rejected wake lock API', async () => {
    setProperty(navigator, 'wakeLock', undefined)
    const { unmount } = renderHook(() => useWakeLock(true))
    unmount()
    const request = vi.fn().mockRejectedValue(new DOMException('Low battery', 'NotAllowedError'))
    setProperty(navigator, 'wakeLock', { request })
    setProperty(document, 'visibilityState', 'visible')
    renderHook(() => useWakeLock(true))
    await act(async () => { await Promise.resolve() })
    expect(request).toHaveBeenCalledTimes(1)
  })
})
