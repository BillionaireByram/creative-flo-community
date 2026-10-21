import type { FeedbackRun } from '@/types'

export interface FeedbackPillState {
  label: string
  tone: 'working' | 'success' | 'warning'
  versionNumber: number | null
}

export function feedbackPill(run?: FeedbackRun | null): FeedbackPillState | null {
  if (!run) return null
  // Failures before the third are retried quietly; B keeps seeing that Flo is on it.
  if (run.status === 'working' || run.status === 'queued' || (run.status === 'failed' && run.attempt < 3)) {
    return { label: `Flo is on it…${run.status !== 'failed' && run.progress ? ` ${run.progress}` : ''}`, tone: 'working', versionNumber: null }
  }
  if (run.status === 'done' && run.new_version_number != null) {
    return { label: `Fixed in v${run.new_version_number}`, tone: 'success', versionNumber: run.new_version_number }
  }
  if (run.status === 'failed' && run.attempt >= 3) {
    return { label: 'Flo needs you', tone: 'warning', versionNumber: null }
  }
  return null
}
