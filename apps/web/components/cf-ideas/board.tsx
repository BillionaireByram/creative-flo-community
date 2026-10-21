'use client'

import { useId, useState } from 'react'
import { cn } from '@/lib/utils'
import { BOARD_COLUMNS, groupByStatus } from './script'
import { IdeaCard } from './idea-card'
import type { BoardStatus, Idea } from './types'

interface IdeasBoardProps {
  ideas: Idea[]
  canEdit: boolean
  onOpen: (idea: Idea) => void
  onMove?: (idea: Idea, status: BoardStatus) => void
  busyIds?: ReadonlySet<string>
}

export function IdeasBoard({ ideas, canEdit, onOpen, onMove, busyIds }: IdeasBoardProps) {
  const [active, setActive] = useState<BoardStatus>('idea')
  const groups = groupByStatus(ideas)
  const id = useId()

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Idea columns" className="grid grid-cols-4 gap-1 rounded-xl border border-border bg-bg-secondary p-1 md:hidden">
        {BOARD_COLUMNS.map((column) => (
          <button key={column.status} type="button" aria-pressed={active === column.status}
            aria-controls={`${id}-${column.status}`} onClick={() => setActive(column.status)}
            className={cn('min-h-14 rounded-lg px-1 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              active === column.status ? 'bg-accent-muted text-text-primary' : 'text-text-secondary [@media(hover:hover)]:hover:bg-bg-hover')}>
            <span className="block">{column.label}</span>{' '}
            <span className="mt-1 block font-mono text-[10px]">{groups[column.status].length}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-4">
        {BOARD_COLUMNS.map((column) => (
          <section key={column.status} id={`${id}-${column.status}`} aria-labelledby={`${id}-${column.status}-heading`}
            data-status={column.status} data-active={active === column.status}
            className={cn('min-w-0 space-y-3', active !== column.status && 'hidden md:block')}>
            <div className="flex items-center justify-between px-1 py-2">
              <h2 id={`${id}-${column.status}-heading`} className="text-sm font-medium text-text-secondary">{column.label}</h2>
              <span className="font-mono text-xs text-text-tertiary">{groups[column.status].length}</span>
            </div>
            {groups[column.status].map((idea) => (
              <IdeaCard key={idea.id} idea={idea} canEdit={canEdit} onOpen={onOpen} onMove={onMove} busy={busyIds?.has(idea.id)} />
            ))}
            {groups[column.status].length === 0 && (
              <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-tertiary">
                {column.status === 'idea' ? 'Your next story starts here.' : 'No ideas here yet.'}
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
