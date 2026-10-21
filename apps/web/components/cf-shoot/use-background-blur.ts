'use client'

import { useEffect, useRef, useState } from 'react'
import { readBackgroundBlur, type BlurConstraints } from './studio-look'

export function useBackgroundBlur(stream: MediaStream | null, enabled: boolean): {
  blur: boolean | null
  ready: boolean
} {
  const track = stream?.getVideoTracks()[0] ?? null
  const attempted = useRef(new WeakSet<MediaStreamTrack>())
  const [snapshot, setSnapshot] = useState<{ track: MediaStreamTrack | null; blur: boolean | null; ready: boolean }>({
    track: null, blur: null, ready: false,
  })

  useEffect(() => {
    if (!enabled || !track) return
    let disposed = false
    const initial = readBackgroundBlur(track)
    const apply = initial.settable && !attempted.current.has(track) && typeof track.applyConstraints === 'function'
    const refresh = () => {
      if (!disposed) setSnapshot({ track, blur: readBackgroundBlur(track).blur, ready: true })
    }
    setSnapshot({ track, blur: initial.blur, ready: !apply })
    track.addEventListener('configurationchange', refresh)
    if (apply) {
      attempted.current.add(track)
      const enableBlur = async () => {
        try {
          // applyConstraints replaces the constraint set. Retain capture quality.
          const constraints: BlurConstraints = { ...track?.getConstraints?.(), backgroundBlur: true }
          await track?.applyConstraints(constraints)
        } catch {
          // iOS effects are controlled by the user; rejection is harmless.
        }
        refresh()
      }
      void enableBlur()
    }
    return () => {
      disposed = true
      track.removeEventListener('configurationchange', refresh)
    }
  }, [track, enabled])

  return enabled && track && snapshot.track === track
    ? { blur: snapshot.blur, ready: snapshot.ready }
    : { blur: null, ready: false }
}
