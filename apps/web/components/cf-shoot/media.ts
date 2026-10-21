export const MIME_PREFERENCE = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'] as const

export function pickMimeType(isTypeSupported?: (m: string) => boolean): string | null {
  const supports = isTypeSupported ?? (
    typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
      ? (mime: string) => MediaRecorder.isTypeSupported(mime)
      : null
  )
  return supports ? MIME_PREFERENCE.find((mime) => supports(mime)) ?? null : null
}

export function uploadMimeType(recorderMime: string): 'video/mp4' | 'video/webm' {
  return recorderMime.split(';')[0].trim().toLowerCase().includes('mp4') ? 'video/mp4' : 'video/webm'
}

export function fileExtension(mime: string): 'mp4' | 'webm' {
  return uploadMimeType(mime) === 'video/mp4' ? 'mp4' : 'webm'
}

export type ShootErrorKind = 'insecure' | 'unsupported-camera' | 'unsupported-recorder'
  | 'permission-denied' | 'no-camera' | 'camera-busy' | 'constraints' | 'unknown'

export interface ShootError {
  kind: ShootErrorKind
  title: string
  message: string
  retryable: boolean
}

const ERROR_COPY: Record<ShootErrorKind, Omit<ShootError, 'kind'>> = {
  insecure: {
    title: 'Camera needs a secure connection',
    message: 'Open Creative Flo over its https:// address on the tailnet. Browsers block the camera on plain http.',
    retryable: false,
  },
  'unsupported-camera': {
    title: 'This browser cannot open the camera',
    message: 'Open Creative Flo in Safari on iPhone or in Chrome to use your camera.',
    retryable: false,
  },
  'unsupported-recorder': {
    title: "This browser can't record video",
    message: 'Use Safari on iPhone or an up-to-date version of Chrome to record a take.',
    retryable: false,
  },
  'permission-denied': {
    title: 'Camera access is blocked',
    message: 'Allow camera and microphone access. In Safari, tap aA > Website Settings > Camera and Microphone. In Chrome, tap the lock icon > Permissions. Then try again.',
    retryable: true,
  },
  'no-camera': {
    title: 'No camera found',
    message: 'Connect a camera and microphone, or open Creative Flo on your phone. Then try again.',
    retryable: true,
  },
  'camera-busy': {
    title: 'Camera is in use by another app',
    message: 'Close FaceTime, Zoom, or any other app using the camera, then try again.',
    retryable: true,
  },
  constraints: {
    title: 'This camera cannot use these settings',
    message: 'Try the other camera or open Creative Flo in Safari or Chrome.',
    retryable: true,
  },
  unknown: {
    title: 'Something interrupted the camera',
    message: 'Try again. If the camera still will not start, close other camera apps and reopen Creative Flo.',
    retryable: true,
  },
}

export function shootError(kind: ShootErrorKind): ShootError {
  return { kind, ...ERROR_COPY[kind] }
}

export function classifyMediaError(err: unknown): ShootError {
  const name = err !== null && typeof err === 'object' && 'name' in err ? err.name : null
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return shootError('permission-denied')
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return shootError('no-camera')
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return shootError('camera-busy')
    case 'OverconstrainedError': {
      const constraint = err !== null && typeof err === 'object' && 'constraint' in err ? err.constraint : null
      // Structural read: a DOMException is not always `instanceof Error` (jsdom, older WebKit).
      const message = err !== null && typeof err === 'object' && 'message' in err && typeof err.message === 'string' ? err.message : ''
      const noDevice = constraint === 'deviceId' || /(?:no|missing|not found|unavailable).*device|device.*(?:not found|unavailable)|no camera/i.test(message)
      return shootError(noDevice ? 'no-camera' : 'constraints')
    }
    default:
      return shootError('unknown')
  }
}

export function environmentError(env?: {
  isSecureContext?: boolean
  hasMediaDevices?: boolean
  hasMediaRecorder?: boolean
}): ShootError | null {
  const secure = env?.isSecureContext ?? (typeof window !== 'undefined' && window.isSecureContext === true)
  const camera = env?.hasMediaDevices ?? (
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
  )
  const recorder = env?.hasMediaRecorder ?? (typeof MediaRecorder !== 'undefined')
  if (!secure) return shootError('insecure')
  if (!camera) return shootError('unsupported-camera')
  if (!recorder) return shootError('unsupported-recorder')
  return null
}

export function videoConstraints(facing: 'user' | 'environment', quality: '4k' | '1080p'): MediaStreamConstraints {
  return {
    video: {
      facingMode: facing,
      width: { ideal: quality === '4k' ? 2160 : 1080 },
      height: { ideal: quality === '4k' ? 3840 : 1920 },
      frameRate: { ideal: 30 },
    },
    audio: { echoCancellation: true, noiseSuppression: true },
  }
}

export function recordingBitrate(settings: MediaTrackSettings): number {
  const shortSide = Math.min(settings.width ?? 0, settings.height ?? 0)
  return shortSide >= 2000 ? 20_000_000 : 12_000_000
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds / 60) % 60
  const tail = String(seconds % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${tail}` : `${minutes}:${tail}`
}
