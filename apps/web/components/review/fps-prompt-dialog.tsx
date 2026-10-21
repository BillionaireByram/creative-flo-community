'use client'

import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const FPS_OPTIONS = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60]

interface FpsPromptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (fps: number) => void
}

export function FpsPromptDialog({
  open,
  onOpenChange,
  onConfirm,
}: FpsPromptDialogProps) {
  const [fps, setFps] = React.useState<number>(25)

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto -translate-x-1/2 -translate-y-1/2 data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] rounded-xl border border-border bg-bg-secondary p-5 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <Dialog.Title className="text-sm font-semibold text-text-primary">
            Frame rate needed
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-text-tertiary">
            This video was uploaded before Creative Flo started capturing frame
            rates automatically, so its fps isn&apos;t on file. Pick the
            video&apos;s original frame rate so exported markers land on the
            correct frames. (Newly uploaded videos won&apos;t ask this.)
          </Dialog.Description>

          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {FPS_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={fps === option}
                onClick={() => setFps(option)}
                className={cn(
                  'relative tap-target rounded-md border px-2 py-1.5 text-[13px] font-medium transition-colors [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 shrink-0',
                  fps === option
                    ? 'border-accent bg-accent-muted text-text-primary'
                    : 'border-border text-text-secondary [@media(hover:hover)]:hover:bg-bg-hover',
                )}
              >
                {option}
              </button>
            ))}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="relative tap-target [@media(pointer:coarse)]:min-h-11"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="relative tap-target [@media(pointer:coarse)]:min-h-11"
              onClick={() => {
                onConfirm(fps)
                onOpenChange(false)
              }}
            >
              Export
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
