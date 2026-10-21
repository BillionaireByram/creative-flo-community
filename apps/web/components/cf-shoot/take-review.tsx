'use client'

import * as React from 'react'
import Link from 'next/link'
import { AlertTriangle, Check, Download, ExternalLink, RotateCcw, ShieldCheck, Upload, X } from 'lucide-react'
import { assetUrl, brandLabel } from './api'
import { formatDuration } from './media'
import { useStreamUrl } from '@/hooks/use-stream-url'
import type { ShootSessionTake } from './shoot-app'

interface TakeReviewProps {
  entry: ShootSessionTake
  onRetake: () => void
  onKeep: () => void
  onRetry: () => void
  onShootAnother: () => void
  onDone: () => void
}

const primary = 'flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#00A0FF] px-4 font-semibold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black'
const secondary = 'flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-white/30 px-4 font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A0FF]'

export function TakeReview({ entry, onRetake, onKeep, onRetry, onShootAnother, onDone }: TakeReviewProps) {
  const rootRef = React.useRef<HTMLDivElement>(null)
  const { take, upload } = entry
  const busy = upload.phase === 'initiating' || upload.phase === 'uploading' || upload.phase === 'completing'
  const saved = upload.phase === 'done'
  const failed = upload.phase === 'failed'
  const stream = useStreamUrl(saved ? upload.assetId : null, saved ? upload.versionId : null)
  const [nativeHls, setNativeHls] = React.useState(false)
  const [failedPreview, setFailedPreview] = React.useState<string | null>(null)
  React.useEffect(() => {
    setNativeHls(document.createElement('video').canPlayType('application/vnd.apple.mpegurl') !== '')
  }, [])
  const source = saved ? stream.url : take.url
  const hls = Boolean(source && /\.m3u8(?:[?#]|$)/i.test(source))
  const canPreview = Boolean(source && source !== failedPreview && (!saved || (!stream.error && (!hls || nativeHls))))

  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    rootRef.current?.focus({ preventScroll: true })
    return () => { document.body.style.overflow = previousOverflow }
  }, [])

  function handleDialogKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onDone()
    } else if (event.key === 'Tab') {
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex="0"]'))
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) {
        event.preventDefault()
        first?.focus()
      }
    }
  }

  return (
    <div ref={rootRef} role="dialog" aria-modal="true" aria-label="Review your take" tabIndex={-1} onKeyDown={handleDialogKey} className="fixed inset-0 z-50 flex flex-col bg-black font-sans text-white outline-none pt-safe pb-safe pl-safe pr-safe [--ff-pt:0.75rem] [--ff-pb:1rem] [--ff-pl:1rem] [--ff-pr:1rem]">
      <header className="mx-auto flex w-full max-w-xl shrink-0 items-center justify-between gap-3 pb-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{entry.title || 'Freestyle'}</h2>
          <p className="mt-1 text-xs text-white/60">{brandLabel(entry.brand)} · <span className="font-mono">{formatDuration(take.durationMs)}</span></p>
        </div>
        <button type="button" aria-label="Back to setup" onClick={onDone} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A0FF]"><X aria-hidden="true" className="h-5 w-5" /></button>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 items-center justify-center overflow-hidden rounded-xl">
        {canPreview && source ? (
          <video key={source} controls playsInline src={source} onError={() => setFailedPreview(source)} tabIndex={0} aria-label="Recorded take preview" className="h-full w-full object-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00A0FF]" />
        ) : (
          <p className="p-4 text-center text-sm text-white/70">{saved ? 'Saved. Open it in Creative Flo to watch it back.' : 'Preview unavailable. Save this take to your phone to watch it back.'}</p>
        )}
      </div>

      <div className="mx-auto max-h-[55%] w-full max-w-xl shrink-0 space-y-4 overflow-y-auto pt-4">
        {entry.recovered && <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-300/20 bg-white/5 px-3 py-2 text-xs leading-relaxed text-white/80"><AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />Recovered take. The recording stopped early, so this may be cut short.</p>}
        {!saved && (entry.stored
          ? <p className="flex items-start gap-2 text-xs leading-relaxed text-white/70"><Check aria-hidden="true" className="hidden" /><ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#00A0FF]" />Safe on this phone</p>
          : <p className="flex items-start gap-2 text-xs leading-relaxed text-white/70"><AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />Not saved on this phone yet. Keep this screen open or tap Save to phone.</p>)}
        <div aria-live="polite" aria-atomic="true">
          {busy && (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm"><Upload aria-hidden="true" className="h-4 w-4 text-[#00A0FF]" />Saving to Content Bin…</p>
              <div role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(upload.percent)} className="h-1.5 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-[#00A0FF] transition-[width] duration-200" style={{ width: `${Math.min(100, Math.max(0, upload.percent))}%` }} />
              </div>
              <p className="text-xs text-white/60">{upload.phase === 'completing' ? 'Finishing up…' : 'You can shoot another take while this saves.'}</p>
            </div>
          )}
          {failed && (
            <div className="space-y-2 rounded-xl border border-white/20 bg-white/5 p-4">
              <p className="flex items-center gap-2 text-sm font-medium"><AlertTriangle aria-hidden="true" className="h-4 w-4 text-[#00A0FF]" />Couldn&apos;t save this take</p>
              <p className="text-sm leading-relaxed text-white/70">{upload.error}</p>
            </div>
          )}
          {saved && (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium"><Check aria-hidden="true" className="h-5 w-5 text-[#00A0FF]" />Saved to Content Bin</p>
              {upload.note && <p className="text-xs leading-relaxed text-white/60">{upload.note}</p>}
            </div>
          )}
        </div>

        {saved && upload.assetId && (
          <Link href={assetUrl(entry.brand.project_id, upload.assetId)} aria-label="Open saved take in Creative Flo" className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-[#00A0FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A0FF]">Open in Creative Flo<ExternalLink aria-hidden="true" className="h-4 w-4" /></Link>
        )}

        {upload.phase === 'idle' ? (
          <div className="grid grid-cols-2 gap-3">
            <button type="button" aria-label="Discard this take and retake" onClick={onRetake} className={secondary}><RotateCcw aria-hidden="true" className="h-5 w-5" />Retake</button>
            <button type="button" aria-label="Keep and upload this take" onClick={onKeep} className={primary}><Check aria-hidden="true" className="h-5 w-5" />Keep</button>
          </div>
        ) : (
          <div className="space-y-3">
            {failed && <button type="button" aria-label="Retry this take's upload" onClick={onRetry} className={primary}><RotateCcw aria-hidden="true" className="h-5 w-5" />Retry</button>}
            <button type="button" aria-label="Shoot another take with this script" onClick={onShootAnother} className={saved ? primary : secondary}>Shoot another take</button>
            {saved && <button type="button" aria-label="Done, back to setup" onClick={onDone} className={secondary}>Done</button>}
          </div>
        )}

        {!saved && take.url && <a href={take.url} download={entry.fileName} aria-label="Save this take to your phone" className="flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm text-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A0FF]"><Download aria-hidden="true" className="h-4 w-4" />Save to phone</a>}
      </div>
    </div>
  )
}
