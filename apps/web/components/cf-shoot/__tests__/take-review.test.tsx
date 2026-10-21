import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStreamUrl } from '@/hooks/use-stream-url'
import { TakeReview } from '../take-review'
import type { ShootSessionTake } from '../shoot-app'
import { brand } from './recorder-fixtures'

vi.mock('@/hooks/use-stream-url', () => ({ useStreamUrl: vi.fn() }))

function entry(patch: Partial<ShootSessionTake> = {}): ShootSessionTake {
  return {
    take: { id: 'take', blob: new Blob(['video']), url: 'blob:preview', mimeType: 'video/mp4',
      durationMs: 1000, createdAt: new Date(0), persisted: true, recovered: false },
    brand, idea: null, title: 'My script', text: 'Hello', assetName: 'Take', fileName: 'take.mp4',
    kept: false, restored: false, stored: true, recovered: false,
    upload: { phase: 'idle', percent: 0, error: null, session: null, assetId: null, versionId: null, note: null },
    ...patch,
  }
}
function review(value: ShootSessionTake) {
  return render(<TakeReview entry={value} onRetake={vi.fn()} onKeep={vi.fn()} onRetry={vi.fn()} onShootAnother={vi.fn()} onDone={vi.fn()} />)
}
function saved() {
  const value = entry()
  return entry({
    take: { ...value.take, blob: null, url: '' }, kept: true,
    upload: { ...value.upload, phase: 'done', percent: 100, assetId: 'asset', versionId: 'version' },
  })
}

beforeEach(() => {
  vi.mocked(useStreamUrl).mockReturnValue({ url: null, error: false })
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('')
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('TakeReview durability and previews', () => {
  it('shows local durability, recovery, and the existing download action', () => {
    review(entry({ recovered: true }))
    expect(screen.getByText('Safe on this phone')).toBeInTheDocument()
    expect(screen.getByText('Recovered take. The recording stopped early, so this may be cut short.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Save this take to your phone' })).toHaveAttribute('href', 'blob:preview')
    expect(screen.getByLabelText('Recorded take preview')).toHaveAttribute('src', 'blob:preview')
  })

  it('warns when the take has not been persisted', () => {
    review(entry({ stored: false }))
    expect(screen.getByText('Not saved on this phone yet. Keep this screen open or tap Save to phone.')).toBeInTheDocument()
    expect(screen.queryByText('Safe on this phone')).not.toBeInTheDocument()
  })

  it.each([
    { url: null, error: false },
    { url: null, error: true },
    { url: 'https://media.example/stream.m3u8?token=x', error: false },
  ])('uses an accessible saved note while loading, on error, or for unsupported HLS (%s)', (result) => {
    vi.mocked(useStreamUrl).mockReturnValue(result)
    review(saved())
    expect(useStreamUrl).toHaveBeenCalledWith('asset', 'version')
    expect(screen.getByText('Saved. Open it in Creative Flo to watch it back.')).toBeInTheDocument()
    expect(document.querySelector('video')).toBeNull()
    expect(document.querySelector('a[href=""]')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Save this take to your phone' })).not.toBeInTheDocument()
  })

  it('plays supported HLS from the server and falls back if playback fails', () => {
    vi.mocked(HTMLMediaElement.prototype.canPlayType).mockReturnValue('maybe')
    vi.mocked(useStreamUrl).mockReturnValue({ url: 'https://media.example/take.m3u8', error: false })
    review(saved())
    const video = screen.getByLabelText('Recorded take preview')
    expect(video).toHaveAttribute('src', 'https://media.example/take.m3u8')
    fireEvent.error(video)
    expect(screen.getByText('Saved. Open it in Creative Flo to watch it back.')).toBeInTheDocument()
  })
})
