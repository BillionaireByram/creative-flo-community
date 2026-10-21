'use client'

import * as React from 'react'
import { Minus, Pause, Play, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  activeLineIndex, FONT_SIZES, initialScroll, pause, play, scrubTo,
  SPEED_MAX, SPEED_MIN, speedToPxPerSec, splitLines, tick, toggle,
  type ScrollState,
} from './teleprompter'

interface TeleprompterOverlayProps {
  text: string
  speed: number
  fontSize: keyof typeof FONT_SIZES
  mirror: boolean
  recording: boolean
  onSpeedChange: (speed: number) => void
}

interface Drag {
  pointerId: number
  startY: number
  startOffset: number
  moved: boolean
  wasPlaying: boolean
}

export function TeleprompterOverlay({ text, speed, fontSize, mirror, recording, onSpeedChange }: TeleprompterOverlayProps) {
  const lines = React.useMemo(() => splitLines(text), [text])
  const fontPx = FONT_SIZES[fontSize]
  const viewportRef = React.useRef<HTMLDivElement>(null)
  const columnRef = React.useRef<HTMLDivElement>(null)
  const lineRefs = React.useRef<Array<HTMLParagraphElement | null>>([])
  const scrollRef = React.useRef<ScrollState>(initialScroll())
  const metricsRef = React.useRef({ lineTops: [] as number[], focusPx: 0, maxOffset: 0 })
  const dragRef = React.useRef<Drag | null>(null)
  const activeRef = React.useRef(0)
  const [playing, setPlaying] = React.useState(false)
  const [active, setActive] = React.useState(0)

  // Transform writes happen outside React. React only updates when the focus
  // paragraph or play state changes, rather than on every animation frame.
  const publish = React.useCallback((next: ScrollState) => {
    const previous = scrollRef.current
    scrollRef.current = next
    if (columnRef.current) columnRef.current.style.transform = `translateY(${-next.offset}px)`
    if (previous.playing !== next.playing) setPlaying(next.playing)
    const { lineTops, focusPx } = metricsRef.current
    const index = activeLineIndex(next.offset, lineTops, focusPx)
    if (activeRef.current !== index) {
      activeRef.current = index
      setActive(index)
    }
  }, [])

  React.useEffect(() => {
    const viewport = viewportRef.current
    const column = columnRef.current
    if (!viewport || !column) return
    let alive = true

    function measure() {
      if (!alive || !viewport || !column) return
      const safeTop = viewport.parentElement ? Number.parseFloat(getComputedStyle(viewport.parentElement).paddingTop) || 0 : 0
      const focusPx = Math.max(viewport.clientHeight * 0.3, safeTop + 60)
      column.style.paddingTop = `${focusPx}px`
      column.style.paddingBottom = `${viewport.clientHeight - focusPx}px`
      const lineTops = lineRefs.current.slice(0, lines.length).map((line) => line?.offsetTop ?? focusPx)
      // Let the final wrapped line reach the focus point, including scripts
      // pasted as one long paragraph.
      const maxOffset = Math.max(0, column.scrollHeight - viewport.clientHeight - fontPx * 1.4)
      metricsRef.current = { lineTops, focusPx, maxOffset }
      publish(scrubTo(scrollRef.current, scrollRef.current.offset, maxOffset, performance.now()))
    }

    measure()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(viewport)
    observer?.observe(column)
    window.addEventListener('resize', measure)
    if ('fonts' in document) void document.fonts.ready.then(measure).catch(() => { /* ResizeObserver still measures the rendered font. */ })
    return () => {
      alive = false
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [fontPx, lines, publish])

  React.useEffect(() => {
    const state = initialScroll()
    publish(recording ? play(state, performance.now()) : state)
  }, [recording, text, publish])

  React.useEffect(() => {
    let frame = 0
    const pxPerSec = speedToPxPerSec(speed, fontPx)
    function animate(now: number) {
      publish(tick(scrollRef.current, now, pxPerSec, metricsRef.current.maxOffset))
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [fontPx, speed, publish])

  function currentAt(now: number): ScrollState {
    return tick(scrollRef.current, now, speedToPxPerSec(speed, fontPx), metricsRef.current.maxOffset)
  }

  function togglePlayback() {
    const now = performance.now()
    publish(toggle(currentAt(now), now))
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    const now = performance.now()
    const current = currentAt(now)
    publish(current)
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startOffset: current.offset,
      moved: false,
      wasPlaying: current.playing,
    }
    if (typeof event.currentTarget.setPointerCapture === 'function') event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const delta = event.clientY - drag.startY
    if (!drag.moved && Math.abs(delta) < 6) return
    drag.moved = true
    const now = performance.now()
    publish(scrubTo(pause(currentAt(now), now), drag.startOffset - delta, metricsRef.current.maxOffset, now))
  }

  function finishPointer(event: React.PointerEvent<HTMLDivElement>, cancelled: boolean) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    const now = performance.now()
    if (drag.moved) {
      if (drag.wasPlaying) publish(play(scrollRef.current, now))
    } else if (!cancelled) {
      togglePlayback()
    }
    if (typeof event.currentTarget.hasPointerCapture === 'function' && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.code === 'Space' || event.key === 'Enter') {
      event.preventDefault()
      if (!event.repeat) togglePlayback()
    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault()
      const direction = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1
      const now = performance.now()
      const current = currentAt(now)
      publish(scrubTo(current, current.offset + direction * fontPx * 1.4, metricsRef.current.maxOffset, now))
    }
  }

  return (
    <div className="absolute inset-x-0 top-0 z-10 h-[38%] [@media(pointer:coarse)_and_(orientation:landscape)]:h-[60%] bg-black/[0.55] pt-safe">
      <div
        ref={viewportRef}
        role="button"
        tabIndex={0}
        aria-label={playing ? 'Pause teleprompter. Drag or use arrow keys to scrub.' : 'Play teleprompter. Drag or use arrow keys to scrub.'}
        aria-pressed={playing}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishPointer(event, false)}
        onPointerCancel={(event) => finishPointer(event, true)}
        onLostPointerCapture={(event) => finishPointer(event, true)}
        onClick={(event) => { if (event.detail === 0) togglePlayback() }}
        onKeyDown={handleKeyDown}
        className="absolute inset-0 touch-none select-none overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00A0FF]"
      >
        <div className="h-full" style={{ transform: mirror ? 'scaleX(-1)' : undefined }}>
          <div ref={columnRef} className="relative mx-auto max-w-2xl space-y-4 px-5 text-center leading-[1.4] will-change-transform sm:px-8" style={{ fontSize: fontPx }}>
            {lines.map((line, index) => (
              <p key={`${index}:${line}`} ref={(node) => { lineRefs.current[index] = node }} className={cn('break-words border-l-4 pl-2 pr-3', index === active ? 'border-[#00A0FF] text-white' : 'border-transparent text-white/[0.45]')}>
                {line}
              </p>
            ))}
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/80 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex items-end justify-between gap-2 px-3 pl-safe pr-safe [--ff-pl:0.75rem] [--ff-pr:0.75rem]">
        <span role="status" aria-live="polite" className="flex min-h-11 items-center gap-1.5 rounded-full bg-black/80 px-3 text-xs text-white/80">
          {playing ? <Play aria-hidden="true" className="h-3.5 w-3.5" /> : <Pause aria-hidden="true" className="h-3.5 w-3.5" />}
          {playing ? 'Tap to pause' : 'Paused · tap to resume'}
        </span>
        <div role="group" aria-label="Teleprompter speed" className="pointer-events-auto flex shrink-0 items-center rounded-full border border-white/20 bg-black/80">
          <button type="button" aria-label="Slow down teleprompter" disabled={speed <= SPEED_MIN} onClick={() => onSpeedChange(Math.max(SPEED_MIN, speed - 1))} className="flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-[0.35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A0FF]"><Minus aria-hidden="true" className="h-4 w-4" /></button>
          <span className="w-5 text-center font-mono text-xs text-[#00A0FF]">{speed}</span>
          <button type="button" aria-label="Speed up teleprompter" disabled={speed >= SPEED_MAX} onClick={() => onSpeedChange(Math.min(SPEED_MAX, speed + 1))} className="flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-[0.35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A0FF]"><Plus aria-hidden="true" className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  )
}
