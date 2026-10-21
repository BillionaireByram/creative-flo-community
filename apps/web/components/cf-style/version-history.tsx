'use client'

import { useState } from 'react'
import type { StyleVersion } from './types'
import { approveVersion, rejectVersion, restoreVersion, retryVersion } from './api'
import { formatStyleDate } from './templates-gallery'
import { actionClass, fieldClass, panelClass, primaryClass } from './ui'

export function VersionHistory({ versions, currentId, selectedId, onSelect, canEdit, busy, run }: {
  versions: StyleVersion[]; currentId?: string | null; selectedId?: string; onSelect: (id: string) => void; canEdit: boolean; busy: boolean; run: (action: () => Promise<unknown>) => Promise<boolean>
}) {
  const [notes, setNotes] = useState<Record<string, string>>({})
  const currentNumber = versions.find((version) => version.id === currentId)?.version ?? 0
  return <section className="space-y-4"><h2 className="text-xl font-semibold">Version history</h2>{versions.length === 0 && <p className="text-sm text-text-secondary">This draft has no versions yet. Take the interview to build your first one.</p>}
    {[...versions].sort((a, b) => b.version - a.version).map((version) => <article key={version.id} className={`${panelClass} space-y-3`}>
      <div className="flex flex-wrap items-center gap-3"><button className={actionClass} aria-pressed={selectedId === version.id} onClick={() => onSelect(version.id)}>Version {version.version}</button><span className="text-sm capitalize text-text-secondary">{version.status}</span>{currentId === version.id && <span className="text-xs text-accent">Current approved</span>}</div>
      <p className="break-words text-xs text-text-secondary">Created {formatStyleDate(version.created_at)}</p>
      {version.changelog && <p className="whitespace-pre-wrap break-words text-sm text-text-secondary">{version.changelog}</p>}
      {version.status === 'failed' && <div className="space-y-3"><h3 className="font-medium">I need you on this one</h3><p className="break-words text-sm text-text-secondary">{version.error || 'Flo could not finish this version. Please try again.'}</p>{canEdit && <button className={actionClass} disabled={busy} onClick={() => { void run(() => retryVersion(version.id)) }}>Try again</button>}</div>}
      {version.status === 'rejected' && version.error && <p className="whitespace-pre-wrap break-words text-sm text-text-secondary">Your note: {version.error}</p>}
      {version.status === 'proposed' && version.version < currentNumber && <p className="text-sm text-text-secondary">Replaced by a newer approved version.</p>}
      {canEdit && version.status === 'proposed' && version.version > currentNumber && <div className="space-y-3"><label className="block space-y-2 text-sm">Optional rejection note<textarea maxLength={4000} className={fieldClass} value={notes[version.id] ?? ''} onChange={(event) => setNotes({ ...notes, [version.id]: event.target.value })} /></label><div className="flex flex-wrap gap-2"><button className={primaryClass} disabled={busy} onClick={() => { void run(() => approveVersion(version.id)) }}>Approve version {version.version}</button><button className={actionClass} disabled={busy} onClick={() => { void run(() => rejectVersion(version.id, notes[version.id]?.trim())) }}>Reject version {version.version}</button></div></div>}
      {canEdit && version.status === 'approved' && currentId !== version.id && <button className={actionClass} disabled={busy} onClick={() => { void run(() => restoreVersion(version.id)) }}>Restore version {version.version}</button>}
    </article>)}
  </section>
}
