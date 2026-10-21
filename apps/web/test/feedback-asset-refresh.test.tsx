import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReviewProvider, useReview } from '@/components/review/review-provider'
import { useReviewStore } from '@/stores/review-store'
import { api } from '@/lib/api'
import type { AssetResponse, AssetVersion } from '@/types'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }))

const version: AssetVersion = {
  id: 'v1', asset_id: 'asset', version_number: 1, processing_status: 'ready',
  created_by: 'u', created_at: '', deleted_at: null,
}
const asset: AssetResponse = {
  id: 'asset', project_id: 'project', name: 'CF-1234', asset_type: 'video', status: 'in_review',
  description: null, rating: null, assignee_id: null, folder_id: null, due_date: null,
  keywords: [], created_by: 'u', created_at: '', updated_at: '', deleted_at: null,
  latest_version: version, thumbnail_url: null,
  feedback_run: { id: 'run', status: 'working', attempt: 1, progress: null, new_version_number: null },
}

let refresh: () => Promise<void>
function Probe() {
  const review = useReview()
  refresh = review.refetchAsset
  return <div>{review.isLoading ? 'Loading' : review.asset?.feedback_run?.requested_at ? 'Requested' : review.asset?.feedback_run?.status ?? 'Idle'}</div>
}

beforeEach(() => {
  vi.mocked(api.get).mockReset()
  vi.mocked(api.get).mockImplementation(async <T,>(path: string) => (
    path.endsWith('/versions') ? [version] : path.endsWith('/comments') ? [] : asset
  ) as T)
})
afterEach(cleanup)

describe('feedback metadata refresh', () => {
  it('refreshes a pending request before a run exists and clears it on claim', async () => {
    const pending = { ...asset, feedback_run: { id: null, status: 'queued', attempt: 0, progress: null, new_version_number: null, requested_at: '2026-10-06T10:00:00Z' } }
    vi.mocked(api.get).mockImplementation(async <T,>(path: string) => (
      path.endsWith('/versions') ? [version] : path.endsWith('/comments') ? [] : { ...asset, feedback_run: null }
    ) as T)
    render(<ReviewProvider assetId="asset"><Probe /></ReviewProvider>)
    await screen.findByText('Idle')
    vi.mocked(api.get).mockResolvedValueOnce(pending)
    await act(async () => { await refresh() })
    expect(screen.getByText('Requested')).toBeInTheDocument()
    vi.mocked(api.get).mockResolvedValueOnce({ ...asset })
    await act(async () => { await refresh() })
    expect(screen.getByText('working')).toBeInTheDocument()
  })

  it('updates the asset while preserving the selected version and playhead', async () => {
    render(<ReviewProvider assetId="asset"><Probe /></ReviewProvider>)
    await screen.findByText('working')
    const selected = { ...version, id: 'v2', version_number: 2 }
    act(() => {
      useReviewStore.getState().setCurrentVersion(selected)
      useReviewStore.getState().setPlayheadTime(12)
    })
    vi.mocked(api.get).mockResolvedValueOnce({ ...asset, feedback_run: { ...asset.feedback_run!, status: 'done' } })
    await act(async () => { await refresh() })
    await screen.findByText('done')
    expect(useReviewStore.getState().currentVersion?.id).toBe('v2')
    expect(useReviewStore.getState().playheadTime).toBe(12)
  })

  it('ignores an older working response arriving after completion', async () => {
    render(<ReviewProvider assetId="asset"><Probe /></ReviewProvider>)
    await screen.findByText('working')
    let finishOlder!: (value: AssetResponse) => void
    vi.mocked(api.get).mockImplementationOnce(() => new Promise((resolve) => { finishOlder = resolve }))
    const older = refresh()
    vi.mocked(api.get).mockResolvedValueOnce({ ...asset, feedback_run: { ...asset.feedback_run!, status: 'done' } })
    await act(async () => { await refresh() })
    await act(async () => { finishOlder(asset); await older })
    await waitFor(() => expect(screen.getByText('done')).toBeInTheDocument())
  })
})
