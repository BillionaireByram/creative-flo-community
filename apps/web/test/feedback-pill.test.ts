import { describe, expect, it } from 'vitest'
import { feedbackPill } from '@/lib/feedback-pill'
import type { FeedbackRun } from '@/types'

const run: FeedbackRun = { id: 'run', status: 'working', progress: null, attempt: 1, new_version_number: null }

describe('feedbackPill', () => {
  it('hides missing feedback', () => {
    expect(feedbackPill()).toBeNull()
    expect(feedbackPill(null)).toBeNull()
  })

  it.each(['working', 'queued'] as const)('shows %s with and without progress', (status) => {
    expect(feedbackPill({ ...run, status })).toEqual({ label: 'Flo is on it…', tone: 'working', versionNumber: null })
    expect(feedbackPill({ ...run, status, progress: 'Rendering' })?.label).toBe('Flo is on it… Rendering')
    expect(feedbackPill({ ...run, status, progress: '' })?.label).toBe('Flo is on it…')
  })

  it('links a completed run to its actual version number', () => {
    expect(feedbackPill({ ...run, status: 'done', new_version_number: 4 })).toEqual({
      label: 'Fixed in v4', tone: 'success', versionNumber: 4,
    })
    expect(feedbackPill({ ...run, status: 'done' })).toBeNull()
  })

  it('keeps saying Flo is on it through the first two failures', () => {
    for (const attempt of [1, 2]) {
      expect(feedbackPill({ ...run, status: 'failed', attempt, progress: 'old note' })).toEqual({
        label: 'Flo is on it…', tone: 'working', versionNumber: null,
      })
    }
    expect(feedbackPill({ ...run, status: 'cancelled', attempt: 2 })).toBeNull()
  })

  it('asks for help only after the third failure', () => {
    expect(feedbackPill({ ...run, status: 'failed', attempt: 3 })).toEqual({
      label: 'Flo needs you', tone: 'warning', versionNumber: null,
    })
  })
})
