import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MIME_PREFERENCE, classifyMediaError, environmentError, fileExtension,
  formatDuration, pickMimeType, recordingBitrate, shootError, uploadMimeType, videoConstraints,
} from '../media'
import type { ShootErrorKind } from '../media'

const recorderDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'MediaRecorder')

afterEach(() => {
  if (recorderDescriptor) Object.defineProperty(globalThis, 'MediaRecorder', recorderDescriptor)
  else Reflect.deleteProperty(globalThis, 'MediaRecorder')
  vi.restoreAllMocks()
})

describe('recording formats', () => {
  it('chooses MP4 on iOS when only MP4 is supported', () => {
    expect(pickMimeType((mime) => mime === 'video/mp4')).toBe('video/mp4')
  })

  it('prefers MP4 in Chrome when all formats are supported', () => {
    const supports = vi.fn(() => true)
    expect(pickMimeType(supports)).toBe(MIME_PREFERENCE[0])
    expect(supports).toHaveBeenCalledTimes(1)
  })

  it('chooses VP9 WebM in Firefox when only WebM formats are supported', () => {
    expect(pickMimeType((mime) => mime.startsWith('video/webm'))).toBe('video/webm;codecs=vp9,opus')
  })

  it('falls back to plain WebM when the codec-specific format is unsupported', () => {
    expect(pickMimeType((mime) => mime === 'video/webm')).toBe('video/webm')
  })

  it('returns null when no format is supported', () => {
    expect(pickMimeType(() => false)).toBeNull()
  })

  it('guards missing MediaRecorder and its optional support probe', () => {
    Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: undefined })
    expect(pickMimeType()).toBeNull()
    Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: class {} })
    expect(pickMimeType()).toBeNull()
  })

  it('uses the browser support probe by default', () => {
    const isTypeSupported = vi.fn((mime: string) => mime === 'video/webm')
    Object.defineProperty(globalThis, 'MediaRecorder', {
      configurable: true, value: { isTypeSupported },
    })
    expect(pickMimeType()).toBe('video/webm')
    expect(isTypeSupported.mock.calls.map(([mime]) => mime)).toEqual([...MIME_PREFERENCE])
  })

  it.each([
    ['video/webm;codecs=vp9,opus', 'video/webm', 'webm'],
    ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'mp4'],
    [' VIDEO/MP4 ; codecs=h264', 'video/mp4', 'mp4'],
    ['video/x-mp4', 'video/mp4', 'mp4'],
    ['video/webm;codecs=mp4a', 'video/webm', 'webm'],
    ['', 'video/webm', 'webm'],
  ])('normalizes %s for upload and naming', (mime, expected, extension) => {
    expect(uploadMimeType(mime)).toBe(expected)
    expect(fileExtension(mime)).toBe(extension)
  })
})

describe('camera environment and errors', () => {
  it.each([
    [false, false, false, 'insecure'],
    [false, true, true, 'insecure'],
    [true, false, false, 'unsupported-camera'],
    [true, false, true, 'unsupported-camera'],
    [true, true, false, 'unsupported-recorder'],
  ] as const)('checks secure=%s camera=%s recorder=%s in order', (isSecureContext, hasMediaDevices, hasMediaRecorder, kind) => {
    expect(environmentError({ isSecureContext, hasMediaDevices, hasMediaRecorder })?.kind).toBe(kind)
  })

  it('accepts explicit environment overrides regardless of jsdom support', () => {
    expect(environmentError({ isSecureContext: true, hasMediaDevices: true, hasMediaRecorder: true })).toBeNull()
  })

  const exceptions: Array<[string, ShootErrorKind]> = [
    ['NotAllowedError', 'permission-denied'],
    ['SecurityError', 'permission-denied'],
    ['NotFoundError', 'no-camera'],
    ['DevicesNotFoundError', 'no-camera'],
    ['NotReadableError', 'camera-busy'],
    ['TrackStartError', 'camera-busy'],
    ['AbortError', 'camera-busy'],
    ['OverconstrainedError', 'constraints'],
    ['UnexpectedError', 'unknown'],
  ]
  it.each(exceptions)('classifies %s as %s', (name, kind) => {
    expect(classifyMediaError(new DOMException('Could not open camera', name)).kind).toBe(kind)
  })

  it('distinguishes missing devices from unsupported size constraints', () => {
    const missing = new DOMException('Requested device not found', 'OverconstrainedError')
    expect(classifyMediaError(missing).kind).toBe('no-camera')
    const deviceConstraint = Object.assign(new DOMException('', 'OverconstrainedError'), { constraint: 'deviceId' })
    expect(classifyMediaError(deviceConstraint).kind).toBe('no-camera')
    const sizeConstraint = Object.assign(new DOMException('', 'OverconstrainedError'), { constraint: 'width' })
    expect(classifyMediaError(sizeConstraint).kind).toBe('constraints')
  })

  it.each([null, undefined, 'blocked', 42, {}, new Error('oops')])('handles unknown thrown values safely', (err) => {
    expect(classifyMediaError(err).kind).toBe('unknown')
  })

  const kinds: ShootErrorKind[] = [
    'insecure', 'unsupported-camera', 'unsupported-recorder', 'permission-denied',
    'no-camera', 'camera-busy', 'constraints', 'unknown',
  ]
  it.each(kinds)('provides actionable copy for %s', (kind) => {
    const error = shootError(kind)
    expect(error.kind).toBe(kind)
    expect(error.title.trim().length).toBeGreaterThan(0)
    expect(error.message.trim().length).toBeGreaterThan(0)
    expect(typeof error.retryable).toBe('boolean')
  })

  it.each([
    ['user', '4k', 2160, 3840], ['environment', '4k', 2160, 3840],
    ['user', '1080p', 1080, 1920], ['environment', '1080p', 1080, 1920],
  ] as const)('requests ideal %s camera / %s resolution', (facing, quality, width, height) => {
    expect(videoConstraints(facing, quality)).toEqual({
      video: { facingMode: facing, width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: 30 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    })
  })

  it.each([
    [2160, 3840, 20_000_000], [3840, 2160, 20_000_000], [2000, 2000, 20_000_000],
    [1999, 3840, 12_000_000], [1080, 1920, 12_000_000], [1920, 1080, 12_000_000],
    [undefined, 3840, 12_000_000], [2160, undefined, 12_000_000], [undefined, undefined, 12_000_000],
  ])('selects bitrate from actual %s x %s capture', (width, height, bitrate) => {
    expect(recordingBitrate({ width, height })).toBe(bitrate)
  })

  it.each([[0, '0:00'], [7_900, '0:07'], [65_000, '1:05'], [3_723_000, '1:02:03'], [-5, '0:00']])(
    'formats %s milliseconds as %s', (ms, formatted) => {
      expect(formatDuration(Number(ms))).toBe(formatted)
    },
  )
})
