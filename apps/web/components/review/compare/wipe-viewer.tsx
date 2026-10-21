'use client'

import * as React from 'react'
import { ImageFrameConstraint } from '@/components/review/image-frame-constraint'

interface WipeViewerProps {
  urlA: string
  urlB: string
  badgeA: string
  badgeB: string
  transform: {
    styleFor(): React.CSSProperties
    onWheel(e: { deltaY: number; preventDefault(): void }): void
    onPointerDown(e: React.PointerEvent): void
  }
  /**
   * Extra stage layer rendered ABOVE both image layers, inside the shared
   * transform (annotation display). It is CLIPPED in screen space to the region
   * where its owning version is visible — side A left of the divider, side B
   * right (matching the B-image clip) — so a version's annotation never bleeds
   * onto the other version's half. `overlaySide` names that owning version.
   */
  overlay?: React.ReactNode
  overlaySide?: 'a' | 'b' | null
}

/**
 * Image wipe stage: A underneath, B on top clipped from the left by the divider.
 * The clip lives in SCREEN space (outside the shared transform) so the divider
 * line always matches the visible split, regardless of zoom/pan.
 */
export function WipeViewer({ urlA, urlB, badgeA, badgeB, transform, overlay, overlaySide }: WipeViewerProps) {
  const [split, setSplit] = React.useState(50)
  const stageRef = React.useRef<HTMLDivElement>(null)
  // Annotations are authored in image-frame space, so display has to measure the
  // owning version's <img> — the two versions can letterbox differently.
  const imgARef = React.useRef<HTMLImageElement>(null)
  const imgBRef = React.useRef<HTMLImageElement>(null)
  const dividerCleanup = React.useRef<(() => void) | null>(null)
  React.useEffect(() => () => dividerCleanup.current?.(), [])

  const onDividerDown = (e: React.PointerEvent) => {
    if (e.isPrimary === false || e.button > 0) return
    e.stopPropagation()
    dividerCleanup.current?.()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const pointerId = e.pointerId
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      const rect = stageRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0) return
      setSplit(Math.min(Math.max(((ev.clientX - rect.left) / rect.width) * 100, 0), 100))
    }
    const up = (ev?: PointerEvent) => {
      if (ev && ev.pointerId !== pointerId) return
      dividerCleanup.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
    const cancel = (ev: PointerEvent) => { if (ev.pointerId === pointerId) up() }
    dividerCleanup.current = up
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  return (
    <div
      ref={stageRef}
      data-testid="wipe-stage"
      className="relative h-full w-full overflow-hidden bg-black select-none"
      onWheel={(e) => transform.onWheel(e)}
      onPointerDown={transform.onPointerDown}
    >
      {/* Side A (left of divider) */}
      <div className="absolute inset-0 flex items-center justify-center" style={transform.styleFor()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgARef} src={urlA} alt={badgeA} className="max-h-full max-w-full object-contain" draggable={false} />
      </div>
      {/* Side B on top, revealed right of the divider */}
      <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
        <div className="absolute inset-0 flex items-center justify-center" style={transform.styleFor()}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imgBRef} src={urlB} alt={badgeB} className="max-h-full max-w-full object-contain" draggable={false} />
        </div>
      </div>
      {/* Overlay layer — above both images. The clip lives in SCREEN space
          (outside the transform, like the B image's) so the annotation is shown
          only over its owning version's half: side A left of the divider, side B
          right. The transform is applied on the inner layer so the drawing still
          zooms/pans with the images. */}
      {overlay && (
        <div
          data-testid="wipe-overlay-clip"
          className="pointer-events-none absolute inset-0"
          style={
            overlaySide === 'a'
              ? { clipPath: `inset(0 ${100 - split}% 0 0)` }
              : overlaySide === 'b'
                ? { clipPath: `inset(0 0 0 ${split}%)` }
                : undefined
          }
        >
          <div className="absolute inset-0" style={transform.styleFor()}>
            {/* Keyed by side so switching owner remounts the constraint against
                that version's <img> instead of holding the previous one's box.
                Both images share this layer's coordinate space (every layer here
                is `absolute inset-0` of the stage), so the offsets line up. */}
            <ImageFrameConstraint
              key={overlaySide ?? 'a'}
              imgRef={overlaySide === 'b' ? imgBRef : imgARef}
            >
              {overlay}
            </ImageFrameConstraint>
          </div>
        </div>
      )}
      {/* Divider */}
      <div
        data-testid="wipe-divider"
        data-split={String(Math.round(split))}
        role="slider"
        aria-label="Image comparison split"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(split)}
        tabIndex={0}
        onKeyDown={(e) => {
          const next = e.key === 'Home' ? 0 : e.key === 'End' ? 100
            : e.key === 'ArrowLeft' ? split - 5 : e.key === 'ArrowRight' ? split + 5 : null
          if (next === null) return
          e.preventDefault()
          e.stopPropagation()
          setSplit(Math.max(0, Math.min(100, next)))
        }}
        onPointerDown={onDividerDown}
        onLostPointerCapture={() => dividerCleanup.current?.()}
        className="absolute top-0 bottom-0 z-10 w-4 [@media(pointer:coarse)]:w-11 touch-none -translate-x-1/2 cursor-col-resize"
        style={{ left: `${split}%` }}
      >
        <div className="mx-auto h-full w-0.5 bg-white/90" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white p-1.5 shadow-lg">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2">
            <path d="m9 7-5 5 5 5M15 7l5 5-5 5" />
          </svg>
        </div>
      </div>
      {/* Corner version badges */}
      <span className="absolute left-3 top-3 z-10 rounded bg-sky-500/90 px-1.5 py-0.5 text-[11px] font-semibold text-white">{badgeA}</span>
      <span className="absolute right-3 top-3 z-10 rounded bg-emerald-500/90 px-1.5 py-0.5 text-[11px] font-semibold text-white">{badgeB}</span>
    </div>
  )
}
