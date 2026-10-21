'use client'

import { useRef, useState, type CSSProperties } from 'react'
import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fontFamily, useStyleFonts } from './fonts'
import type { StylePreview, StyleVersion } from './types'
import { actionClass } from './ui'
import css from './style-card.module.css'

export const safeColor = (color?: string) => color && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? color : '#d9b26a'
export const safeMediaUrl = (url?: string | null) => url && (/^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url)) ? url : undefined
/** One sample video. The address comes with the style version (or the template), so nothing else is fetched. */
export function SampleVideo({ url, posterUrl, name, status, processing = false, autoPreview = false }: {
  url?: string | null; posterUrl?: string | null; name: string; status?: StyleVersion['status']; processing?: boolean; autoPreview?: boolean
}) {
  const video = useRef<HTMLVideoElement>(null)
  const [play, setPlay] = useState(false)
  const [mediaError, setMediaError] = useState(false)
  const source = safeMediaUrl(url)
  if (!source) return <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-border bg-bg-tertiary p-6 text-center text-sm text-text-secondary">
    {status === 'building' ? 'Flo is building your sample...' : processing ? 'Your sample video is almost ready.' : 'Sample renders after your style is built'}
  </div>
  if (mediaError) return <div role="alert" className="space-y-3 rounded-xl bg-bg-tertiary p-4 text-sm"><p>Could not play this sample.</p><button type="button" className={actionClass} onClick={() => { setMediaError(false); setPlay(false) }}>Try again</button></div>
  if (play || autoPreview) return <div className={cn('relative w-full min-w-0 overflow-hidden rounded-xl bg-black', autoPreview ? 'mx-auto aspect-[9/16] max-w-xs' : 'aspect-video')}>
    <video ref={video} aria-label={`${name} sample video`} className="block h-full w-full min-w-0 object-contain" controls={play} muted={autoPreview && !play} loop={autoPreview} playsInline preload="metadata" autoPlay src={source} poster={safeMediaUrl(posterUrl)} onError={() => setMediaError(true)} />
    {autoPreview && !play && <button type="button" aria-label={`Play ${name} sample with sound`} onClick={() => {
      if (video.current) {
        video.current.muted = false
        void video.current.play().catch(() => setMediaError(true))
      }
      setPlay(true)
    }} className="absolute inset-x-3 bottom-3 flex min-h-11 items-center justify-center gap-2 rounded-full bg-black/75 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><Play size={18} aria-hidden="true" />Play with sound</button>}
  </div>
  return <button type="button" aria-label={`Play ${name} sample`} onClick={() => setPlay(true)}
    className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
    <span className="relative flex min-h-11 items-center gap-2 rounded-full bg-black/75 px-5 text-sm text-white"><Play size={18} aria-hidden="true" />Play sample</span>
  </button>
}
export function MotionSample({ preview, name }: { preview?: StylePreview | null; name: string }) {
  const pace = Math.min(5, Math.max(1, preview?.pace ?? 3))
  return <div role="img" aria-label={`${name} motion sample`} className={css.motion} data-treatment={preview?.caption_style?.toLowerCase()}
    style={{ '--sample-bg': safeColor(preview?.palette?.[0]), '--sample-color': safeColor(preview?.palette?.[1] ?? preview?.palette?.[0]), '--sample-duration': `${8 - pace}s`, fontFamily: fontFamily(preview?.fonts?.[0]) } as CSSProperties}>
    <strong>{preview?.caption_sample || name}</strong>
  </div>
}
export function StyleCard({ name, preview: supplied, version, sampleUrl, posterUrl, compact = false, motion = false }: {
  name: string; preview?: StylePreview | null; version?: StyleVersion | null; sampleUrl?: string | null; posterUrl?: string | null; compact?: boolean; motion?: boolean
}) {
  useStyleFonts()
  const preview: StylePreview | undefined = supplied ?? version?.preview
  const fonts = Array.isArray(preview?.fonts) ? preview.fonts : []
  const palette = Array.isArray(preview?.palette) ? preview.palette : []
  const pace = typeof preview?.pace === 'number' ? Math.min(5, Math.max(1, Math.round(preview.pace))) : null
  const source = safeMediaUrl(version?.sample_url ?? sampleUrl)
  const showMotion = motion && !source
  return <div className={cn('min-w-0 space-y-4', compact ? 'text-sm' : 'text-base')}>
    {showMotion && <MotionSample preview={preview} name={name} />}
    {(!showMotion || !!version?.sample_asset_id) && <SampleVideo key={`${version?.id ?? name}:${source ?? ''}`} url={source} posterUrl={posterUrl} name={name} status={version?.status} processing={!!version?.sample_asset_id} autoPreview={motion} />}
    {palette.length > 0 && <div aria-label="Palette" className="flex flex-wrap gap-2">{palette.map((color, index) => <span key={`${color}-${index}`} className="flex items-center gap-1.5 text-xs text-text-secondary"><span role="img" aria-label={color} className="h-6 w-6 rounded-full border border-border" style={{ backgroundColor: safeColor(color) }} />{color}</span>)}</div>}
    {fonts.map((font, index) => <p key={`${font}-${index}`} className="break-words text-xl" style={{ fontFamily: fontFamily(font) }}>{font}</p>)}
    {preview?.caption_sample && <p className={`${css.caption} whitespace-pre-line`} data-treatment={preview.caption_style?.toLowerCase()} style={{ fontFamily: fontFamily(fonts[0]), '--sample-color': safeColor(palette[1] ?? palette[0]) } as CSSProperties}>{preview.caption_sample}</p>}
    <div className="flex items-center gap-3 text-xs text-text-secondary"><span>Pace</span><div role="meter" aria-label="Editing pace" aria-valuemin={1} aria-valuemax={5} aria-valuenow={pace ?? undefined} aria-valuetext={pace ? `${pace} of 5` : 'Not set'} className="flex gap-1">{[1, 2, 3, 4, 5].map((step) => <span key={step} className={cn('h-2 w-5 rounded-full', pace && step <= pace ? 'bg-accent' : 'bg-bg-hover')} />)}</div><span>{pace ? `${pace}/5` : 'Not set'}</span></div>
    {(['music_beds', 'transitions'] as const).map((field) => Array.isArray(preview?.[field]) && !!preview[field]?.length && <div key={field} className="space-y-2"><p className="text-xs text-text-secondary">{field === 'music_beds' ? 'Music beds' : 'Transitions'}</p><div className="flex flex-wrap gap-2">{preview[field]?.map((item, index) => <span key={`${item}-${index}`} className="max-w-full break-words rounded-full border border-border px-3 py-1 text-xs text-text-secondary">{item}</span>)}</div></div>)}
  </div>
}
