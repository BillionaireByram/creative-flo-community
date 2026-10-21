import { api, ApiError } from '@/lib/api'
import { uploadAllParts } from '@/stores/upload-store'
import { uploadMimeType } from './media'

export type TakeUploadPhase = 'idle' | 'initiating' | 'uploading' | 'completing' | 'done' | 'failed'

export interface TakeUploadSession {
  upload_id: string
  s3_key: string
  asset_id: string
  version_id: string
  chunk_size_bytes: number
}

export interface TakeUploadParams {
  blob: Blob
  mimeType: string
  projectId: string
  folderId: string
  assetName: string
  fileName: string
  onProgress?: (percent: number) => void
  signal?: AbortSignal
  session?: TakeUploadSession | null
  onSession?: (s: TakeUploadSession) => void
  concurrency?: number
}

export interface TakeUploadResult {
  asset_id: string
  version_id: string
  project_id: string
}

interface ResumeInfo extends TakeUploadSession {
  state: 'resumable' | 'assembled'
  file_size_bytes: number
  original_filename: string
  mime_type: string
  held_part_numbers: number[]
  last_activity_at?: string | null
}

async function hasCompleted(session: TakeUploadSession): Promise<boolean> {
  try {
    const asset = await api.get<{
      latest_version?: { id: string; processing_status: string } | null
    }>(`/assets/${encodeURIComponent(session.asset_id)}`)
    const version = asset.latest_version
    return !!version && version.id === session.version_id && !!version.processing_status
      && version.processing_status !== 'uploading' && version.processing_status !== 'failed'
  } catch {
    // A failed readback is not evidence that completion landed.
    return false
  }
}

function expiredUpload(): Error & { restart: true } {
  return Object.assign(new Error("This take's upload expired. Tap Retry to start it again."), { restart: true as const })
}

export async function uploadTake(p: TakeUploadParams): Promise<TakeUploadResult> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const checkAborted = () => {
    if (controller.signal.aborted) throw new DOMException('Upload cancelled', 'AbortError')
  }
  if (p.signal?.aborted) abort()
  else p.signal?.addEventListener('abort', abort, { once: true })

  const done = (session: TakeUploadSession): TakeUploadResult => {
    p.onProgress?.(100)
    return { asset_id: session.asset_id, version_id: session.version_id, project_id: p.projectId }
  }

  try {
    checkAborted()
    const bareMime = uploadMimeType(p.mimeType)
    let session: TakeUploadSession
    let held: number[] = []
    let assembled = false
    if (p.session) {
      let info: ResumeInfo
      try {
        info = await api.get<ResumeInfo>(`/upload/${encodeURIComponent(p.session.version_id)}/parts`)
      } catch (err) {
        checkAborted()
        if (err instanceof ApiError && (err.status === 404 || err.status === 409)) {
          if (await hasCompleted(p.session)) return done(p.session)
          throw expiredUpload()
        }
        throw err
      }
      session = {
        upload_id: info.upload_id,
        s3_key: info.s3_key,
        asset_id: info.asset_id,
        version_id: info.version_id,
        chunk_size_bytes: info.chunk_size_bytes,
      }
      p.onSession?.(session)
      assembled = info.state === 'assembled'
      if (!assembled) {
        if (p.blob.size !== info.file_size_bytes || p.fileName !== info.original_filename) {
          throw new Error('This take does not match the saved upload. The take is still here.')
        }
        held = info.held_part_numbers
      }
    } else {
      session = await api.post<TakeUploadSession>('/upload/initiate', {
        project_id: p.projectId,
        asset_name: p.assetName,
        original_filename: p.fileName,
        file_size_bytes: p.blob.size,
        mime_type: bareMime,
        folder_id: p.folderId,
      })
      // Keep this even if the caller cancels during initiation: Retry can use it.
      p.onSession?.(session)
    }

    checkAborted()
    let parts: Array<{ PartNumber: number; ETag: string }> = []
    if (!assembled) {
      if (!Number.isSafeInteger(session.chunk_size_bytes) || session.chunk_size_bytes <= 0) {
        throw new Error('The upload could not start. The take is still here. Tap Retry.')
      }
      const concurrency = p.concurrency === undefined || !Number.isFinite(p.concurrency)
        ? undefined : Math.max(1, Math.floor(p.concurrency))
      parts = await uploadAllParts(
        new File([p.blob], p.fileName, { type: bareMime }),
        session.s3_key,
        session.upload_id,
        controller,
        (percent) => p.onProgress?.(percent),
        concurrency,
        { chunkSize: session.chunk_size_bytes, alreadyHeld: held },
      )
    }

    checkAborted()
    try {
      await api.post('/upload/complete', {
        s3_key: session.s3_key,
        upload_id: session.upload_id,
        asset_id: session.asset_id,
        version_id: session.version_id,
        // A partial list can silently assemble a truncated object. Let the
        // server list all parts whenever this attempt skipped held parts.
        parts: held.length > 0 ? [] : parts,
      })
    } catch (err) {
      if (!(await hasCompleted(session))) throw err
    }
    return done(session)
  } finally {
    p.signal?.removeEventListener('abort', abort)
  }
}

export function partRanges(size: number, chunkSize: number): Array<{ partNumber: number; start: number; end: number }> {
  if (!Number.isSafeInteger(size) || size < 0) throw new RangeError('Size must be a non-negative integer')
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) throw new RangeError('Chunk size must be a positive integer')
  return Array.from({ length: Math.ceil(size / chunkSize) }, (_, index) => ({
    partNumber: index + 1,
    start: index * chunkSize,
    end: Math.min((index + 1) * chunkSize, size),
  }))
}

export function describeUploadError(err: unknown, { stored }: { stored: boolean }): string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return stored
      ? "You're offline. The take is safe on this phone. Tap Retry when you're back online."
      : "You're offline. The take is still here, keep this screen open. Tap Retry when you're back online."
  }
  if (err instanceof ApiError && err.status === 403) {
    return 'You do not have permission to upload to this brand. The take is still here.'
  }
  if (err instanceof ApiError && err.status === 413) {
    return 'This take is too big to upload. Save it to your phone and try a shorter take. The take is still here.'
  }
  if (err instanceof Error && 'restart' in err && err.restart === true) {
    return `${err.message} The take is still here.`
  }
  return 'The upload did not finish. Tap Retry to try again. The take is still here.'
}
