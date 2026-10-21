'use client'

import Link from 'next/link'
import { Check, ChevronDown, ExternalLink, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { assetUrl, brandLabel, type Brand, type Idea } from './api'
import { formatDuration } from './media'
import { FONT_SIZES, SPEED_MAX, SPEED_MIN } from './teleprompter'
import type { ShootSettings } from './settings'
import type { ShootSessionTake } from './shoot-app'

interface SetupScreenProps {
  settings: ShootSettings
  brands: Brand[]
  brandsLoading: boolean
  brandsError: boolean
  ideas: Idea[]
  ideasLoading: boolean
  ideasError: boolean
  selectedIdea: Idea | null
  text: string
  takes: ShootSessionTake[]
  onChange: (patch: Partial<ShootSettings>) => void
  onStart: () => void
  onReviewTake: (id: string) => void
  onRetryBrands: () => void
  onRetryIdeas: () => void
}

const segment = 'min-h-11 min-w-11 flex-1 rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
const selectedSegment = 'bg-accent text-text-inverse'
const plainSegment = 'text-text-secondary [@media(hover:hover)]:hover:bg-bg-hover'
const fontSizes: Array<keyof typeof FONT_SIZES> = ['S', 'M', 'L', 'XL']

function Toggle({ label, description, checked, onChange }: {
  label: string
  description: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={onChange} className="flex min-h-14 w-full items-center justify-between gap-4 rounded-lg py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
      <span>
        <span className="block text-sm font-medium text-text-primary">{label}</span>
        <span className="block text-xs text-text-secondary">{description}</span>
      </span>
      <span aria-hidden="true" className={cn('flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors', checked ? 'bg-accent' : 'bg-bg-tertiary ring-1 ring-border')}>
        <span className={cn('h-5 w-5 rounded-full bg-white transition-transform', checked && 'translate-x-5')} />
      </span>
    </button>
  )
}

function takeStatus(entry: ShootSessionTake): string {
  switch (entry.upload.phase) {
    case 'done': return 'Saved to Content Bin'
    case 'failed': return 'Upload needs a retry'
    case 'initiating': return 'Preparing upload…'
    case 'uploading': return `Saving · ${Math.round(entry.upload.percent)}%`
    case 'completing': return 'Finishing upload…'
    default: return 'Not saved yet'
  }
}

export function SetupScreen({ settings, brands, brandsLoading, brandsError, ideas, ideasLoading, ideasError, selectedIdea, text, takes, onChange, onStart, onReviewTake, onRetryBrands, onRetryIdeas }: SetupScreenProps) {
  const brand = brands.find((item) => item.brand === settings.brand)
  const canStart = Boolean(brand && text.trim()) && !brandsLoading

  return (
    <div className="mx-auto max-w-xl space-y-6 p-4 font-sans sm:p-6">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold text-text-primary">Shoot</h1>
        <p className="text-sm text-text-secondary">Pick a script. Find your frame. Hit record.</p>
      </header>

      <section aria-labelledby="shoot-brand" className="space-y-3 rounded-xl border border-border bg-bg-secondary p-4">
        <h2 id="shoot-brand" className="text-sm font-semibold text-text-primary">Brand</h2>
        {brandsLoading ? (
          <p role="status" className="text-sm text-text-secondary">Loading brands…</p>
        ) : brandsError ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-text-secondary">Couldn&apos;t load your brands.</p>
            <Button type="button" variant="secondary" className="min-h-11 rounded-xl" aria-label="Try loading brands again" onClick={onRetryBrands}>Try again</Button>
          </div>
        ) : brands.length === 0 ? (
          <p className="text-sm leading-relaxed text-text-secondary">No brand projects yet. Link a project to a brand first.</p>
        ) : (
          <div role="group" aria-label="Choose a brand" className="flex flex-wrap gap-1 rounded-xl bg-bg-tertiary p-1">
            {brands.map((item) => (
              <button key={item.project_id} type="button" aria-label={`Shoot for ${brandLabel(item)}`} aria-pressed={settings.brand === item.brand} onClick={() => onChange({ brand: item.brand })} className={cn(segment, settings.brand === item.brand ? selectedSegment : plainSegment)}>{brandLabel(item)}</button>
            ))}
          </div>
        )}
        {brand && <p className="text-xs text-text-secondary">Takes save to {brandLabel(brand)} / Content Bin.</p>}
      </section>

      <section aria-labelledby="shoot-script" className="space-y-3 rounded-xl border border-border bg-bg-secondary p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="shoot-script" className="text-sm font-semibold text-text-primary">Script</h2>
          {ideas.length > 0 && <span className="text-xs text-text-secondary">Ready to shoot</span>}
        </div>
        {ideasLoading && <p role="status" className="text-sm text-text-secondary">Loading scripts…</p>}
        {ideasError && (
          <div className="space-y-1">
            <p role="alert" className="text-sm text-text-secondary">Couldn&apos;t load ideas. You can still paste a script.</p>
            <button type="button" aria-label="Try loading ideas again" onClick={onRetryIdeas} className="min-h-11 rounded-lg px-2 text-sm font-medium text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Try again</button>
          </div>
        )}
        {!ideasLoading && !ideasError && ideas.length === 0 && brand && <p className="text-sm leading-relaxed text-text-secondary">No ideas marked ready for {brandLabel(brand)}. Paste a script to shoot freestyle.</p>}
        <div role="group" aria-label="Choose a script" className="space-y-2">
          {ideas.map((idea) => {
            const selected = settings.ideaId === idea.id
            return (
              <button key={idea.id} type="button" aria-label={`Use script: ${idea.title}`} aria-pressed={selected} onClick={() => onChange({ ideaId: idea.id })} className={cn('flex min-h-14 w-full items-center gap-3 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', selected ? 'border-accent bg-bg-tertiary' : 'border-border [@media(hover:hover)]:hover:bg-bg-tertiary')}>
                <span aria-hidden="true" className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', selected ? 'border-accent bg-accent text-text-inverse' : 'border-border')}>
                  {selected && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-text-primary">{idea.title}</span>
                  {idea.hook && <span className="mt-1 block truncate text-xs text-text-secondary">{idea.hook}</span>}
                </span>
              </button>
            )
          })}
          <button type="button" aria-label="Paste a script" aria-pressed={settings.ideaId === null} onClick={() => onChange({ ideaId: null })} className={cn('flex min-h-14 w-full items-center gap-3 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', settings.ideaId === null ? 'border-accent bg-bg-tertiary' : 'border-border [@media(hover:hover)]:hover:bg-bg-tertiary')}>
            <span aria-hidden="true" className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', settings.ideaId === null ? 'border-accent bg-accent text-text-inverse' : 'border-border')}>
              {settings.ideaId === null && <Check className="h-3.5 w-3.5" />}
            </span>
            <span className="text-sm font-medium text-text-primary">Paste a script</span>
          </button>
        </div>
        {settings.ideaId === null ? (
          <div className="space-y-2">
            <label htmlFor="shoot-free-text" className="text-xs text-text-secondary">Your teleprompter text</label>
            <textarea id="shoot-free-text" value={settings.freeText} onChange={(event) => onChange({ freeText: event.target.value })} rows={7} placeholder="Paste your script here…" className="w-full resize-y rounded-xl border border-border bg-bg-primary p-3 text-base leading-relaxed text-text-primary placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" />
          </div>
        ) : selectedIdea && (
          <details className="group rounded-xl bg-bg-tertiary">
            <summary aria-label="Preview teleprompter text" className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 text-sm text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
              Preview script
              <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <p className="max-h-64 overflow-y-auto whitespace-pre-wrap px-3 pb-3 text-sm leading-relaxed text-text-primary">{text || 'This idea has no script yet. Paste a script to get started.'}</p>
          </details>
        )}
      </section>

      <section aria-labelledby="shoot-camera" className="space-y-3 rounded-xl border border-border bg-bg-secondary p-4">
        <h2 id="shoot-camera" className="text-sm font-semibold text-text-primary">Camera</h2>
        <div role="group" aria-label="Camera facing" className="flex gap-1 rounded-xl bg-bg-tertiary p-1">
          {(['user', 'environment'] as const).map((facing) => (
            <button key={facing} type="button" aria-label={`${facing === 'user' ? 'Front' : 'Back'} camera`} aria-pressed={settings.facing === facing} onClick={() => onChange({ facing })} className={cn(segment, settings.facing === facing ? selectedSegment : plainSegment)}>{facing === 'user' ? 'Front' : 'Back'}</button>
          ))}
        </div>
        <Toggle label="Studio Look" description="Blurs your background so you stand out. Uses your phone's Portrait effect." checked={settings.studioLook} onChange={() => onChange({ studioLook: !settings.studioLook })} />
        <div role="group" aria-label="Capture quality" aria-describedby="shoot-quality-help" className="flex gap-1 rounded-xl bg-bg-tertiary p-1">
          {(['4k', '1080p'] as const).map((quality) => (
            <button key={quality} type="button" aria-pressed={settings.quality === quality} onClick={() => onChange({ quality })} className={cn(segment, settings.quality === quality ? selectedSegment : plainSegment)}>{quality === '4k' ? '4K' : '1080p'}</button>
          ))}
        </div>
        <p id="shoot-quality-help" className="text-xs text-text-secondary">4K looks sharpest. Use 1080p if uploads are slow.</p>
      </section>

      <section aria-labelledby="shoot-prompter" className="space-y-4 rounded-xl border border-border bg-bg-secondary p-4">
        <h2 id="shoot-prompter" className="text-sm font-semibold text-text-primary">Teleprompter</h2>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="shoot-speed" className="text-sm text-text-secondary">Scroll speed</label>
            <output htmlFor="shoot-speed" className="font-mono text-sm text-accent">{settings.speed} / 10</output>
          </div>
          <input id="shoot-speed" type="range" min={SPEED_MIN} max={SPEED_MAX} step={1} value={settings.speed} onChange={(event) => onChange({ speed: Number(event.target.value) })} className="h-11 w-full cursor-pointer accent-[#00A0FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" />
          <div aria-hidden="true" className="flex justify-between text-xs text-text-secondary"><span>Easy pace</span><span>Quick read</span></div>
        </div>
        <div className="space-y-2">
          <p id="shoot-font-size" className="text-sm text-text-secondary">Text size</p>
          <div role="group" aria-labelledby="shoot-font-size" className="flex gap-1 rounded-xl bg-bg-tertiary p-1">
            {fontSizes.map((size) => <button key={size} type="button" aria-label={`Text size ${size}`} aria-pressed={settings.fontSize === size} onClick={() => onChange({ fontSize: size })} className={cn(segment, settings.fontSize === size ? selectedSegment : plainSegment)}>{size}</button>)}
          </div>
        </div>
        <div className="divide-y divide-border">
          <Toggle label="Mirror text" description="For a teleprompter rig" checked={settings.mirror} onChange={() => onChange({ mirror: !settings.mirror })} />
          <Toggle label="3s countdown" description="A moment to get ready" checked={settings.countdown} onChange={() => onChange({ countdown: !settings.countdown })} />
        </div>
      </section>

      <section aria-labelledby="shoot-aspect" className="space-y-3 rounded-xl border border-border bg-bg-secondary p-4">
        <h2 id="shoot-aspect" className="text-sm font-semibold text-text-primary">Frame</h2>
        <div role="group" aria-label="Frame aspect ratio" className="flex gap-1 rounded-xl bg-bg-tertiary p-1">
          {(['9:16', '16:9'] as const).map((aspect) => <button key={aspect} type="button" aria-label={`${aspect === '9:16' ? 'Vertical' : 'Horizontal'} ${aspect}`} aria-pressed={settings.aspect === aspect} onClick={() => onChange({ aspect })} className={cn(segment, settings.aspect === aspect ? selectedSegment : plainSegment)}><span className="block">{aspect === '9:16' ? 'Vertical' : 'Horizontal'}</span><span className="block font-mono text-xs opacity-75">{aspect}</span></button>)}
        </div>
        <p className="text-xs text-text-secondary">A guide for framing. Your camera sets the saved video size.</p>
      </section>

      <div className="sticky bottom-0 z-30 space-y-2 border-t border-border bg-bg-primary py-3 pb-safe [--ff-pb:1rem]">
        <Button type="button" aria-label="Start camera" disabled={!canStart} onClick={onStart} className="h-14 w-full rounded-xl text-base font-semibold">
          <Video aria-hidden="true" className="h-5 w-5" />
          Start camera
        </Button>
        {!text.trim() && <p className="text-center text-xs text-text-secondary">Choose a script or paste your own to start.</p>}
      </div>

      {takes.length > 0 && (
        <section aria-labelledby="shoot-session" className="space-y-3 pb-16">
          <div className="flex items-center justify-between">
            <h2 id="shoot-session" className="text-sm font-semibold text-text-primary">This session</h2>
            <span className="font-mono text-xs text-text-secondary">{takes.length} {takes.length === 1 ? 'take' : 'takes'}</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-bg-secondary">
            {[...takes].reverse().map((entry) => (
              <div key={entry.take.id} className="border-b border-border p-3 last:border-b-0">
                <button type="button" aria-label={`Review ${entry.title || 'Freestyle'} take`} onClick={() => onReviewTake(entry.take.id)} className="flex min-h-14 w-full items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-bg-tertiary text-accent"><Video className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text-primary">{entry.title || 'Freestyle'}</span>
                    <span className="mt-1 block text-xs text-text-secondary">{brandLabel(entry.brand)} · {takeStatus(entry)}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-text-secondary">{formatDuration(entry.take.durationMs)}</span>
                </button>
                {entry.upload.assetId && (
                  <Link href={assetUrl(entry.brand.project_id, entry.upload.assetId)} aria-label={`Open saved ${entry.title || 'Freestyle'} take in Creative Flo`} className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs font-medium text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Open in Creative Flo<ExternalLink aria-hidden="true" className="h-3.5 w-3.5" /></Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
