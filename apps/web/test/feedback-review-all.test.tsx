import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import useSWR from 'swr'
import { FeedbackReviewAll } from '@/components/review/feedback-review-all'
import { ToastProvider } from '@/components/shared/toast'
import { api, ApiError } from '@/lib/api'
import type { Brand } from '@/components/cf-ideas/types'
import type { FolderTreeNode } from '@/types'

vi.mock('swr', () => ({ default: vi.fn() }))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api')>(),
  api: { get: vi.fn(), post: vi.fn() },
}))

const brand: Brand = { brand: 'demo & team', project_id: 'project', project_name: 'Videos', role: 'owner' }
const folder: FolderTreeNode = {
  id: 'review', parent_id: null, name: 'Review', children: [], item_count: 3,
}
const props = { projectId: 'project', folderId: folder.id, folderTree: [folder] }
function brandsResult(data: Brand[] | undefined, error?: Error) {
  vi.mocked(useSWR).mockReturnValue({ data, error, isLoading: false, isValidating: false, mutate: vi.fn() })
}

beforeEach(() => { vi.clearAllMocks(); brandsResult([brand]) })
afterEach(cleanup)

describe('Review all now', () => {
  it('is offered to the Review folder owner using the existing brand membership', () => {
    render(<FeedbackReviewAll {...props} />, { wrapper: ToastProvider })
    expect(screen.getByRole('button', { name: 'Review all now' })).toBeEnabled()
    expect(useSWR).toHaveBeenCalledWith('/cf/brands', api.get)
  })

  it.each(['editor', 'reviewer', 'viewer'] as const)('is hidden for a %s', (role) => {
    brandsResult([{ ...brand, role }])
    render(<FeedbackReviewAll {...props} />, { wrapper: ToastProvider })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it.each(['Ready to Post', 'Review later'])('is hidden in %s', (name) => {
    render(<FeedbackReviewAll {...props} folderTree={[{ ...folder, name }]} />, { wrapper: ToastProvider })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('is hidden at the project root', () => {
    render(<FeedbackReviewAll {...props} folderId={null} />, { wrapper: ToastProvider })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it.each([
    { data: undefined, error: undefined },
    { data: [{ ...brand, project_id: 'different-project' }], error: undefined },
    { data: [brand], error: new Error('Cannot verify membership') },
  ])('is hidden without confirmed brand ownership: %j', ({ data, error }) => {
    brandsResult(data, error)
    render(<FeedbackReviewAll {...props} />, { wrapper: ToastProvider })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('finds a nested Review folder and reports queued and working videos', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ queued: ['a', 'b'], working: ['c'], nothing: 2 })
    render(<FeedbackReviewAll {...props} folderTree={[{ ...folder, id: 'parent', name: 'Videos', children: [folder] }]} />, { wrapper: ToastProvider })
    fireEvent.click(screen.getByRole('button', { name: 'Review all now' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Flo is checking 3 videos')
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/cf/feedback/run-now?brand=demo%20%26%20team')
  })

  it.each([
    { queued: [], working: [], message: 'No open comments right now.' },
    { queued: ['a'], working: [], message: 'Flo is checking 1 video' },
    { queued: [], working: ['a', 'b'], message: 'Flo is checking 2 videos' },
  ])('reports $message', async ({ queued, working, message }) => {
    vi.mocked(api.post).mockResolvedValueOnce({ queued, working, nothing: 1 })
    render(<FeedbackReviewAll {...props} />, { wrapper: ToastProvider })
    fireEvent.click(screen.getByRole('button', { name: 'Review all now' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('blocks duplicate taps while submitting', async () => {
    let finish!: (value: unknown) => void
    vi.mocked(api.post).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    render(<FeedbackReviewAll {...props} />, { wrapper: ToastProvider })
    const button = screen.getByRole('button', { name: 'Review all now' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(button).toBeDisabled()
    expect(button).toHaveClass('min-h-11', 'whitespace-normal')
    expect(api.post).toHaveBeenCalledOnce()
    await act(async () => { finish({ queued: [], working: [], nothing: 0 }) })
    expect(button).toBeEnabled()
  })

  it('shows the API error detail and re-enables the button', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(403, 'Only the project owner can do this.'))
    render(<FeedbackReviewAll {...props} />, { wrapper: ToastProvider })
    fireEvent.click(screen.getByRole('button', { name: 'Review all now' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the project owner can do this.')
    expect(screen.getByRole('button', { name: 'Review all now' })).toBeEnabled()
  })
})
