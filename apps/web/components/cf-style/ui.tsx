'use client'

import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { actionClass, fieldClass } from '@/components/cf-ideas/styles'
export { actionClass, fieldClass }
export const primaryClass = `${actionClass} bg-accent text-white border-transparent hover:opacity-90`
export const panelClass = 'min-w-0 rounded-2xl border border-border bg-bg-secondary p-4 sm:p-6'

export function ErrorState({ children, retry }: { children: ReactNode; retry?: () => void }) {
  return <div role="alert" className="space-y-3 rounded-xl border border-border p-4 text-sm text-status-warning"><p className="break-words">{children}</p>{retry && <button type="button" className={actionClass} onClick={retry}>Retry</button>}</div>
}
export function Loading({ label = 'Loading styles...' }: { label?: string }) {
  return <p role="status" className="p-4 text-sm text-text-secondary">{label}</p>
}
export function StudioDialog({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: ReactNode }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" />
    <Dialog.Content className="fixed inset-x-4 top-1/2 z-[61] mx-auto max-h-[85dvh] max-w-lg -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-bg-primary p-4 text-text-primary shadow-xl sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-4"><div><Dialog.Title className="text-xl font-semibold">{title}</Dialog.Title><Dialog.Description className="mt-2 text-sm text-text-secondary">{description}</Dialog.Description></div>
        <Dialog.Close asChild><button type="button" className={actionClass} aria-label="Close dialog"><X size={18} aria-hidden="true" /></button></Dialog.Close></div>
      {children}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}
