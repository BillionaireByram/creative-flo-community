'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { classifyMediaError, pickMimeType, recordingBitrate, shootError } from './media'
import type { ShootError } from './media'
import type { StoredTake, TakeStore } from './take-store'

export const MAX_TAKE_MS = 15 * 60 * 1000

export interface Take {
  id: string
  blob: Blob
  url: string
  mimeType: string
  durationMs: number
  createdAt: Date
  recovered: boolean
  persisted: boolean
}

export type RecorderStatus = 'idle' | 'recording' | 'stopping'
export type CompletionReason = 'user' | 'auto' | 'error' | 'limit'
export interface RecorderCompletion { take: Take | null; reason: CompletionReason }
export interface RecorderOptions {
  store?: TakeStore | null
  meta?: StoredTake['meta'] | null
  maxDurationMs?: number
  onComplete?: (result: RecorderCompletion) => void
}

export function createRecorder(stream: MediaStream, mime: string | null): MediaRecorder {
  if (typeof MediaRecorder === 'undefined') throw new Error('Video recording is unavailable')
  return new MediaRecorder(stream, {
    ...(mime ? { mimeType: mime } : {}),
    videoBitsPerSecond: recordingBitrate(stream.getVideoTracks()[0]?.getSettings() ?? {}),
  })
}

interface Recording {
  recorder: MediaRecorder
  promise: Promise<Take | null>
  settled: boolean
  finish: (discard?: boolean) => void
  requestStop: (reason: CompletionReason) => void
}

export function useRecorder(stream: MediaStream | null, options: RecorderOptions = {}): {
  status: RecorderStatus
  elapsedMs: number
  remainingMs: number | null
  maxDurationMs: number
  error: ShootError | null
  start: () => boolean
  stop: () => Promise<Take | null>
} {
  const { store, meta, maxDurationMs: requestedMax, onComplete } = options
  const maxDurationMs = requestedMax !== undefined && Number.isFinite(requestedMax) && requestedMax > 0
    ? Math.min(requestedMax, MAX_TAKE_MS) : MAX_TAKE_MS
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [error, setError] = useState<ShootError | null>(null)
  const mounted = useRef(false)
  const current = useRef<Recording | null>(null)
  const completeRef = useRef(onComplete)
  useEffect(() => { completeRef.current = onComplete }, [onComplete])

  useEffect(() => {
    mounted.current = true
    setStatus('idle')
    setElapsedMs(0)
    setError(null)
    return () => {
      mounted.current = false
      const recording = current.current
      current.current = null
      if (!recording || recording.settled) return
      // Never finalize or delete an interrupted recording. The next mount can
      // recover its committed chunks even if this browser sends no stop event.
      recording.finish(true)
      if (recording.recorder.state !== 'inactive') {
        try { recording.recorder.stop() } catch { /* The device may already be gone. */ }
      }
    }
  }, [stream])

  const start = useCallback((): boolean => {
    if (!mounted.current || (current.current && !current.current.settled)) return false
    setError(null)
    const picked = pickMimeType()
    if (!picked) { setError(shootError('unsupported-recorder')); return false }
    const pickedMime: string = picked
    if (!stream) { setError(shootError('no-camera')); return false }

    let recorder: MediaRecorder
    try {
      recorder = createRecorder(stream, picked)
    } catch (err) {
      setError(err instanceof Error && err.name === 'NotSupportedError'
        ? shootError('unsupported-recorder') : classifyMediaError(err))
      return false
    }

    const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const createdAt = new Date()
    const startedAt = performance.now()
    const memory: (Blob | null)[] = []
    let size = 0
    let stoppedAt: number | null = null
    let reason: CompletionReason | null = null
    let finished = false
    let discarded = false
    let timer: ReturnType<typeof setInterval> | null = null
    let limitTimer: ReturnType<typeof setTimeout> | null = null
    let errorTimer: ReturnType<typeof setTimeout> | null = null
    let healthy = Boolean(store && meta)
    let writes: Promise<void> = Promise.resolve()
    if (store && meta) {
      writes = writes.then(() => store.beginTake({
        id, state: 'recording', createdAt: createdAt.getTime(), mimeType: recorder.mimeType || pickedMime,
        durationMs: 0, recovered: false, chunkCount: 0, size: 0, meta, kept: false,
        upload: { session: null, partsDone: 0, percent: 0 },
      })).catch(() => { healthy = false })
    }

    let resolveTake!: (take: Take | null) => void
    const promise = new Promise<Take | null>((resolve) => { resolveTake = resolve })
    const clearTimers = () => {
      if (timer !== null) clearInterval(timer)
      if (limitTimer !== null) clearTimeout(limitTimer)
      if (errorTimer !== null) clearTimeout(errorTimer)
    }
    const onData = (event: BlobEvent) => {
      if (finished || event.data.size === 0) return
      const blob = event.data
      const seq = memory.length
      memory.push(blob)
      size += blob.size
      if (store) {
        writes = writes.then(async () => {
          if (!healthy) return
          await store.putChunk(id, seq, blob)
          memory[seq] = null
        }).catch(() => { healthy = false })
      }
    }
    const onStop = () => recording.finish()
    const onError = (event: Event) => {
      if (mounted.current) setError(classifyMediaError('error' in event ? event.error : event))
      reason = 'error'
      stoppedAt ??= performance.now()
      // MediaRecorder can dispatch error, final data, then stop in one task.
      // Keep listening through that task to salvage the final chunk too.
      if (recorder.state !== 'inactive') {
        try { recorder.stop() } catch { /* The device may already be gone. */ }
      }
      if (!finished) errorTimer = setTimeout(() => recording.finish(), 0)
      if (mounted.current) setStatus('idle')
    }

    async function assemble(durationMs: number, completionReason: CompletionReason) {
      let take: Take | null = null
      try {
        await writes
        if (discarded || !mounted.current) return
        const mimeType = recorder.mimeType || pickedMime
        let recovered = completionReason === 'error' || completionReason === 'auto'
        const chunkCount = memory.length
        let persisted = false
        if (healthy && store) {
          try {
            await store.finalizeTake(id, { state: 'ready', mimeType, durationMs, recovered, chunkCount, size })
            persisted = true
          } catch {
            healthy = false
          }
        }
        if (discarded || !mounted.current) return
        let blob: Blob
        if (memory.every((chunk) => chunk !== null)) {
          blob = new Blob(memory.filter((chunk): chunk is Blob => chunk !== null), { type: mimeType })
        } else {
          try {
            if (!store) throw new Error('Take storage is unavailable')
            if (healthy) {
              blob = await store.readBlob(id, mimeType)
            } else {
              // A failed write leaves a disk prefix and a RAM tail. Preserve
              // sequence order instead of appending an entire stored blob twice.
              const parts: BlobPart[] = []
              for (let seq = 0; seq < memory.length; seq += 1) {
                const part = memory[seq] ?? await store.readChunk(id, seq)
                if (part === undefined) { recovered = true; persisted = false }
                else parts.push(part)
              }
              blob = new Blob(parts, { type: mimeType })
            }
            if (blob.size !== size) { recovered = true; persisted = false }
          } catch {
            blob = new Blob(memory.filter((chunk): chunk is Blob => chunk !== null), { type: mimeType })
            recovered = true
            persisted = false
          }
        }
        if (discarded || !mounted.current) return
        if (blob.size === 0 && (size > 0 || completionReason === 'error')) {
          if (size > 0) setError(shootError('unknown'))
          return
        }
        take = { id, blob, url: URL.createObjectURL(blob), mimeType, durationMs, createdAt, recovered, persisted }
      } catch (err) {
        if (mounted.current && !discarded) setError(classifyMediaError(err))
      } finally {
        memory.length = 0
        recording.settled = true
        resolveTake(take)
        if (!discarded && mounted.current) completeRef.current?.({ take, reason: completionReason })
      }
    }

    const recording: Recording = {
      recorder, promise, settled: false,
      finish(discard = false) {
        if (discard) {
          discarded = true
          resolveTake(null)
        }
        if (finished) return
        finished = true
        clearTimers()
        recorder.removeEventListener('dataavailable', onData)
        recorder.removeEventListener('stop', onStop)
        recorder.removeEventListener('error', onError)
        const durationMs = Math.max(0, (stoppedAt ?? performance.now()) - startedAt)
        // This is synchronous even though draining IDB and assembling is not.
        if (mounted.current && !discarded) {
          setStatus('idle')
          setElapsedMs(durationMs)
        }
        void assemble(durationMs, reason ?? 'auto')
      },
      requestStop(nextReason) {
        if (finished || stoppedAt !== null) return
        reason = nextReason
        stoppedAt = performance.now()
        clearTimers()
        if (mounted.current) setStatus('stopping')
        try {
          // An inactive recorder can still have final data/stop events queued.
          if (recorder.state !== 'inactive') recorder.stop()
        } catch (err) {
          if (mounted.current) setError(classifyMediaError(err))
          reason = 'error'
          recording.finish()
        }
      },
    }
    current.current = recording
    recorder.addEventListener('dataavailable', onData)
    recorder.addEventListener('stop', onStop)
    recorder.addEventListener('error', onError)
    try {
      recorder.start(1000)
      if (finished) return false
      setStatus('recording')
      setElapsedMs(0)
      timer = setInterval(() => {
        const elapsed = Math.max(0, performance.now() - startedAt)
        if (mounted.current) setElapsedMs(elapsed)
        if (elapsed >= maxDurationMs) recording.requestStop('limit')
      }, 250)
      limitTimer = setTimeout(() => recording.requestStop('limit'), maxDurationMs)
      return true
    } catch (err) {
      reason = 'error'
      recording.finish()
      setError(classifyMediaError(err))
      return false
    }
  }, [stream, store, meta, maxDurationMs])

  const stop = useCallback((): Promise<Take | null> => {
    const recording = current.current
    if (!recording) return Promise.resolve(null)
    recording.requestStop('user')
    return recording.promise
  }, [])

  return { status, elapsedMs, error, start, stop, maxDurationMs,
    remainingMs: status === 'idle' ? null : Math.max(0, maxDurationMs - elapsedMs) }
}
