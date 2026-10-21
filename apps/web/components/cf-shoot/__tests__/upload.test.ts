import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  api: { post: vi.fn(), get: vi.fn() },
  ApiError: class ApiError extends Error {
    status: number
    detail: string
    constructor(status: number, detail: string) {
      super(detail)
      this.name = 'ApiError'
      this.status = status
      this.detail = detail
    }
  },
}))

import { api, ApiError } from '@/lib/api'
import { describeUploadError, partRanges, uploadTake } from '../upload'
import type { TakeUploadParams, TakeUploadSession } from '../upload'

const session: TakeUploadSession = {
  upload_id: 'upload-1', s3_key: 'raw/take.webm', asset_id: 'asset-1',
  version_id: 'version-1', chunk_size_bytes: 4,
}
const uploaded = { asset_id: 'asset-1', version_id: 'version-1', project_id: 'project-1' }
const put = vi.fn<typeof fetch>()
const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch')
const originalOnline = Object.getOwnPropertyDescriptor(navigator, 'onLine')

function params(overrides: Partial<TakeUploadParams> = {}): TakeUploadParams {
  return {
    blob: new Blob(['0123456789'], { type: 'video/webm;codecs=vp9,opus' }),
    mimeType: 'video/webm;codecs=vp9,opus', projectId: 'project-1', folderId: 'content-bin',
    assetName: 'Take · My script', fileName: 'take.webm', concurrency: 1, ...overrides,
  }
}

function resumeInfo(overrides: Record<string, unknown> = {}) {
  return {
    ...session, state: 'resumable', file_size_bytes: 10, original_filename: 'take.webm',
    mime_type: 'video/webm', held_part_numbers: [], last_activity_at: null, ...overrides,
  }
}

function response(status = 200, etag = '"etag"'): Response {
  return {
    ok: status >= 200 && status < 300, status,
    statusText: status === 503 ? 'Service Unavailable' : 'OK',
    headers: { get: (name: string) => name.toLowerCase() === 'etag' ? etag : null },
  } as Response
}

function postReply(path: string, body?: unknown): unknown {
  if (path === '/upload/initiate') return session
  if (path === '/upload/presign-part') {
    return { presigned_url: `https://storage.example/part-${(body as { part_number: number }).part_number}` }
  }
  if (path === '/upload/complete') return {}
  throw new Error(`Unexpected POST ${path}`)
}

function completionBody() {
  const call = vi.mocked(api.post).mock.calls.find(([path]) => path === '/upload/complete')
  expect(call).toBeDefined()
  return call?.[1] as {
    s3_key: string; upload_id: string; asset_id: string; version_id: string
    parts: Array<{ PartNumber: number; ETag: string }>
  }
}

function sentParts(): number[] {
  return put.mock.calls.map(([url]) => Number(String(url).split('-').pop()))
}

beforeEach(() => {
  vi.resetAllMocks()
  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: put })
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  put.mockImplementation(async (url) => response(200, `"etag-${String(url).split('-').pop()}"`))
  vi.mocked(api.post).mockImplementation(async (path: string, body?: unknown) => postReply(path, body) as never)
  vi.mocked(api.get).mockResolvedValue(resumeInfo())
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  if (originalFetch) Object.defineProperty(globalThis, 'fetch', originalFetch)
  else Reflect.deleteProperty(globalThis, 'fetch')
  if (originalOnline) Object.defineProperty(navigator, 'onLine', originalOnline)
  else Reflect.deleteProperty(navigator, 'onLine')
})

describe('partRanges', () => {
  it('splits an exact multiple without an extra empty part', () => {
    expect(partRanges(8, 4)).toEqual([
      { partNumber: 1, start: 0, end: 4 }, { partNumber: 2, start: 4, end: 8 },
    ])
  })

  it('includes the remainder and handles a single short part', () => {
    expect(partRanges(10, 4)).toEqual([
      { partNumber: 1, start: 0, end: 4 }, { partNumber: 2, start: 4, end: 8 },
      { partNumber: 3, start: 8, end: 10 },
    ])
    expect(partRanges(2, 4)).toEqual([{ partNumber: 1, start: 0, end: 2 }])
  })

  it.each([[3, 43], [5, 72]])('cuts a %s-minute 20 Mbps take into %s server-sized parts', (minutes, count) => {
    const size = 20_000_000 / 8 * 60 * minutes
    const ranges = partRanges(size, 10 * 1024 * 1024)
    expect(ranges).toHaveLength(count)
    expect(ranges[0].start).toBe(0)
    expect(ranges.at(-1)?.end).toBe(size)
    expect(ranges.reduce((bytes, part) => bytes + part.end - part.start, 0)).toBe(size)
  })

  it('has no ranges for an empty blob', () => {
    expect(partRanges(0, 4)).toEqual([])
  })

  it('rejects invalid sizes instead of producing an unbounded loop', () => {
    expect(() => partRanges(10, 0)).toThrow(RangeError)
    expect(() => partRanges(-1, 4)).toThrow(RangeError)
  })
})

describe('uploadTake', () => {
  it('initiates with a bare MIME, project, folder, original name and byte size', async () => {
    const onSession = vi.fn()
    const onProgress = vi.fn()
    const p = params({ onSession, onProgress, concurrency: 3 })
    await expect(uploadTake(p)).resolves.toEqual(uploaded)
    expect(api.post).toHaveBeenCalledWith('/upload/initiate', {
      project_id: 'project-1', folder_id: 'content-bin', asset_name: 'Take · My script',
      original_filename: 'take.webm', file_size_bytes: 10, mime_type: 'video/webm',
    })
    expect(onSession).toHaveBeenCalledWith(session)
    expect(onSession.mock.invocationCallOrder[0]).toBeLessThan(put.mock.invocationCallOrder[0])
    expect(put).toHaveBeenCalledTimes(partRanges(p.blob.size, 4).length)
    expect(put.mock.calls.map(([, options]) => (options?.body as Blob).size)).toEqual([4, 4, 2])
    for (const [, options] of put.mock.calls) expect(options?.method).toBe('PUT')
    expect(completionBody()).toEqual({
      s3_key: session.s3_key, upload_id: session.upload_id,
      asset_id: session.asset_id, version_id: session.version_id,
      parts: [
        { PartNumber: 1, ETag: '"etag-1"' }, { PartNumber: 2, ETag: '"etag-2"' },
        { PartNumber: 3, ETag: '"etag-3"' },
      ],
    })
    expect(onProgress).toHaveBeenLastCalledWith(100)
  })

  it('keeps completion parts ordered when PUTs finish out of order', async () => {
    vi.useFakeTimers()
    const finishOrder: number[] = []
    put.mockImplementation(async (url) => {
      const part = Number(String(url).split('-').pop())
      await new Promise<void>((resolve) => setTimeout(resolve, (4 - part) * 10))
      finishOrder.push(part)
      return response(200, `"etag-${part}"`)
    })
    const pending = uploadTake(params({ concurrency: 3 }))
    await vi.advanceTimersByTimeAsync(30)
    await pending
    expect(finishOrder).toEqual([3, 2, 1])
    expect(completionBody().parts.map((part) => part.PartNumber)).toEqual([1, 2, 3])
  })

  it('retries a 503 once after the deterministic backoff, then completes', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    put.mockResolvedValueOnce(response(503)).mockResolvedValue(response())
    const pending = uploadTake(params({ blob: new Blob(['abc']) }))
    await vi.advanceTimersByTimeAsync(0)
    expect(put).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1999)
    expect(put).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(pending).resolves.toEqual(uploaded)
    expect(sentParts()).toEqual([1, 1])
    expect(api.post).toHaveBeenCalledWith('/upload/presign-part', {
      s3_key: session.s3_key, upload_id: session.upload_id, part_number: 1,
    })
  })

  it('preserves the session after a network drop and resumes only missing parts', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const onSession = vi.fn<(s: TakeUploadSession) => void>()
    put.mockImplementation(async (url) => {
      if (String(url).endsWith('part-1')) return response()
      throw new TypeError('Network connection lost')
    })
    // Attach the rejection assertion before advancing timers to avoid an
    // unhandled-rejection report while all eight real helper attempts run.
    const failed = expect(uploadTake(params({ onSession }))).rejects.toThrow('Network connection lost')
    await vi.advanceTimersByTimeAsync(254_000)
    await failed
    expect(put).toHaveBeenCalledTimes(9)
    expect(sentParts()).toEqual([1, 2, 2, 2, 2, 2, 2, 2, 2])
    expect(onSession).toHaveBeenCalledWith(session)
    expect(api.post).not.toHaveBeenCalledWith('/upload/complete', expect.anything())
    expect(api.post).not.toHaveBeenCalledWith('/upload/abort', expect.anything())

    const saved = onSession.mock.calls[0][0]
    put.mockReset().mockResolvedValue(response())
    vi.mocked(api.post).mockClear()
    vi.mocked(api.get).mockResolvedValue(resumeInfo({ held_part_numbers: [1] }))
    await expect(uploadTake(params({ session: saved }))).resolves.toEqual(uploaded)
    expect(api.get).toHaveBeenCalledWith('/upload/version-1/parts')
    expect(sentParts()).toEqual([2, 3])
    expect(api.post).not.toHaveBeenCalledWith('/upload/initiate', expect.anything())
    expect(completionBody().parts).toEqual([])
  })

  it('uses the server session and pinned chunk size on resume with nothing held', async () => {
    vi.mocked(api.get).mockResolvedValue(resumeInfo({ upload_id: 'server-upload', s3_key: 'server-key', chunk_size_bytes: 3 }))
    const onSession = vi.fn()
    await uploadTake(params({ session, onSession }))
    expect(put).toHaveBeenCalledTimes(4)
    expect(put.mock.calls.map(([, options]) => (options?.body as Blob).size)).toEqual([3, 3, 3, 1])
    expect(completionBody()).toMatchObject({ s3_key: 'server-key', upload_id: 'server-upload' })
    expect(completionBody().parts.map((part) => part.PartNumber)).toEqual([1, 2, 3, 4])
    expect(onSession).toHaveBeenCalledWith(expect.objectContaining({ upload_id: 'server-upload', chunk_size_bytes: 3 }))
  })

  it('skips holes as well as prefixes in held part numbers', async () => {
    vi.mocked(api.get).mockResolvedValue(resumeInfo({ held_part_numbers: [1, 3] }))
    await uploadTake(params({ session }))
    expect(sentParts()).toEqual([2])
    expect(completionBody().parts).toEqual([])
  })

  it('completes an assembled upload without PUTs or requiring the original file size', async () => {
    vi.mocked(api.get).mockResolvedValue(resumeInfo({ state: 'assembled' }))
    await expect(uploadTake(params({ session, blob: new Blob(['x']), fileName: 'renamed.webm' })))
      .resolves.toEqual(uploaded)
    expect(put).not.toHaveBeenCalled()
    expect(completionBody().parts).toEqual([])
  })

  it.each([404, 409])('reconciles a parts %s with the exact ready version', async (status) => {
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(status, 'No longer uploading'))
      .mockResolvedValueOnce({ latest_version: { id: session.version_id, processing_status: 'ready' } })
    const onProgress = vi.fn()
    await expect(uploadTake(params({ session, onProgress }))).resolves.toEqual(uploaded)
    expect(api.get).toHaveBeenLastCalledWith('/assets/asset-1')
    expect(put).not.toHaveBeenCalled()
    expect(api.post).not.toHaveBeenCalled()
    expect(onProgress).toHaveBeenLastCalledWith(100)
  })

  it.each([
    ['older-version', 'ready'], [session.version_id, 'uploading'], [session.version_id, 'failed'],
  ])('requests a fresh retry when readback is %s / %s', async (id, processing_status) => {
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(409, 'Expired'))
      .mockResolvedValueOnce({ latest_version: { id, processing_status } })
    await expect(uploadTake(params({ session }))).rejects.toMatchObject({
      message: "This take's upload expired. Tap Retry to start it again.", restart: true,
    })
    expect(put).not.toHaveBeenCalled()
  })

  it('keeps transient parts errors resumable without starting a new upload', async () => {
    const unavailable = new ApiError(503, 'Try later')
    vi.mocked(api.get).mockRejectedValue(unavailable)
    await expect(uploadTake(params({ session }))).rejects.toBe(unavailable)
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('checks whether completion landed when its response was lost', async () => {
    vi.mocked(api.post).mockImplementation(async (path: string, body?: unknown) => {
      if (path === '/upload/complete') throw new TypeError('Connection lost')
      return postReply(path, body) as never
    })
    vi.mocked(api.get).mockResolvedValue({ latest_version: { id: session.version_id, processing_status: 'processing' } })
    await expect(uploadTake(params())).resolves.toEqual(uploaded)
    expect(api.get).toHaveBeenCalledWith('/assets/asset-1')
  })

  it('rethrows the original completion error when readback is unconfirmed', async () => {
    const original = new ApiError(503, 'Completion failed')
    vi.mocked(api.post).mockImplementation(async (path: string, body?: unknown) => {
      if (path === '/upload/complete') throw original
      return postReply(path, body) as never
    })
    vi.mocked(api.get).mockRejectedValue(new TypeError('Offline'))
    await expect(uploadTake(params())).rejects.toBe(original)
  })

  it('does not initiate for an already cancelled request', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(uploadTake(params({ signal: controller.signal }))).rejects.toMatchObject({ name: 'AbortError' })
    expect(api.post).not.toHaveBeenCalled()
  })

  it('forwards cancellation to PUTs and retains the initiated session', async () => {
    const controller = new AbortController()
    const onSession = vi.fn()
    put.mockImplementation(async (_url, options) => {
      controller.abort()
      expect(options?.signal?.aborted).toBe(true)
      throw new DOMException('Cancelled', 'AbortError')
    })
    await expect(uploadTake(params({ signal: controller.signal, onSession })))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(onSession).toHaveBeenCalledWith(session)
    expect(put).toHaveBeenCalledTimes(1)
    expect(api.post).not.toHaveBeenCalledWith('/upload/complete', expect.anything())
    expect(api.post).not.toHaveBeenCalledWith('/upload/abort', expect.anything())
  })
})

describe('upload error copy', () => {
  it('explains offline recovery without implying the take was lost', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    expect(describeUploadError(new TypeError('Failed to fetch'), { stored: true }))
      .toBe("You're offline. The take is safe on this phone. Tap Retry when you're back online.")
  })

  it('does not promise durability when the take is only in memory', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    expect(describeUploadError(new TypeError('Offline'), { stored: false }))
      .toContain('The take is still here, keep this screen open.')
    expect(describeUploadError(null, { stored: false })).not.toContain('safe on this phone')
  })

  it('explains permission, size and generic errors', () => {
    expect(describeUploadError(new ApiError(403, 'Forbidden'), { stored: false })).toContain('permission to upload to this brand')
    expect(describeUploadError(new ApiError(413, 'Too large'), { stored: false })).toContain('too big')
    for (const err of [new ApiError(500, 'Internal details'), new Error('Oops'), null]) {
      expect(describeUploadError(err, { stored: false })).toContain('Tap Retry')
      expect(describeUploadError(err, { stored: false })).toContain('The take is still here.')
    }
  })
})
