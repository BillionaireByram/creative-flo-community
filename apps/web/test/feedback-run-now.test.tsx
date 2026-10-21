import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FeedbackRunNow } from '@/components/review/feedback-run-now'
import { CommentPanel } from '@/components/review/comment-panel'
import { ToastProvider } from '@/components/shared/toast'
import { api, ApiError } from '@/lib/api'
import type { CommentWithReplies } from '@/hooks/use-comments'
import type { AssetResponse, FeedbackRun } from '@/types'

vi.mock('@/lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api')>(),
  api: { post: vi.fn() },
}))

const asset: AssetResponse = {
  id: 'asset', project_id: 'project', name: 'CF-1234', asset_type: 'video', status: 'in_review',
  description: null, rating: null, assignee_id: null, folder_id: null, due_date: null,
  keywords: [], created_by: 'owner', created_at: '', updated_at: '', deleted_at: null,
  latest_version: null, thumbnail_url: null, feedback_run: null,
}
const comment: CommentWithReplies = {
  id: 'comment', asset_id: 'asset', version_id: 'v1', parent_id: null,
  author_id: 'owner', guest_author_id: null, body: 'Trim the opening', resolved: false,
  deleted_at: null, created_at: '', updated_at: '', timecode_start: null, timecode_end: null,
  visibility: 'public', replies: [], reactions: [], annotation: null,
  author: { id: 'owner', name: 'Owner', avatar_url: null }, guest_author: null,
}
const run: FeedbackRun = { id: 'run', status: 'working', attempt: 1, progress: null, new_version_number: null }
const onRequested = vi.fn()
const props = { asset, comments: [comment], onRequested }

beforeEach(() => { vi.clearAllMocks(); vi.mocked(api.post).mockResolvedValue({ state: 'queued', request_id: 'request' }) })
afterEach(cleanup)

describe('Have Flo check now', () => {
  it('is disabled with a readable hint when there are no comments', () => {
    render(<FeedbackRunNow {...props} comments={[]} />, { wrapper: ToastProvider })
    const button = screen.getByRole('button', { name: 'Have Flo check now' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription('Leave a comment first')
  })

  it('is enabled for an open comment from another signed-in human', () => {
    render(<FeedbackRunNow {...props} comments={[{ ...comment, author_id: 'other-human' }]} />, { wrapper: ToastProvider })
    expect(screen.getByRole('button', { name: 'Have Flo check now' })).toBeEnabled()
  })

  it.each([
    { resolved: true },
    { deleted_at: '2026-10-06T10:00:00Z' },
    { author_id: null, guest_author_id: 'guest' },
  ])('does not enable for an ineligible note: %j', (change) => {
    render(<FeedbackRunNow {...props} comments={[{ ...comment, ...change }]} />, { wrapper: ToastProvider })
    expect(screen.getByRole('button', { name: 'Have Flo check now' })).toBeDisabled()
  })

  it('counts an open human reply even when its parent is resolved', () => {
    render(<FeedbackRunNow {...props} comments={[{
      ...comment, resolved: true, replies: [{ ...comment, id: 'reply', parent_id: comment.id }],
    }]} />, { wrapper: ToastProvider })
    expect(screen.getByRole('button', { name: 'Have Flo check now' })).toBeEnabled()
  })

  it('posts once, shows a spinner immediately and refreshes after acceptance', async () => {
    let finish!: (value: unknown) => void
    vi.mocked(api.post).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    render(<FeedbackRunNow {...props} />, { wrapper: ToastProvider })
    fireEvent.click(screen.getByRole('button', { name: 'Have Flo check now' }))
    const pending = screen.getByRole('button', { name: 'Flo is on it' })
    expect(pending).toBeDisabled()
    expect(pending).toHaveAttribute('aria-busy', 'true')
    expect(pending.querySelector('.animate-spin')).toBeInTheDocument()
    fireEvent.click(pending)
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/cf/feedback/assets/asset/run-now')
    expect(onRequested).not.toHaveBeenCalled()
    await act(async () => { finish({ state: 'queued', request_id: 'request' }) })
    expect(onRequested).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Flo is on it' })).toBeDisabled()
  })

  it('refreshes a run already working when the API answers', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ state: 'working', run_id: 'run' })
    const { rerender } = render(<FeedbackRunNow {...props} />, { wrapper: ToastProvider })
    fireEvent.click(screen.getByRole('button', { name: 'Have Flo check now' }))
    await waitFor(() => expect(onRequested).toHaveBeenCalledOnce())
    rerender(<FeedbackRunNow {...props} asset={{ ...asset, feedback_run: run }} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows a pending request without a feedback run, including after reload', () => {
    render(<FeedbackRunNow {...props} comments={[]} asset={{ ...asset, feedback_run: { id: null, status: 'queued', attempt: 0, progress: null, new_version_number: null, requested_at: '2026-10-06T10:00:00Z' } }} />, { wrapper: ToastProvider })
    expect(screen.getByRole('button', { name: 'Flo is on it' })).toBeDisabled()
    expect(screen.queryByText('Leave a comment first')).not.toBeInTheDocument()
  })

  it('hides while the existing working pill takes over', () => {
    render(<FeedbackRunNow {...props} asset={{ ...asset, feedback_run: { ...run, requested_at: '2026-10-06T10:00:00Z' } }} />, { wrapper: ToastProvider })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it.each(['done', 'failed'] as const)('returns to idle after %s', async (status) => {
    const { rerender } = render(<FeedbackRunNow {...props} />, { wrapper: ToastProvider })
    fireEvent.click(screen.getByRole('button', { name: 'Have Flo check now' }))
    await waitFor(() => expect(onRequested).toHaveBeenCalledOnce())
    rerender(<FeedbackRunNow {...props} asset={{ ...asset, feedback_run: run }} />)
    rerender(<FeedbackRunNow {...props} asset={{ ...asset, feedback_run: { ...run, status } }} />)
    expect(screen.getByRole('button', { name: 'Have Flo check now' })).toBeEnabled()
  })

  it('returns to idle when a refresh clears a request without creating a run', async () => {
    const { rerender } = render(<FeedbackRunNow {...props} />, { wrapper: ToastProvider })
    fireEvent.click(screen.getByRole('button', { name: 'Have Flo check now' }))
    await waitFor(() => expect(onRequested).toHaveBeenCalledOnce())
    rerender(<FeedbackRunNow {...props} asset={{ ...asset }} comments={[]} />)
    expect(screen.getByRole('button', { name: 'Have Flo check now' })).toBeDisabled()
    expect(screen.getByText('Leave a comment first')).toBeInTheDocument()
  })

  it('shows the API detail as a toast and permits retry after an error', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(409, 'Leave a comment first, then Flo can check it.'))
    render(<FeedbackRunNow {...props} />, { wrapper: ToastProvider })
    fireEvent.click(screen.getByRole('button', { name: 'Have Flo check now' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Leave a comment first, then Flo can check it.')
    expect(screen.getByRole('button', { name: 'Have Flo check now' })).toBeEnabled()
    expect(onRequested).not.toHaveBeenCalled()
  })

  it('mounts beside the comment count with wrapping and a 44px tap target', () => {
    const noop = vi.fn().mockResolvedValue(undefined)
    render(<CommentPanel comments={[]} onResolve={noop} onDelete={noop} onAddReaction={noop}
      onRemoveReaction={noop} onReply={noop} canExport={false}
      headerActions={<FeedbackRunNow {...props} />} />, { wrapper: ToastProvider })
    const button = screen.getByRole('button', { name: 'Have Flo check now' })
    expect(button).toHaveClass('min-h-11', 'max-w-full', 'whitespace-normal')
    const toolbar = button.parentElement?.parentElement
    expect(toolbar).toHaveClass('flex-wrap')
    expect(toolbar).toContainElement(screen.getByRole('button', { name: /All comments/ }))
  })
})
