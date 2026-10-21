'use client'

import Link from 'next/link'
import { feedbackPill } from '@/lib/feedback-pill'
import { cn } from '@/lib/utils'
import type { FeedbackRun } from '@/types'

export function FeedbackPill({ run, versionHref, onSelectVersion }: {
  run?: FeedbackRun | null
  versionHref: (number: number) => string
  onSelectVersion?: (number: number) => void
}) {
  const pill = feedbackPill(run)
  if (!pill) return null
  const style = cn('inline-block max-w-full rounded-lg px-2.5 py-1 text-xs break-words', {
    'bg-accent/10 text-text-primary': pill.tone === 'working',
    'bg-status-success/10 text-status-success': pill.tone === 'success',
    'bg-status-warning/10 text-status-warning': pill.tone === 'warning',
  })
  return (
    <div className="px-4 pt-2" role="status" aria-live="polite">
      {pill.versionNumber != null ? (
        <Link href={versionHref(pill.versionNumber)} scroll={false}
          onClick={() => onSelectVersion?.(pill.versionNumber!)}
          className={cn(style, 'underline underline-offset-2 focus-visible:outline focus-visible:outline-2')}>
          {pill.label}
        </Link>
      ) : <span className={style}>{pill.label}</span>}
    </div>
  )
}
