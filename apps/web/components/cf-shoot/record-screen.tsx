'use client'

import * as React from 'react'
import { SwitchCamera, Timer, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { classifyMediaError, formatDuration, shootError, type ShootError } from './media'
import { ShootErrorPanel } from './error-panel'
import { TeleprompterOverlay } from './teleprompter-overlay'
import { useCamera } from './use-camera'
import { useBackgroundBlur } from './use-background-blur'
import { portraitBadge } from './studio-look'
import { useRecorder, type Take, type RecorderCompletion } from './use-recorder'
import type { StoredTake, TakeStore } from './take-store'
import { useWakeLock } from './use-wake-lock'
import type { ShootSettings } from './settings'

interface RecordScreenProps {
  settings: ShootSettings
  store?: TakeStore | null
  meta?: StoredTake['meta'] | null
  maxDurationMs?: number
  onLimit?: () => void
  text: string
  title: string | null
  onChange: (patch: Partial<ShootSettings>) => void
  onBack: () => void
  onTake: (take: Take, openReview?: boolean) => void
}

export function RecordScreen(props: RecordScreenProps) {
  const [attempt, setAttempt] = React.useState(0)
  useWakeLock(true)
  return <RecordingSession key={attempt} {...props} onRetry={() => setAttempt((current) => current + 1)} />
}

function RecordingSession({ settings, text, title, store, meta, maxDurationMs, onLimit, onChange, onBack, onTake, onRetry }: RecordScreenProps & { onRetry: () => void }) {
  const camera = useCamera({ facing: settings.facing, quality: settings.quality, enabled: true })
  const backgroundBlur = useBackgroundBlur(camera.stream, settings.studioLook)
  const badge = portraitBadge(backgroundBlur.blur)
  const [tipOpen, setTipOpen] = React.useState(false)
  const tipShownRef = React.useRef(false)
  const tipRef = React.useRef<HTMLDivElement>(null)
  const tipDoneRef = React.useRef<HTMLButtonElement>(null)
  const tipId = React.useId()
  const [countdown, setCountdown] = React.useState<number | null>(null)
  const [localError, setLocalError] = React.useState<ShootError | null>(null)
  const [startFailed, setStartFailed] = React.useState(false)
  const [awaitingTake, setAwaitingTake] = React.useState(false)
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const startingRef = React.useRef(false)
  const stoppingRef = React.useRef(false)
  const aliveRef = React.useRef(true)
  const closeRequestedRef = React.useRef(false)
  const handleComplete = React.useCallback(({ take, reason }: RecorderCompletion) => {
    startingRef.current = false
    stoppingRef.current = false
    if (!aliveRef.current) {
      if (take) URL.revokeObjectURL(take.url)
      return
    }
    setAwaitingTake(false)
    if (take) {
      const openReview = !closeRequestedRef.current
      onTake(take, openReview)
      if (reason === 'limit') onLimit?.()
      if (!openReview) onBack()
    } else if (reason !== 'error') {
      setLocalError(shootError('unknown'))
    }
  }, [onTake, onBack, onLimit])
  const recorder = useRecorder(camera.stream, { store, meta, maxDurationMs, onComplete: handleComplete })
  const startRef = React.useRef(recorder.start)
  const stopRef = React.useRef(recorder.stop)
  const recording = recorder.status === 'recording'
  const stopping = recorder.status === 'stopping' || (awaitingTake && recorder.status === 'idle')
  const remainingSeconds = recorder.remainingMs === null ? null : Math.ceil(recorder.remainingMs / 1000)
  const limitAnnouncement = remainingSeconds === null || remainingSeconds > 60 ? ''
    : `Auto-stops in ${remainingSeconds <= 10 ? 10 : remainingSeconds <= 30 ? 30 : 60} seconds`
  const error = camera.error ?? localError ?? recorder.error ?? (startFailed ? shootError('unknown') : null)

  const controlsBusy = recording || stopping || countdown !== null
  const tipVisible = tipOpen && settings.studioLook && !controlsBusy && !error

  React.useEffect(() => {
    startRef.current = recorder.start
    stopRef.current = recorder.stop
  }, [recorder.start, recorder.stop])

  React.useEffect(() => {
    aliveRef.current = true
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    rootRef.current?.focus({ preventScroll: true })
    return () => {
      aliveRef.current = false
      document.body.style.overflow = previousOverflow
    }
  }, [])

  React.useEffect(() => {
    if (!settings.studioLook || settings.studioTipSeen || tipShownRef.current || controlsBusy || error
      || camera.status !== 'live' || !backgroundBlur.ready || backgroundBlur.blur === true) return
    tipShownRef.current = true
    setTipOpen(true)
    onChange({ studioTipSeen: true })
  }, [settings.studioLook, settings.studioTipSeen, controlsBusy, error, camera.status, backgroundBlur.ready, backgroundBlur.blur, onChange])

  React.useEffect(() => {
    if (!tipVisible) return
    const previousFocus = document.activeElement
    const panel = tipRef.current
    const root = rootRef.current
    tipDoneRef.current?.focus({ preventScroll: true })
    return () => {
      if (panel?.contains(document.activeElement) || document.activeElement === document.body) {
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected && !previousFocus.matches(':disabled')) {
          previousFocus.focus({ preventScroll: true })
        } else root?.focus({ preventScroll: true })
      }
    }
  }, [tipVisible])

  React.useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = camera.stream
    if (camera.stream) void video.play().catch(() => { /* autoPlay can resume when the user taps Record. */ })
    return () => { video.srcObject = null }
  }, [camera.stream, error])

  React.useEffect(() => {
    if (recorder.status === 'idle' && countdown === null) startingRef.current = false
  }, [recorder.status, countdown])

  const beginRecording = React.useCallback(() => {
    setCountdown(null)
    setAwaitingTake(true)
    if (!startRef.current()) {
      setAwaitingTake(false)
      startingRef.current = false
      setStartFailed(true)
    }
  }, [])

  React.useEffect(() => {
    if (countdown === null) return
    const timeout = window.setTimeout(() => {
      if (countdown <= 1) beginRecording()
      else setCountdown(countdown - 1)
    }, 1000)
    return () => window.clearTimeout(timeout)
  }, [countdown, beginRecording])

  function startRecording() {
    if (camera.status !== 'live' || startingRef.current || stoppingRef.current) return
    startingRef.current = true
    setTipOpen(false)
    closeRequestedRef.current = false
    setLocalError(null)
    setStartFailed(false)
    if (settings.countdown) setCountdown(3)
    else beginRecording()
  }

  async function finishRecording() {
    if (stoppingRef.current) return
    stoppingRef.current = true
    let threw = false
    try {
      await stopRef.current()
    } catch (cause: unknown) {
      threw = true
      if (aliveRef.current) setLocalError(classifyMediaError(cause))
    } finally {
      if (threw) {
        if (aliveRef.current) setAwaitingTake(false)
        stoppingRef.current = false
        startingRef.current = false
      }
    }
  }

  function close() {
    closeRequestedRef.current = true
    if (recording) void finishRecording()
    else if (!stopping && !stoppingRef.current) onBack()
  }

  function handleDialogKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (tipVisible) setTipOpen(false)
      else close()
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
    <div ref={rootRef} role="dialog" aria-modal="true" aria-label="Camera and teleprompter" tabIndex={-1} onKeyDown={handleDialogKey} className="fixed inset-0 z-50 overflow-hidden overscroll-none bg-black font-sans text-white outline-none">
      {error ? (
        <ShootErrorPanel error={error} onRetry={onRetry} onBack={onBack} />
      ) : (
        <>
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            <div className={cn('relative overflow-hidden', settings.aspect === '9:16' ? 'h-full w-full sm:aspect-[9/16] sm:w-auto sm:max-w-full' : 'aspect-video w-full max-h-full')}>
              <video ref={videoRef} autoPlay playsInline muted aria-label="Live camera preview" className="h-full w-full object-cover" style={{ transform: settings.facing === 'user' ? 'scaleX(-1)' : undefined }} />
            </div>
          </div>

          <TeleprompterOverlay text={text} speed={settings.speed} fontSize={settings.fontSize} mirror={settings.mirror} recording={recording} onSpeedChange={(speed) => onChange({ speed })} />

          <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 pt-safe pl-safe pr-safe [--ff-pt:0.75rem] [--ff-pl:0.75rem] [--ff-pr:0.75rem]">
            <button type="button" aria-label={recording ? 'Stop recording and return to setup' : 'Back to setup'} disabled={stopping} onClick={close} className="flex h-11 w-11 items-center justify-center rounded-full bg-black/70 disabled:opacity-[0.35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A0FF]"><X aria-hidden="true" className="h-5 w-5" /></button>
            <div className="flex min-h-11 items-center gap-2 rounded-full bg-black/70 px-4 font-mono text-sm tabular-nums" aria-label={`Recording time ${formatDuration(recorder.elapsedMs)}`}>
              {recording && <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-red-500 motion-reduce:animate-none" />}
              {formatDuration(recorder.elapsedMs)}
            </div>
            <div className="flex items-center gap-2">
              {settings.studioLook && (
                <div aria-live="polite" aria-atomic="true">
                  {badge === 'Portrait on' ? (
                    !controlsBusy && <span className="flex min-h-11 items-center rounded-full bg-black/70 px-3 text-xs">{badge}</span>
                  ) : badge === 'Portrait off' ? (
                    <button type="button" disabled={controlsBusy} aria-expanded={tipVisible} aria-controls={tipVisible ? tipId : undefined} onClick={() => setTipOpen(true)} className="min-h-11 rounded-full bg-black/70 px-3 text-xs disabled:opacity-[0.35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A0FF]">{badge}</button>
                  ) : null}
                </div>
              )}
              <button type="button" aria-label="Flip camera" disabled={controlsBusy} onClick={() => onChange({ facing: settings.facing === 'user' ? 'environment' : 'user' })} className="flex h-11 w-11 items-center justify-center rounded-full bg-black/70 disabled:opacity-[0.35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A0FF]"><SwitchCamera aria-hidden="true" className="h-5 w-5" /></button>
            </div>
          </div>

          {tipVisible && (
            <div ref={tipRef} id={tipId} role="region" aria-label="Studio Look tip" className="absolute inset-x-4 top-[calc(env(safe-area-inset-top,0px)+4rem)] z-30 mx-auto max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-16rem)] max-w-sm space-y-3 overflow-y-auto [@media(pointer:coarse)_and_(orientation:landscape)]:max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-11rem)] rounded-xl border border-white/20 bg-black/90 p-4 text-sm shadow-lg">
              <p>Turn on Portrait: swipe down from the top-right corner to open Control Center, tap Video Effects, then tap Portrait. Come back here and the badge turns on.</p>
              <button ref={tipDoneRef} type="button" onClick={() => setTipOpen(false)} className="min-h-11 rounded-lg bg-[#00A0FF] px-4 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Done</button>
            </div>
          )}

          {countdown !== null && <div role="status" aria-live="assertive" aria-label={`Recording in ${countdown}`} className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"><span className="flex h-36 w-36 items-center justify-center rounded-full bg-black/[0.55] font-mono text-8xl font-semibold">{countdown}</span></div>}

          <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col [@media(pointer:coarse)_and_(orientation:landscape)]:flex-row [@media(pointer:coarse)_and_(orientation:landscape)]:justify-center [@media(pointer:coarse)_and_(orientation:landscape)]:gap-4 [@media(pointer:coarse)_and_(orientation:landscape)]:pt-2 items-center gap-3 bg-black/60 px-4 pt-4 pb-safe pl-safe pr-safe [--ff-pb:1.5rem] [--ff-pl:1rem] [--ff-pr:1rem]">
            {recording && remainingSeconds !== null && remainingSeconds <= 60 && (
              <div className={cn('pointer-events-none flex shrink-0 [@media(pointer:coarse)_and_(orientation:landscape)]:absolute [@media(pointer:coarse)_and_(orientation:landscape)]:left-1/2 [@media(pointer:coarse)_and_(orientation:landscape)]:bottom-[calc(100%+0.5rem)] [@media(pointer:coarse)_and_(orientation:landscape)]:-translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg ring-1 ring-white/30', remainingSeconds <= 10 ? 'bg-red-600 text-white motion-safe:animate-pulse' : 'bg-white text-black')}>
                <Timer aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span aria-hidden="true" className="font-mono tabular-nums">Auto-stops in {formatDuration(remainingSeconds * 1000)}</span>
              </div>
            )}
            <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{recording ? limitAnnouncement : ''}</p>
            <p className="max-w-full [@media(pointer:coarse)_and_(orientation:landscape)]:max-w-[30%] truncate text-xs text-white/70">{title || 'Freestyle'} · {settings.aspect}</p>
            <button type="button" aria-label={recording ? 'Stop recording' : 'Start recording'} disabled={camera.status !== 'live' || stopping || countdown !== null} onClick={() => recording ? void finishRecording() : startRecording()} className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-white bg-black/30 p-1.5 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#00A0FF] focus-visible:ring-offset-4 focus-visible:ring-offset-black">
              <span aria-hidden="true" className={cn(recording || stopping ? 'h-8 w-8 rounded-md bg-red-500' : 'h-full w-full rounded-full bg-[#00A0FF]')} />
            </button>
            <p role="status" aria-live="polite" className="min-h-5 [@media(pointer:coarse)_and_(orientation:landscape)]:max-w-[25%] text-xs text-white/70">{stopping ? 'Finishing your take…' : countdown !== null ? 'Get ready' : recording ? 'Recording' : camera.status === 'live' ? 'Ready when you are' : 'Starting camera…'}</p>
          </div>
        </>
      )}
    </div>
  )
}
