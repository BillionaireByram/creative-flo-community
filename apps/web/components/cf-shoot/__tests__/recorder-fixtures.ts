import { vi } from 'vitest'
import type { BlurConstraints } from '../studio-look'
import type { StoredTake } from '../take-store'

export class FakeMediaRecorder extends EventTarget {
  static instances: FakeMediaRecorder[] = []
  static isTypeSupported = vi.fn((mime: string) => mime === 'video/mp4')
  state: RecordingState = 'inactive'
  mimeType: string
  autoStop = true
  timeslice: number | undefined
  finalChunk: Blob | null = null

  constructor(readonly stream: MediaStream, readonly options: MediaRecorderOptions = {}) {
    super()
    this.mimeType = options.mimeType ?? 'video/mp4'
    FakeMediaRecorder.instances.push(this)
  }
  start = vi.fn((timeslice?: number) => { this.timeslice = timeslice; this.state = 'recording' })
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
  }
  emitStop() {
    this.state = 'inactive'
    this.dispatchEvent(new Event('stop'))
  }
  emitError(error: Error) {
    const event = new Event('error')
    Object.defineProperty(event, 'error', { value: error })
    this.dispatchEvent(event)
  }
}

export const brand = { brand: 'demo', project_id: 'project-1', project_name: 'Sample Creator', role: 'owner' }
export const meta: StoredTake['meta'] = { brand, idea: null, title: 'My script', text: 'Hello camera' }
export const stream = { getTracks: () => [], getVideoTracks: () => [] } as unknown as MediaStream

export function storedTake(patch: Partial<StoredTake> = {}): StoredTake {
  return {
    id: 'take-1', state: 'recording', createdAt: 1_700_000_000_000, mimeType: 'video/mp4',
    durationMs: 0, recovered: false, chunkCount: 0, size: 0, meta, kept: false,
    upload: { session: null, partsDone: 0, percent: 0 }, ...patch,
  }
}

// jsdom's Blob need not implement text()/arrayBuffer(). FileReader is supported.
export function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

const overrides: Array<{ target: object; key: PropertyKey; descriptor: PropertyDescriptor | undefined }> = []
export function setProperty(target: object, key: PropertyKey, value: unknown) {
  overrides.push({ target, key, descriptor: Object.getOwnPropertyDescriptor(target, key) })
  Object.defineProperty(target, key, { configurable: true, writable: true, value })
}
export function restoreProperties() {
  for (const { target, key, descriptor } of overrides.reverse()) {
    if (descriptor) Object.defineProperty(target, key, descriptor)
    else Reflect.deleteProperty(target, key)
  }
  overrides.length = 0
}

export class FakeVideoTrack extends EventTarget {
  settings: MediaTrackSettings & { backgroundBlur?: boolean } = { width: 1080, height: 1920 }
  capabilities: MediaTrackCapabilities & { backgroundBlur?: boolean[] } = {}
  constraints: MediaTrackConstraints = {}
  getSettings = vi.fn(() => this.settings)
  getCapabilities = vi.fn(() => this.capabilities)
  getConstraints = vi.fn(() => this.constraints)
  applyConstraints = vi.fn<(constraints: BlurConstraints) => Promise<void>>().mockResolvedValue(undefined)
}

export function videoStream(track: FakeVideoTrack): MediaStream {
  return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream
}
