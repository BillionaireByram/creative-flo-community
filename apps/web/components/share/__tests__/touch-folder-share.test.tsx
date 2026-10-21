import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FolderShareViewer } from '../folder-share-viewer'
import { resetPointerMemory } from '@/lib/touch'
import { setCoarsePointer, setViewportWidth } from '@/test/setup'
import type { ShareLinkAppearance } from '@/types'

vi.mock('../share-review-screen', () => ({ ShareReviewScreen: () => <div data-testid="review-screen" /> }))

const asset = {
  id: 'a1', name: 'Clip.mp4', asset_type: 'video', thumbnail_url: null, file_size: 123,
  duration_seconds: 10, comment_count: 0, created_by_name: 'Owner', created_at: '2026-01-01',
}

function pointer(target: Element, type: string, pointerType = 'touch') {
  const event = new Event(type, { bubbles: true })
  Object.assign(event, { pointerType, clientX: 0, clientY: 0 })
  fireEvent(target, event)
}

beforeEach(() => {
  setViewportWidth(390)
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, json: async () => ({ assets: [asset], subfolders: [], total: 1 }),
  })))
})
afterEach(() => {
  cleanup()
  setCoarsePointer(false)
  setViewportWidth(1024)
  resetPointerMemory()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function renderShare(layout: 'grid' | 'list', openInViewer = true) {
  render(<FolderShareViewer token="t" folderName="Footage" title="Footage" description={null}
    permission="view" allowDownload showVersions={false} branding={null}
    appearance={{ layout, open_in_viewer: openInViewer } as ShareLinkAppearance} />)
  return screen.findByText('Clip.mp4')
}

describe.each(['grid', 'list'] as const)('%s folder share', (layout) => {
  it('opens with one touch tap', async () => {
    setCoarsePointer(true)
    const name = await renderShare(layout)
    fireEvent.click(name)
    expect(screen.getByTestId('review-screen')).toBeInTheDocument()
  })

  it('opens a finger gesture on a fine-pointer device', async () => {
    const name = await renderShare(layout)
    pointer(name, 'pointerdown')
    fireEvent.click(name)
    expect(screen.getByTestId('review-screen')).toBeInTheDocument()
  })

  it('keeps iPad trackpad clicks as selection and mouse double-clicks as opening', async () => {
    setCoarsePointer(true)
    const name = await renderShare(layout)
    pointer(name, 'pointerdown', 'mouse')
    fireEvent.click(name)
    expect(screen.queryByTestId('review-screen')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select Clip.mp4' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.doubleClick(name)
    expect(screen.getByTestId('review-screen')).toBeInTheDocument()
  })

  it('toggles selection with the checkbox without opening the asset', async () => {
    await renderShare(layout)
    const checkbox = screen.getByRole('button', { name: 'Select Clip.mp4' })
    fireEvent.click(checkbox)
    expect(checkbox).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(checkbox)
    expect(checkbox).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByTestId('review-screen')).not.toBeInTheDocument()
  })

  it('selects on long-press and suppresses the release click', async () => {
    const name = await renderShare(layout)
    vi.useFakeTimers()
    pointer(name, 'pointerdown')
    act(() => vi.advanceTimersByTime(500))
    pointer(name, 'pointerup')
    fireEvent.click(name)
    expect(screen.getByRole('button', { name: 'Select Clip.mp4' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByTestId('review-screen')).not.toBeInTheDocument()
  })

  it('selects on touch when the link disables opening in the viewer', async () => {
    setCoarsePointer(true)
    const name = await renderShare(layout, false)
    fireEvent.click(name)
    expect(screen.queryByTestId('review-screen')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select Clip.mp4' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows download controls without requiring hover', async () => {
    await renderShare(layout)
    const download = screen.getByTitle('Download')
    expect(download.className.split(/\s+/)).toContain('opacity-100')
    expect(download.className.split(/\s+/)).not.toContain('opacity-0')
  })
})
