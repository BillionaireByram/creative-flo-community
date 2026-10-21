import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_TAKE_MS, useRecorder, type RecorderCompletion, type Take } from '../use-recorder'
import { openTakeStore, type TakeStore } from '../take-store'
import { createIdbShim } from './idb-shim'
import { FakeMediaRecorder, blobText, meta, restoreProperties, setProperty, stream } from './recorder-fixtures'

const createObjectURL = vi.fn(() => 'blob:recorded')

beforeEach(() => {
  FakeMediaRecorder.instances = []
  FakeMediaRecorder.isTypeSupported.mockReturnValue(true)
  createObjectURL.mockClear()
  setProperty(globalThis, 'MediaRecorder', FakeMediaRecorder)
  setProperty(URL, 'createObjectURL', createObjectURL)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  restoreProperties()
})

async function opened(env = createIdbShim()): Promise<TakeStore> {
  const store = await openTakeStore(env)
  if (!store) throw new Error('Store did not open')
  return store
}

describe('recorder persistence and completion', () => {
  it('commits arriving chunks and reconstructs the take from disk after releasing RAM references', async () => {
    const store = await opened()
    const readBlob = vi.spyOn(store, 'readBlob')
    const onComplete = vi.fn<(result: RecorderCompletion) => void>()
    const { result } = renderHook(() => useRecorder(stream, { store, meta, onComplete }))
    act(() => { expect(result.current.start()).toBe(true) })
    const recorder = FakeMediaRecorder.instances[0]
    expect(recorder.start).toHaveBeenCalledWith(1000)
    act(() => {
      recorder.emitData(new Blob(['first']))
      recorder.emitData(new Blob(['second']))
    })
    await waitFor(async () => {
      const records = await store.listTakes()
      expect(records).toHaveLength(1)
      expect(records[0]).toMatchObject({ state: 'recording', chunkCount: 2, size: 11 })
      expect(await store.chunkSeqs(records[0].id)).toEqual([0, 1])
    })
    let take: Take | null = null
    await act(async () => { take = await result.current.stop() })
    expect(readBlob).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledTimes(1)
    const completed = onComplete.mock.calls[0][0].take
    expect(completed).toBe(take)
    expect(completed).toMatchObject({ persisted: true, recovered: false })
    expect(await blobText(completed!.blob)).toBe('firstsecond')
    expect((await store.listTakes())[0]).toMatchObject({ state: 'ready', chunkCount: 2, size: 11 })
  })

  it('returns captured footage on error, synchronously goes idle, and completes only once', async () => {
    const store = await opened()
    const onComplete = vi.fn<(result: RecorderCompletion) => void>()
    const { result } = renderHook(() => useRecorder(stream, { store, meta, onComplete }))
    act(() => { result.current.start() })
    const recorder = FakeMediaRecorder.instances[0]
    act(() => {
      recorder.emitData(new Blob(['before failure']))
      recorder.emitError(new DOMException('Device busy', 'NotReadableError'))
    })
    expect(result.current.status).toBe('idle')
    expect(result.current.error?.kind).toBe('camera-busy')
    await act(async () => { await result.current.stop() })
    const { take, reason } = onComplete.mock.calls[0][0]
    expect(reason).toBe('error')
    expect(take).toMatchObject({ recovered: true, persisted: true })
    expect(await blobText(take!.blob)).toBe('before failure')
    act(() => { recorder.emitStop(); recorder.emitError(new Error('Late error')) })
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(recorder.stop).toHaveBeenCalledTimes(1)
  })

  it('includes the browser final chunk dispatched after an error in the same task', async () => {
    const onComplete = vi.fn<(result: RecorderCompletion) => void>()
    const { result } = renderHook(() => useRecorder(stream, { onComplete }))
    act(() => { result.current.start() })
    const recorder = FakeMediaRecorder.instances[0]
    recorder.autoStop = false
    await act(async () => {
      recorder.emitData(new Blob(['before-']))
      recorder.emitError(new Error('Interrupted'))
      recorder.emitData(new Blob(['final']))
      recorder.emitStop()
      await result.current.stop()
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
    const completed = onComplete.mock.calls[0][0]
    expect(completed.reason).toBe('error')
    expect(await blobText(completed.take!.blob)).toBe('before-final')
  })

  it('returns null on an error before any data is captured', async () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() => useRecorder(stream, { onComplete }))
    act(() => { result.current.start() })
    act(() => { FakeMediaRecorder.instances[0].emitError(new Error('No data')) })
    await act(async () => { await expect(result.current.stop()).resolves.toBeNull() })
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({ take: null, reason: 'error' })
  })

  it('delivers an unsolicited stop through the latest callback', async () => {
    const first = vi.fn<(result: RecorderCompletion) => void>()
    const latest = vi.fn<(result: RecorderCompletion) => void>()
    const { result, rerender } = renderHook(({ onComplete }) => useRecorder(stream, { onComplete }), {
      initialProps: { onComplete: first },
    })
    act(() => { result.current.start() })
    rerender({ onComplete: latest })
    await act(async () => {
      FakeMediaRecorder.instances[0].emitData(new Blob(['automatic']))
      FakeMediaRecorder.instances[0].emitStop()
      await result.current.stop()
    })
    expect(first).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledTimes(1)
    expect(latest.mock.calls[0][0]).toMatchObject({ reason: 'auto', take: { recovered: true } })
    expect(await blobText(latest.mock.calls[0][0].take!.blob)).toBe('automatic')
  })

  it.each([1000, undefined])('enforces a %s ms cap and exposes a countdown', async (maxDurationMs) => {
    vi.useFakeTimers()
    const limit = maxDurationMs ?? MAX_TAKE_MS
    const onComplete = vi.fn<(result: RecorderCompletion) => void>()
    const { result } = renderHook(() => useRecorder(stream, { maxDurationMs, onComplete }))
    expect(MAX_TAKE_MS).toBe(15 * 60 * 1000)
    expect(result.current.remainingMs).toBeNull()
    expect(result.current.maxDurationMs).toBe(limit)
    act(() => { result.current.start() })
    const recorder = FakeMediaRecorder.instances[0]
    act(() => {
      recorder.emitData(new Blob(['limited']))
      vi.advanceTimersByTime(250)
    })
    expect(result.current.remainingMs).toBe(limit - 250)
    await act(async () => { await vi.advanceTimersByTimeAsync(limit) })
    expect(recorder.stop).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete.mock.calls[0][0]).toMatchObject({ reason: 'limit', take: { durationMs: limit } })
    expect(result.current.remainingMs).toBeNull()
    expect(result.current.status).toBe('idle')
  })

  it('leaves interrupted recording metadata and chunks intact without delivering a take', async () => {
    const store = await opened()
    const onComplete = vi.fn()
    const { result, unmount } = renderHook(() => useRecorder(stream, { store, meta, onComplete }))
    act(() => { result.current.start() })
    const recorder = FakeMediaRecorder.instances[0]
    act(() => { recorder.emitData(new Blob(['recover me'])) })
    recorder.autoStop = false
    unmount()
    await waitFor(async () => {
      expect((await store.listTakes())[0]).toMatchObject({ state: 'recording', chunkCount: 1, size: 10 })
    })
    expect(onComplete).not.toHaveBeenCalled()
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(recorder.stop).toHaveBeenCalledTimes(1)
  })

  it('joins committed chunks with the RAM tail when subsequent writes fail', async () => {
    const env = createIdbShim()
    const store = await opened(env)
    const onComplete = vi.fn<(result: RecorderCompletion) => void>()
    const { result } = renderHook(() => useRecorder(stream, { store, meta, onComplete }))
    act(() => { result.current.start() })
    const recorder = FakeMediaRecorder.instances[0]
    act(() => { recorder.emitData(new Blob(['disk-'])) })
    await waitFor(async () => { expect((await store.listTakes())[0]?.size).toBe(5) })
    env.failPutsAfter(0)
    act(() => {
      recorder.emitData(new Blob(['memory-']))
      recorder.emitData(new Blob(['tail']))
    })
    await act(async () => { await result.current.stop() })
    const take = onComplete.mock.calls[0][0].take
    expect(take?.persisted).toBe(false)
    expect(await blobText(take!.blob)).toBe('disk-memory-tail')
    expect((await store.listTakes())[0]).toMatchObject({ state: 'recording', size: 5 })
  })
})
