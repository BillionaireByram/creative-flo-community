import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { setCoarsePointer, setViewportWidth } from '@/test/setup'
import { useReviewStore } from '@/stores/review-store'
import { ProgressBar } from '../progress-bar'
import { CommentAttachment } from '../comment-attachment'
import { CommentPanel } from '../comment-panel'
import { CommentInput } from '../comment-input'
import type { CommentAttachment as Attachment } from '@/types'

vi.mock('../review-provider', () => ({ useReview: () => ({ pauseVideo: vi.fn() }) }))
vi.mock('@/lib/api', () => ({ api: { get: vi.fn(async (path: string) => path.includes('/members')
  ? [{ user_id: 'u1' }] : [{ id: 'u1', name: 'Maya Chen', email: 'maya@example.test' }]) } }))

const comment = {
  id: 'c1', asset_id: 'a1', version_id: 'v1', parent_id: null, author_id: 'u1',
  author: { id: 'u1', name: 'Maya Chen' }, body: 'A review note',
  timecode_start: null, timecode_end: null, resolved: false, visibility: 'public',
  created_at: '2026-10-05T00:00:00Z', replies: [], reactions: [], attachments: [],
} as unknown as ComponentProps<typeof CommentPanel>['comments'][number]

const attachment = {
  id: 'att1', file_type: 'image', original_filename: 'Frame.png', file_size_bytes: 1200,
} as Attachment

beforeEach(() => {
  setCoarsePointer(true)
  setViewportWidth(390)
  useReviewStore.getState().reset()
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  setCoarsePointer(false)
  setViewportWidth(1024)
  vi.restoreAllMocks()
})

function tap(el: HTMLElement, pointerType = 'touch') {
  fireEvent.pointerDown(el, { pointerId: 1, pointerType, isPrimary: true, button: 0 })
  fireEvent.pointerUp(el, { pointerId: 1, pointerType })
  fireEvent.click(el, { pointerType })
}

function panel() {
  const onResolve = vi.fn().mockResolvedValue(undefined)
  render(<CommentPanel comments={[comment]} currentUserId="u1" onResolve={onResolve}
    onDelete={vi.fn()} onAddReaction={vi.fn()} onRemoveReaction={vi.fn()}
    onReply={vi.fn()} onSubmitReply={vi.fn()} />)
  return { onResolve }
}

function expectNoUnscopedHiding(el: HTMLElement) {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    expect(node.className.split(/\s+/)).not.toContain('opacity-0')
    expect(node.className.split(/\s+/)).not.toContain('hidden')
  }
}

describe('touch review controls', () => {
  it('shows attachment download/delete without hover and deletes on one tap', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    render(<CommentAttachment attachment={attachment} downloadUrl="/frame.png" isOwn onDelete={onDelete} />)
    for (const button of screen.getAllByTitle('Delete attachment')) {
      expectNoUnscopedHiding(button)
      expect(button.className).toContain('[@media(pointer:coarse)]:min-h-11')
    }
    expect(screen.getAllByTitle('Download')[0].parentElement?.className).toContain('[@media(hover:hover)]:opacity-0')
    tap(screen.getAllByTitle('Delete attachment')[0])
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('att1'))
  })

  it('shows reaction, comment menu and resolve actions without hover', async () => {
    const { onResolve } = panel()
    for (const el of [screen.getByTitle('Add reaction'), screen.getByLabelText('Comment actions'), screen.getByTitle('Resolve')]) {
      expectNoUnscopedHiding(el)
      expect(el.className).toContain('[@media(pointer:coarse)]:min-h-11')
    }
    tap(screen.getByTitle('Resolve'))
    await waitFor(() => expect(onResolve).toHaveBeenCalledWith('c1'))
  })

  it.each(['touch', 'mouse'])('opens comment actions with one %s click', (pointer) => {
    setCoarsePointer(pointer === 'touch')
    panel()
    tap(screen.getByLabelText('Comment actions'), pointer)
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    const content = screen.getByRole('dialog')
    expect(content.className).toContain('max-w-[calc(100vw-16px)]')
    expect(content.className).toContain('max-h-[var(--radix-popover-content-available-height)]')
    tap(screen.getByLabelText('Comment actions'), pointer)
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it.each([390, 820, 1180])('keeps composer controls touch-sized at %ipx', (width) => {
    setViewportWidth(width)
    render(<CommentInput assetId="a1" projectId="p1" assetType="video" onSubmit={vi.fn()} />)
    expect(screen.getByTitle('Send (Enter)').className).toContain('[@media(pointer:coarse)]:min-h-11')
    expect(screen.getByTitle('Draw annotation').className).toContain('[@media(pointer:coarse)]:min-w-11')
  })

  it('sends a typed comment with one touch tap', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CommentInput assetId="a1" projectId="p1" assetType="video" onSubmit={onSubmit} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Looks good' } })
    tap(screen.getByTitle('Send (Enter)'))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toBe('Looks good')
  })

  it('uses a collision-aware emoji picker with touch-sized options', () => {
    render(<CommentInput assetId="a1" projectId="p1" assetType="image" onSubmit={vi.fn()} />)
    tap(screen.getByTitle('Add emoji'))
    const content = screen.getByRole('dialog')
    expect(content.className).toContain('max-w-[calc(100vw-16px)]')
    expect(content.className).toContain('overflow-y-auto')
    const emoji = screen.getByRole('button', { name: '👍' })
    expect(emoji.className).toContain('[@media(pointer:coarse)]:min-w-11')
    tap(emoji)
    expect(screen.getByRole('textbox')).toHaveValue('👍')
  })

  it('keeps drawing tools and colors inside a scrolling toolbar', () => {
    render(<CommentInput assetId="a1" projectId="p1" assetType="video" onSubmit={vi.fn()} annotationActive onToggleAnnotation={vi.fn()} />)
    expect(screen.getByTitle('Exit drawing').parentElement?.className).toContain('overflow-x-auto')
    for (const button of screen.getAllByLabelText(/^Drawing color/)) {
      expect(button.className).toContain('[@media(pointer:coarse)]:min-w-11')
      expect(button.className).not.toMatch(/(?:^|\s)hover:scale-/)
    }
  })

  it('selects a mention with one touch tap while preserving the composer focus', async () => {
    render(<CommentInput assetId="a1" projectId="p1" assetType="video" onSubmit={vi.fn()} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '@Ma', selectionStart: 3 } })
    const member = await screen.findByRole('button', { name: /Maya Chen/ })
    tap(member)
    expect(input).toHaveValue('@Maya Chen ')
    expect(input).toHaveFocus()
  })
})

describe('touch playback slider', () => {
  it.each(['touch', 'mouse'])('seeks once on a %s press, captures a drag and stops on cancellation', (pointerType) => {
    const onSeek = vi.fn()
    render(<ProgressBar currentTime={25} duration={100} onSeek={onSeek} />)
    const slider = screen.getByRole('slider', { name: 'Playback position' })
    slider.getBoundingClientRect = () => ({ left: 0, width: 200 } as DOMRect)
    slider.setPointerCapture = vi.fn()
    fireEvent.pointerDown(slider, { pointerId: 2, pointerType, clientX: 100, isPrimary: true, button: 0 })
    expect(onSeek).toHaveBeenLastCalledWith(50)
    expect(slider.setPointerCapture).toHaveBeenCalledWith(2)
    fireEvent.pointerMove(slider, { pointerId: 2, pointerType, clientX: 150 })
    expect(onSeek).toHaveBeenLastCalledWith(75)
    fireEvent.pointerCancel(slider, { pointerId: 2, pointerType })
    onSeek.mockClear()
    fireEvent.pointerMove(slider, { pointerId: 2, pointerType, clientX: 50 })
    expect(onSeek).not.toHaveBeenCalled()
    expect(slider).toHaveAttribute('aria-valuenow', '25')
    expect(slider.className).toContain('touch-none')
    expect(slider.parentElement?.className).toContain('[@media(pointer:coarse)]:py-5')
  })

  it('supports keyboard seeking without bubbling into the player shortcut', () => {
    const onSeek = vi.fn()
    const onKeyDown = vi.fn()
    render(<div onKeyDown={onKeyDown}><ProgressBar currentTime={25} duration={100} onSeek={onSeek} /></div>)
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
    expect(onSeek).toHaveBeenCalledWith(30)
    expect(onKeyDown).not.toHaveBeenCalled()
  })
})
