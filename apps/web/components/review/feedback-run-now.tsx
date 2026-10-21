'use client'

import { useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/shared/toast'
import { api } from '@/lib/api'
import type { CommentWithReplies } from '@/hooks/use-comments'
import type { AssetResponse } from '@/types'

function hasOpenComments(comments: CommentWithReplies[]): boolean {
  // Signed-in humans' notes and replies count. Flo's status replies are resolved.
  // The API applies agent and run eligibility rules that the comment tree cannot see.
  return comments.some((comment) => (
    !comment.deleted_at && !comment.resolved && !!comment.author_id && !comment.guest_author_id
  ) || hasOpenComments(comment.replies ?? []))
}

export function FeedbackRunNow({ asset, comments, onRequested }: {
  asset: AssetResponse
  comments: CommentWithReplies[]
  onRequested: () => void
}) {
  const toast = useToast()
  const hintId = useId()
  const inFlight = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const [requestedAsset, setRequestedAsset] = useState<AssetResponse | null>(null)
  // A refreshed asset replaces optimistic state, including a request cleared without a run.
  const pending = submitting || !!asset.feedback_run?.requested_at || requestedAsset === asset
  const hasComments = hasOpenComments(comments)

  async function checkNow() {
    if (inFlight.current || pending || !hasComments) return
    inFlight.current = true
    setSubmitting(true)
    setRequestedAsset(asset)
    try {
      await api.post<{ state: 'queued' | 'working'; run_id?: string; request_id?: string }>(
        `/cf/feedback/assets/${asset.id}/run-now`,
      )
      onRequested()
    } catch (err) {
      setRequestedAsset(null)
      toast.error((err instanceof Error && err.message) || 'Flo could not check your comments. Try again.')
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  if (asset.feedback_run?.status === 'working') return null
  return (
    <div className="min-w-0 max-w-full" aria-live="polite">
      <Button type="button" variant="secondary" size="sm"
        className="h-auto min-h-11 min-w-11 max-w-full whitespace-normal py-2 text-xs"
        disabled={pending || !hasComments} loading={pending} aria-busy={pending}
        aria-describedby={!pending && !hasComments ? hintId : undefined}
        onClick={() => { void checkNow() }}>
        {pending ? 'Flo is on it' : 'Have Flo check now'}
      </Button>
      {!pending && !hasComments && <p id={hintId} className="mt-1 text-xs text-text-tertiary">Leave a comment first</p>}
    </div>
  )
}
