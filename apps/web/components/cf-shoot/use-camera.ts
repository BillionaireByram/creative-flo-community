'use client'

import { useCallback, useEffect, useState } from 'react'
import { classifyMediaError, environmentError, videoConstraints } from './media'
import type { ShootError } from './media'

export type CameraStatus = 'idle' | 'starting' | 'live' | 'error'

export function useCamera(opts: { facing: 'user' | 'environment'; quality: '4k' | '1080p'; enabled: boolean }): {
  stream: MediaStream | null
  status: CameraStatus
  error: ShootError | null
  restart: () => void
} {
  const { facing, quality, enabled } = opts
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState<ShootError | null>(null)
  const [attempt, setAttempt] = useState(0)
  const restart = useCallback(() => setAttempt((value) => value + 1), [])

  useEffect(() => {
    let disposed = false
    let acquired: MediaStream | null = null
    setStream(null)
    setError(null)
    if (!enabled) {
      setStatus('idle')
      return
    }
    const unsupported = environmentError()
    if (unsupported) {
      setError(unsupported)
      setStatus('error')
      return
    }
    setStatus('starting')

    async function openCamera() {
      try {
        const next = await navigator.mediaDevices.getUserMedia(videoConstraints(facing, quality))
        // Permission prompts can outlive the screen or a camera flip.
        if (disposed) {
          next.getTracks().forEach((track) => track.stop())
          return
        }
        acquired = next
        setStream(next)
        setStatus('live')
      } catch (err) {
        if (!disposed) {
          setError(classifyMediaError(err))
          setStatus('error')
        }
      }
    }
    void openCamera()
    return () => {
      disposed = true
      acquired?.getTracks().forEach((track) => track.stop())
    }
  }, [enabled, facing, quality, attempt])

  return { stream, status, error, restart }
}
