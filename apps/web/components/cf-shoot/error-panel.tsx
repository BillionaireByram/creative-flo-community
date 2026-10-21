'use client'

import { AlertTriangle, RotateCcw, X } from 'lucide-react'
import type { ShootError } from './media'

interface ShootErrorPanelProps {
  error: ShootError
  onRetry: () => void
  onBack: () => void
}

export function ShootErrorPanel({ error, onRetry, onBack }: ShootErrorPanelProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black font-sans text-white pt-safe pb-safe pl-safe pr-safe [--ff-pt:1.5rem] [--ff-pb:1.5rem] [--ff-pl:1.5rem] [--ff-pr:1.5rem]">
      <div className="w-full max-w-sm space-y-6">
        <AlertTriangle aria-hidden="true" className="h-8 w-8 text-[#00A0FF]" />
        <div role="alert" className="space-y-3">
          <h2 className="text-xl font-semibold">{error.title}</h2>
          <p className="text-sm leading-relaxed text-white/70">{error.message}</p>
        </div>
        <div className="space-y-3">
          {error.retryable && (
            <button type="button" onClick={onRetry} aria-label="Try again" className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#00A0FF] font-semibold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black">
              <RotateCcw aria-hidden="true" className="h-5 w-5" />
              Try again
            </button>
          )}
          <button type="button" onClick={onBack} aria-label="Back to setup" className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-white/30 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A0FF]">
            <X aria-hidden="true" className="h-5 w-5" />
            Back
          </button>
        </div>
      </div>
    </div>
  )
}
