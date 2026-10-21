'use client'

import { AlertTriangle } from 'lucide-react'
import { brandLabel } from './api'
import { formatDuration } from './media'
import type { ShootSessionTake } from './shoot-app'

interface RestorePanelProps {
  takes: ShootSessionTake[]
  onResume: (entry: ShootSessionTake) => void
  onDiscard: (entry: ShootSessionTake) => void
}

const action = 'inline-flex min-h-11 items-center justify-center rounded-xl px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function RestorePanel({ takes, onResume, onDiscard }: RestorePanelProps) {
  const waiting = takes.filter((entry) => entry.restored && entry.upload.phase !== 'done')
  if (waiting.length === 0) return null
  return (
    <div className="mx-auto mt-4 max-w-xl px-4 font-sans sm:mt-6 sm:px-6">
      <section aria-labelledby="shoot-restored" className="space-y-4 rounded-xl border border-border bg-bg-secondary p-4">
        <h2 id="shoot-restored" className="flex items-center gap-2 text-sm font-semibold text-text-primary"><AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-status-warning" />Takes waiting on this phone</h2>
        <ul className="space-y-3">
          {waiting.map((entry) => {
            const busy = ['initiating', 'uploading', 'completing'].includes(entry.upload.phase)
            return (
              <li key={entry.take.id} className="space-y-3 rounded-xl border border-border bg-bg-primary p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <h3 className="break-words text-sm font-semibold leading-snug text-text-primary">{entry.title || 'Freestyle'}</h3>
                    <p className="break-words text-xs leading-relaxed text-text-secondary">{brandLabel(entry.brand)} · {formatDuration(entry.take.durationMs)}</p>
                  </div>
                  {entry.recovered && <span className="inline-block shrink-0 rounded-full border border-border bg-bg-tertiary px-2 py-1 text-xs font-medium text-text-secondary">Recovered</span>}
                </div>
                {busy && (
                  <div className="space-y-1">
                    <p role="status" className="text-sm text-text-secondary">{entry.upload.phase === 'completing' ? 'Finishing upload…' : `Saving · ${Math.round(entry.upload.percent)}%`}</p>
                    <progress aria-label={`Upload progress for ${entry.title || 'Freestyle'}`} max={100} value={entry.upload.percent} className="block h-2 w-full appearance-none overflow-hidden rounded-full bg-bg-tertiary accent-accent [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-bg-tertiary [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-accent [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-accent" />
                  </div>
                )}
                {entry.upload.phase === 'failed' && entry.upload.error && <p role="alert" className="text-sm text-text-secondary">{entry.upload.error}</p>}
                <div className="space-y-2">
                  <button type="button" disabled={busy} onClick={() => onResume(entry)} className={`${action} w-full bg-accent text-text-inverse [@media(hover:hover)]:hover:bg-accent-hover disabled:opacity-50`}>Resume upload</button>
                  <div className="grid grid-cols-2 gap-2">
                    {entry.take.url && <a href={entry.take.url} download={entry.fileName} className={`${action} min-w-0 border border-border text-center text-text-primary [@media(hover:hover)]:hover:bg-bg-hover`}>Save to phone</a>}
                    <button type="button" className={`${action} min-w-0 border border-border text-status-error [@media(hover:hover)]:hover:bg-bg-hover`} onClick={() => {
                      if (window.confirm('Discard this take? It will be deleted from this phone.')) onDiscard(entry)
                    }}>Discard</button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
