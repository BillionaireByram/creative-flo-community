'use client'

import * as React from 'react'
import * as Popover from '@radix-ui/react-popover'
import { ArrowUpDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useViewStore, type SortKey } from '@/stores/view-store'

const sortOptions: { value: SortKey; label: string }[] = [
  { value: 'custom', label: 'Custom' },
  { value: 'date', label: 'Date' },
  { value: 'name', label: 'Name' },
  { value: 'status', label: 'Status' },
  { value: 'type', label: 'Type' },
]

export function SortPopover() {
  const { sortKey, setSortKey, sortDirection, toggleSortDirection } = useViewStore()
  const activeLabel = sortOptions.find((o) => o.value === sortKey)?.label ?? 'Custom'

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button aria-label={`Sort: ${activeLabel}`} className="flex shrink-0 whitespace-nowrap items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm text-text-secondary [@media(hover:hover)]:hover:text-text-primary [@media(hover:hover)]:hover:bg-white/5 transition-colors [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11">
          <ArrowUpDown className="h-4 w-4" />
          <span className="hidden sm:inline">Sorted by</span>
          <span className="hidden sm:inline text-text-primary font-medium">{activeLabel}</span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content collisionPadding={8}
          side="bottom"
          align="start"
          sideOffset={6}
          className="z-50 w-48 rounded-xl border border-white/10 bg-[#1a1a1f] shadow-2xl py-1.5
            data-[state=open]:animate-in data-[state=closed]:animate-out
            data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
            data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 max-w-[calc(100vw-16px)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto"
        >
          {sortOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                if (sortKey === opt.value) {
                  toggleSortDirection()
                } else {
                  setSortKey(opt.value)
                }
              }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors [@media(pointer:coarse)]:min-h-11',
                sortKey === opt.value
                  ? 'text-accent'
                  : 'text-text-secondary [@media(hover:hover)]:hover:text-text-primary [@media(hover:hover)]:hover:bg-white/5',
              )}
            >
              <span className="w-4 shrink-0">
                {sortKey === opt.value && <Check className="h-3.5 w-3.5" />}
              </span>
              {opt.label}
              {sortKey === opt.value && (
                <span className="ml-auto text-xs text-text-tertiary">
                  {sortDirection === 'asc' ? 'A-Z' : 'Z-A'}
                </span>
              )}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
