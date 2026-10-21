import { FONT_SIZES, SPEED_DEFAULT, SPEED_MAX, SPEED_MIN } from './teleprompter'

export interface ShootSettings {
  brand: string
  ideaId: string | null
  freeText: string
  facing: 'user' | 'environment'
  studioLook: boolean
  studioTipSeen: boolean
  quality: '4k' | '1080p'
  speed: number
  fontSize: keyof typeof FONT_SIZES
  mirror: boolean
  countdown: boolean
  aspect: '9:16' | '16:9'
}

export const DEFAULT_SETTINGS: ShootSettings = {
  brand: '',
  ideaId: null,
  freeText: '',
  facing: 'user',
  studioLook: true,
  studioTipSeen: false,
  quality: '4k',
  speed: SPEED_DEFAULT,
  fontSize: 'L',
  mirror: false,
  countdown: true,
  aspect: '9:16',
}

const STORAGE_KEY = 'cf-shoot-settings'

export function loadSettings(): ShootSettings {
  const settings = { ...DEFAULT_SETTINGS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return settings
    const saved: unknown = JSON.parse(raw)
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return settings
    const values = saved as Record<string, unknown>
    if (values.facing === 'user' || values.facing === 'environment') settings.facing = values.facing
    if (typeof values.speed === 'number' && Number.isFinite(values.speed)) {
      settings.speed = Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(values.speed)))
    }
    if (values.fontSize === 'S' || values.fontSize === 'M' || values.fontSize === 'L' || values.fontSize === 'XL') {
      settings.fontSize = values.fontSize
    }
    if (typeof values.studioLook === 'boolean') settings.studioLook = values.studioLook
    if (typeof values.studioTipSeen === 'boolean') settings.studioTipSeen = values.studioTipSeen
    if (values.quality === '4k' || values.quality === '1080p') settings.quality = values.quality
    if (typeof values.mirror === 'boolean') settings.mirror = values.mirror
    if (typeof values.countdown === 'boolean') settings.countdown = values.countdown
    if (values.aspect === '9:16' || values.aspect === '16:9') settings.aspect = values.aspect
  } catch {
    // Private browsing and corrupt storage should never prevent a shoot.
  }
  return settings
}

export function saveSettings(settings: ShootSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      facing: settings.facing,
      studioLook: settings.studioLook,
      studioTipSeen: settings.studioTipSeen,
      quality: settings.quality,
      speed: settings.speed,
      fontSize: settings.fontSize,
      mirror: settings.mirror,
      countdown: settings.countdown,
      aspect: settings.aspect,
    }))
  } catch {
    // The current session still works when storage is unavailable.
  }
}
