import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type ShootSettings } from '../settings'

describe('Shoot settings', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('roundtrips camera and teleprompter preferences', () => {
    const settings: ShootSettings = {
      ...DEFAULT_SETTINGS,
      facing: 'environment',
      studioLook: false,
      studioTipSeen: true,
      quality: '1080p',
      speed: 8,
      fontSize: 'XL',
      mirror: true,
      countdown: false,
      aspect: '16:9',
    }
    saveSettings(settings)
    expect(loadSettings()).toEqual(settings)
  })

  it('defaults to Studio Look and 4K with the tip unseen for new and older settings', () => {
    expect(loadSettings()).toMatchObject({ studioLook: true, studioTipSeen: false, quality: '4k' })
    localStorage.setItem('cf-shoot-settings', JSON.stringify({ facing: 'environment' }))
    expect(loadSettings()).toMatchObject({ facing: 'environment', studioLook: true, studioTipSeen: false, quality: '4k' })
  })

  it.each(['4k', '1080p'] as const)('persists %s without resetting the tip or effect preference', (quality) => {
    const settings = { ...DEFAULT_SETTINGS, quality, studioLook: true, studioTipSeen: true }
    saveSettings(settings)
    expect(loadSettings()).toEqual(settings)
  })

  it('returns defaults for corrupt JSON', () => {
    localStorage.setItem('cf-shoot-settings', '{broken')
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('persists only preferences, never the brand or script', () => {
    saveSettings({ ...DEFAULT_SETTINGS, brand: 'demo', ideaId: 'idea-1', freeText: 'Private script' })
    expect(JSON.parse(localStorage.getItem('cf-shoot-settings') ?? '{}')).toEqual({
      facing: DEFAULT_SETTINGS.facing,
      studioLook: DEFAULT_SETTINGS.studioLook,
      studioTipSeen: DEFAULT_SETTINGS.studioTipSeen,
      quality: DEFAULT_SETTINGS.quality,
      speed: DEFAULT_SETTINGS.speed,
      fontSize: DEFAULT_SETTINGS.fontSize,
      mirror: DEFAULT_SETTINGS.mirror,
      countdown: DEFAULT_SETTINGS.countdown,
      aspect: DEFAULT_SETTINGS.aspect,
    })
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('ignores unpersisted and invalid keys when loading', () => {
    localStorage.setItem('cf-shoot-settings', JSON.stringify({
      brand: 'studio', ideaId: 'idea-2', freeText: 'Old text',
      studioLook: 'true', studioTipSeen: 1, quality: '720p',
      facing: 'sideways', speed: 'fast', fontSize: 'XXL', mirror: 'yes', countdown: null, aspect: 'square',
    }))
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('clamps stored speed to the supported range', () => {
    localStorage.setItem('cf-shoot-settings', JSON.stringify({ speed: 99 }))
    expect(loadSettings().speed).toBe(10)
    localStorage.setItem('cf-shoot-settings', JSON.stringify({ speed: -5 }))
    expect(loadSettings().speed).toBe(1)
  })

  it('keeps working when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked') })
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow()
  })
})
