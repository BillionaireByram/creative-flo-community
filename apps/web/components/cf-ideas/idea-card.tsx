'use client'

import Link from 'next/link'
import { ArrowRight, Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import { nextStatus, statusLabel } from './script'
import { actionClass, shootClass } from './styles'
import type { BoardStatus, Idea } from './types'

interface IdeaCardProps {
  idea: Idea
  canEdit: boolean
  busy?: boolean
  onOpen: (idea: Idea) => void
  onMove?: (idea: Idea, status: BoardStatus) => void
}

export function IdeaCard({ idea, canEdit, busy, onOpen, onMove }: IdeaCardProps) {
  const forward = nextStatus(idea.status)
  const ready = idea.status === 'ready'
  return (
    <article className={cn(
      'relative rounded-xl border border-border bg-bg-secondary p-4',
      ready && 'border-l-2 border-l-[#FFB869] ring-1 ring-[#FFB869]/20',
    )}>
      <button
        type="button"
        onClick={() => onOpen(idea)}
        className="block w-full [@media(pointer:coarse)]:min-h-11 space-y-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent after:absolute after:inset-0 after:rounded-xl"
        aria-label={`Open ${idea.title}`}
      >
        <h3 className="break-words text-sm font-semibold text-text-primary">{idea.title}</h3>
        {idea.hook && <p className="line-clamp-2 break-words text-sm leading-relaxed text-text-secondary">{idea.hook}</p>}
        <span className="flex flex-wrap items-center gap-2">
          {idea.pillar && <span className="rounded bg-bg-tertiary px-2 py-1 font-mono text-[10px] text-text-secondary">{idea.pillar}</span>}
          <span className={cn('rounded px-2 py-1 font-mono text-[10px]', ready ? 'bg-[#FFB869]/10 text-[#FFB869]' : 'bg-bg-tertiary text-text-tertiary')}>
            {statusLabel(idea.status)}
          </span>
        </span>
      </button>
      {(ready || (canEdit && forward && onMove)) && (
        <div className="relative mt-4 flex flex-wrap items-center justify-between gap-2">
          {ready && <Link href={`/shoot?idea=${idea.id}`} className={shootClass}><Video className="h-4 w-4" aria-hidden="true" />Shoot this</Link>}
          {canEdit && forward && onMove && (
            <button type="button" className={cn(actionClass, 'ml-auto')} disabled={busy}
              aria-label={`Move ${idea.title} to ${statusLabel(forward)}`}
              title={`Move to ${statusLabel(forward)}`} onClick={() => onMove(idea, forward)}>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </article>
  )
}
