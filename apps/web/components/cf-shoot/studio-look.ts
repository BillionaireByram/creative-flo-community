// Keep experimental capture properties local until all DOM typings expose them.
type BlurSettings = MediaTrackSettings & { backgroundBlur?: boolean }
type BlurCapabilities = MediaTrackCapabilities & { backgroundBlur?: boolean[] }
export type BlurConstraints = MediaTrackConstraints & { backgroundBlur?: boolean }

export interface BackgroundBlurState {
  blur: boolean | null
  settable: boolean
}

export function readBackgroundBlur(track: MediaStreamTrack | null): BackgroundBlurState {
  let blur: boolean | null = null
  let settable = false
  try {
    const settings = track?.getSettings?.() as BlurSettings | undefined
    if (typeof settings?.backgroundBlur === 'boolean') blur = settings.backgroundBlur
  } catch {
    // Reporting an effect must never prevent recording.
  }
  try {
    const capabilities = track?.getCapabilities?.() as BlurCapabilities | undefined
    const values = capabilities?.backgroundBlur
    settable = Array.isArray(values) && values.includes(false) && values.includes(true)
  } catch {
    // Some browsers expose settings without a capability probe.
  }
  return { blur, settable }
}

export function portraitBadge(blur: boolean | null): 'Portrait on' | 'Portrait off' | null {
  return blur === null ? null : blur ? 'Portrait on' : 'Portrait off'
}
