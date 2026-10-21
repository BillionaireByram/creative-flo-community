'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import {
  fetchBrands, fetchIdea, fetchReadyIdeas, findContentBin, markIdeaShot,
  teleprompterTextFor, type Brand, type Idea,
} from './api'
import { fileExtension } from './media'
import { takeAssetName, takeFileName } from './naming'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type ShootSettings } from './settings'
import { SetupScreen } from './setup-screen'
import { RecordScreen } from './record-screen'
import { TakeReview } from './take-review'
import { describeUploadError, uploadTake, type TakeUploadPhase, type TakeUploadSession } from './upload'
import type { Take } from './use-recorder'
import { getTakeStore, type TakeStore, type TakePatch } from './take-store'
import { useLeaveGuard } from './use-leave-guard'
import { RestorePanel } from './restore-panel'

export interface ShootUploadState {
  phase: TakeUploadPhase
  percent: number
  error: string | null
  session: TakeUploadSession | null
  assetId: string | null
  versionId: string | null
  note: string | null
}

export interface ShootSessionTake {
  take: Omit<Take, 'blob'> & { blob: Blob | null }
  brand: Brand
  idea: Idea | null
  title: string | null
  text: string
  assetName: string
  fileName: string
  kept: boolean
  stored: boolean
  restored: boolean
  recovered: boolean
  upload: ShootUploadState
}

interface RecordingContext {
  brand: Brand
  idea: Idea | null
  title: string | null
  text: string
}

type Screen = 'setup' | 'recording' | 'review'

export function ShootApp() {
  const params = useSearchParams()
  const requestedBrand = params.get('brand')
  const requestedIdea = params.get('idea')
  const [settings, setSettings] = React.useState<ShootSettings>({ ...DEFAULT_SETTINGS })
  const [settingsLoaded, setSettingsLoaded] = React.useState(false)
  const [screen, setScreen] = React.useState<Screen>('setup')
  const [context, setContext] = React.useState<RecordingContext | null>(null)
  const [takes, setTakes] = React.useState<ShootSessionTake[]>([])
  const [store, setStore] = React.useState<TakeStore | null>(null)
  const [restoreError, setRestoreError] = React.useState(false)
  const knownIdsRef = React.useRef(new Set<string>())
  const discardedIdsRef = React.useRef(new Set<string>())
  const [activeTakeId, setActiveTakeId] = React.useState<string | null>(null)
  const [announcement, setAnnouncement] = React.useState('')
  const mountedRef = React.useRef(true)
  const urlsRef = React.useRef(new Set<string>())
  const uploadsRef = React.useRef(new Map<string, AbortController>())
  const appliedBrandParam = React.useRef<string | null | undefined>(undefined)
  const appliedScriptKey = React.useRef<string | null>(null)

  const { data: brands, isLoading: brandsLoading, error: brandsError, mutate: retryBrands } = useSWR<Brand[]>(
    'cf-shoot-brands', fetchBrands, { revalidateOnFocus: false },
  )
  const selectedBrand = brands?.find((brand) => brand.brand === settings.brand) ?? null
  const { data: readyIdeas, isLoading: ideasLoading, error: readyIdeasError, mutate: retryIdeas } = useSWR<Idea[]>(
    settings.brand ? ['cf-shoot-ready-ideas', settings.brand] : null,
    () => fetchReadyIdeas(settings.brand),
    { revalidateOnFocus: false },
  )
  const { data: queryIdea, isLoading: queryIdeaLoading, error: queryIdeaError, mutate: retryQueryIdea } = useSWR<Idea | null>(
    requestedIdea ? ['cf-shoot-idea', requestedIdea] : null,
    () => fetchIdea(requestedIdea ?? ''),
    { revalidateOnFocus: false },
  )

  const ideas = React.useMemo(() => {
    if (!selectedBrand) return []
    const matching = (readyIdeas ?? []).filter((idea) => idea.brand === selectedBrand.brand && idea.project_id === selectedBrand.project_id)
    const previousIdea = takes.find((entry) => entry.idea?.id === settings.ideaId && entry.brand.project_id === selectedBrand.project_id)?.idea
    const recordingIdea = context && context.idea?.id === settings.ideaId ? context.idea : null
    for (const idea of [queryIdea, previousIdea, recordingIdea]) {
      if (idea && idea.brand === selectedBrand.brand && idea.project_id === selectedBrand.project_id && !matching.some((item) => item.id === idea.id)) matching.push(idea)
    }
    return matching
  }, [readyIdeas, selectedBrand, queryIdea, takes, settings.ideaId, context])
  const selectedIdea = ideas.find((idea) => idea.id === settings.ideaId) ?? null
  const text = settings.ideaId === null ? settings.freeText : selectedIdea ? teleprompterTextFor(selectedIdea) : ''
  const scriptKey = selectedBrand ? `${selectedBrand.project_id}:${requestedIdea ?? ''}` : null
  const currentTake = takes.find((entry) => entry.take.id === activeTakeId) ?? null
  const unsavedTakes = takes.filter((entry) => entry.upload.phase !== 'done')
  useLeaveGuard(screen === 'recording' || unsavedTakes.length > 0,
    screen !== 'recording' && unsavedTakes.every((entry) => entry.stored)
      ? 'Your take is saved on this phone but not uploaded yet. Leave anyway? You can resume the upload when you come back to Shoot.'
      : 'You have a take that is not saved yet. If you leave now it will be lost. Leave anyway?')

  React.useEffect(() => {
    setSettings(loadSettings())
    setSettingsLoaded(true)
  }, [])

  React.useEffect(() => {
    if (settingsLoaded) saveSettings(settings)
  }, [settings, settingsLoaded])

  React.useEffect(() => {
    if (!settingsLoaded || !brands?.length) return
    // A Flo link may carry only ?idea=. Wait for that idea so its own brand wins
    // over the demo default, otherwise the idea would be filtered out of view.
    if (requestedIdea && !requestedBrand && queryIdeaLoading) return
    const wantedBrand = requestedBrand ?? queryIdea?.brand ?? null
    const paramChanged = appliedBrandParam.current !== wantedBrand
    if (!paramChanged && brands.some((brand) => brand.brand === settings.brand)) return
    appliedBrandParam.current = wantedBrand
    const preferred = brands.find((brand) => brand.brand === wantedBrand)
      ?? brands.find((brand) => brand.brand === 'demo')
      ?? brands[0]
    appliedScriptKey.current = null
    setSettings((current) => ({ ...current, brand: preferred.brand, ideaId: null }))
  }, [brands, requestedBrand, requestedIdea, queryIdea, queryIdeaLoading, settings.brand, settingsLoaded])

  React.useEffect(() => {
    if (!selectedBrand || !scriptKey || ideasLoading || queryIdeaLoading || appliedScriptKey.current === scriptKey) return
    appliedScriptKey.current = scriptKey
    const initialIdea = ideas.find((idea) => idea.id === requestedIdea) ?? ideas[0]
    setSettings((current) => current.brand === selectedBrand.brand ? { ...current, ideaId: initialIdea?.id ?? null } : current)
  }, [ideas, ideasLoading, queryIdeaLoading, requestedIdea, scriptKey, selectedBrand])

  React.useEffect(() => {
    mountedRef.current = true
    // Capture the collections, not their contents, for complete unmount cleanup.
    const urls = urlsRef.current
    const uploads = uploadsRef.current
    return () => {
      mountedRef.current = false
      uploads.forEach((controller) => controller.abort())
      urls.forEach((url) => URL.revokeObjectURL(url))
      uploads.clear()
      urls.clear()
    }
  }, [])

  React.useEffect(() => {
    // Each effect invocation owns its cancellation flag. Strict Mode's first
    // invocation cannot add URLs or rows after its cleanup, even on a late read.
    let cancelled = false
    async function restore() {
      const opened = await getTakeStore()
      if (cancelled) return
      setStore(opened)
      if (!opened) return
      const records = await opened.listTakes()
      for (const record of records) {
        if (cancelled) return
        if (knownIdsRef.current.has(record.id)) continue
        try {
          const blob = await opened.readBlob(record.id, record.mimeType)
          if (cancelled) return
          if (blob.size === 0) { await opened.deleteTake(record.id); continue }
          const recovered = record.recovered || record.state === 'recording'
          const durationMs = record.durationMs || record.chunkCount * 1000
          if (record.state === 'recording') {
            await opened.finalizeTake(record.id, { state: 'ready', recovered: true, durationMs, size: blob.size })
          }
          if (cancelled || knownIdsRef.current.has(record.id)) continue
          const createdAt = new Date(record.createdAt)
          const url = URL.createObjectURL(blob)
          urlsRef.current.add(url)
          knownIdsRef.current.add(record.id)
          const entry: ShootSessionTake = {
            take: { id: record.id, blob, url, mimeType: record.mimeType, durationMs, createdAt, recovered, persisted: true },
            ...record.meta,
            assetName: record.assetName ?? takeAssetName(record.meta.title, createdAt),
            fileName: record.fileName ?? takeFileName(record.meta.title, createdAt, fileExtension(record.mimeType)),
            kept: record.kept, stored: true, restored: true, recovered,
            upload: { phase: 'idle', session: record.upload.session, percent: record.upload.percent, error: null, assetId: null, versionId: null, note: null },
          }
          setTakes((current) => current.some((item) => item.take.id === record.id) ? current : [...current, entry])
        } catch {
          if (!cancelled) setRestoreError(true)
        }
      }
    }
    void restore().catch(() => { if (!cancelled) setRestoreError(true) })
    return () => { cancelled = true }
  }, [])

  const updateTake = React.useCallback((id: string, update: (entry: ShootSessionTake) => ShootSessionTake) => {
    if (mountedRef.current) setTakes((current) => current.map((entry) => entry.take.id === id ? update(entry) : entry))
  }, [])

  function changeSettings(patch: Partial<ShootSettings>) {
    if (patch.brand !== undefined && patch.brand !== settings.brand) {
      appliedScriptKey.current = null
      setSettings((current) => ({ ...current, ...patch, ideaId: null }))
    } else {
      if ('ideaId' in patch || 'freeText' in patch) appliedScriptKey.current = scriptKey
      setSettings((current) => ({ ...current, ...patch }))
    }
  }

  function startCamera() {
    if (!selectedBrand || !text.trim()) return
    setContext({ brand: selectedBrand, idea: selectedIdea, title: selectedIdea?.title ?? null, text })
    setActiveTakeId(null)
    setScreen('recording')
  }

  function receiveTake(take: Take, openReview = true) {
    if (!mountedRef.current || !context) {
      URL.revokeObjectURL(take.url)
      return
    }
    urlsRef.current.add(take.url)
    knownIdsRef.current.add(take.id)
    const entry: ShootSessionTake = {
      take,
      ...context,
      assetName: takeAssetName(context.title, take.createdAt),
      fileName: takeFileName(context.title, take.createdAt, fileExtension(take.mimeType)),
      kept: false, stored: false, restored: false, recovered: take.recovered,
      upload: { phase: 'idle', percent: 0, error: null, session: null, assetId: null, versionId: null, note: null },
    }
    setTakes((current) => [...current, entry])
    if (store) {
      void store.updateTake(take.id, { assetName: entry.assetName, fileName: entry.fileName })
        .then(() => updateTake(take.id, (current) => ({ ...current, stored: take.persisted })))
        .catch(() => { /* Keep the RAM take and the honest not-saved warning. */ })
    }
    setAnnouncement('Take recorded. Review it when you are ready.')
    if (openReview) {
      setActiveTakeId(take.id)
      setScreen('review')
    }
  }

  function shootAgain(entry: ShootSessionTake) {
    setContext({ brand: entry.brand, idea: entry.idea, title: entry.title, text: entry.text })
    appliedScriptKey.current = `${entry.brand.project_id}:${requestedIdea ?? ''}`
    setSettings((current) => ({
      ...current,
      brand: entry.brand.brand,
      ideaId: entry.idea?.id ?? null,
      freeText: entry.idea ? current.freeText : entry.text,
    }))
    setActiveTakeId(null)
    setScreen('recording')
  }

  function discardTake(entry: ShootSessionTake) {
    const id = entry.take.id
    discardedIdsRef.current.add(id)
    uploadsRef.current.get(id)?.abort()
    uploadsRef.current.delete(id)
    if (entry.take.url) {
      URL.revokeObjectURL(entry.take.url)
      urlsRef.current.delete(entry.take.url)
    }
    setTakes((current) => current.filter((item) => item.take.id !== id))
    void store?.deleteTake(id).catch(() => { /* Discard is best effort if storage is unavailable. */ })
  }

  function discardAndRetake(entry: ShootSessionTake) {
    discardTake(entry)
    shootAgain(entry)
  }

  async function saveTake(entry: ShootSessionTake) {
    const id = entry.take.id
    const blob = entry.take.blob
    if (!blob || entry.upload.phase === 'done' || uploadsRef.current.has(id)) return
    const controller = new AbortController()
    uploadsRef.current.set(id, controller)
    let missingFolder = false
    let session = entry.upload.session
    let partsDone = session && session.chunk_size_bytes > 0
      ? Math.max(0, Math.min(Math.ceil(blob.size / session.chunk_size_bytes),
        Math.floor(blob.size * Math.min(100, Math.max(0, entry.upload.percent)) / 100 / session.chunk_size_bytes))) : 0
    let persistence = Promise.resolve()
    const persist = (patch: TakePatch) => {
      persistence = persistence.then(async () => {
        if (!discardedIdsRef.current.has(id)) await store?.updateTake(id, patch)
      }).catch(() => { /* Storage failures must never interrupt an upload. */ })
      return persistence
    }
    updateTake(id, (current) => ({
      ...current, kept: true,
      upload: { ...current.upload, phase: 'initiating', percent: current.upload.session ? current.upload.percent : 0, error: null, note: null },
    }))
    setAnnouncement('Saving your take to Content Bin.')

    try {
      await persist({ kept: true })
      if (controller.signal.aborted) return
      // This metadata belongs to the take, even if the user switches brands.
      const folder = await findContentBin(entry.brand.project_id)
      if (!folder) {
        missingFolder = true
        throw new Error('This brand has no "Content Bin" folder. Create it in the project, then tap Retry.')
      }
      if (controller.signal.aborted) return
      if (entry.upload.session) updateTake(id, (current) => ({ ...current, upload: { ...current.upload, phase: 'uploading' } }))
      const result = await uploadTake({
        blob,
        mimeType: entry.take.mimeType,
        projectId: entry.brand.project_id,
        folderId: folder.id,
        assetName: entry.assetName,
        fileName: entry.fileName,
        session: entry.upload.session,
        signal: controller.signal,
        onSession: (nextSession) => {
          session = nextSession
          void persist({ upload: { session: nextSession } })
          updateTake(id, (current) => ({ ...current, upload: { ...current.upload, session: nextSession, phase: 'uploading' } }))
        },
        onProgress: (percent) => {
          updateTake(id, (current) => ({
            ...current, upload: { ...current.upload, percent, phase: percent >= 95 ? 'completing' : 'uploading' },
          }))
          if (session && session.chunk_size_bytes > 0 && Number.isFinite(percent)) {
            const nextParts = Math.max(0, Math.min(Math.ceil(blob.size / session.chunk_size_bytes),
              Math.floor(blob.size * Math.min(100, Math.max(0, percent)) / 100 / session.chunk_size_bytes)))
            if (nextParts !== partsDone) {
              partsDone = nextParts
              void persist({ upload: { partsDone, percent } })
            }
          }
        },
      })
      // Drain metadata writes before removal, including callbacks delivered while
      // leaving the page. A completed server upload is the only automatic delete.
      await persistence
      await store?.deleteTake(id).catch(() => { /* The server copy is already confirmed. */ })
      if (urlsRef.current.delete(entry.take.url)) URL.revokeObjectURL(entry.take.url)
      updateTake(id, (current) => ({
        ...current,
        take: { ...current.take, blob: null, url: '' },
        upload: { ...current.upload, phase: 'done', percent: 100, error: null, assetId: result.asset_id, versionId: result.version_id },
      }))
      if (mountedRef.current) setAnnouncement('Take saved to Content Bin.')
      if (entry.idea) {
        try {
          await markIdeaShot(entry.idea.id, result.asset_id)
        } catch {
          updateTake(id, (current) => ({ ...current, upload: { ...current.upload, note: 'Take saved. Couldn’t mark the idea as shot. You can update it in Ideas.' } }))
        }
      }
    } catch (cause: unknown) {
      const restart = typeof cause === 'object' && cause !== null && 'restart' in cause && cause.restart === true
      const message = missingFolder ? 'This brand has no "Content Bin" folder. Create it in the project, then tap Retry.' : describeUploadError(cause, { stored: entry.stored })
      if (restart) void persist({ upload: { session: null, partsDone: 0, percent: 0 } })
      updateTake(id, (current) => ({
        ...current,
        upload: { ...current.upload, phase: 'failed', error: message, session: restart ? null : current.upload.session },
      }))
      if (mountedRef.current) setAnnouncement('Couldn’t save your take. Retry or save it to your phone.')
    } finally {
      if (uploadsRef.current.get(id) === controller) uploadsRef.current.delete(id)
    }
  }

  function backToSetup() {
    setScreen('setup')
    setActiveTakeId(null)
  }

  return (
    <>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</p>
      {screen === 'recording' && context ? (
        <RecordScreen store={store} meta={context} onLimit={() => setAnnouncement('Takes are capped at 15 minutes. Your take was saved.')} settings={settings} text={context.text} title={context.title} onChange={changeSettings} onBack={backToSetup} onTake={receiveTake} />
      ) : screen === 'review' && currentTake ? (
        <TakeReview entry={currentTake} onRetake={() => discardAndRetake(currentTake)} onKeep={() => { void saveTake(currentTake) }} onRetry={() => { void saveTake(currentTake) }} onShootAnother={() => shootAgain(currentTake)} onDone={backToSetup} />
      ) : (
        <>
          {restoreError && <p role="alert" className="mx-auto mt-4 max-w-xl px-4 text-sm text-text-secondary">Couldn&apos;t restore some takes from this phone. Reload Shoot to try again.</p>}
          <RestorePanel takes={takes} onResume={(entry) => { void saveTake(entry) }} onDiscard={discardTake} />
          <SetupScreen
            settings={settings}
            brands={brands ?? []}
            brandsLoading={brandsLoading}
            brandsError={Boolean(brandsError)}
            ideas={ideas}
            ideasLoading={ideasLoading || queryIdeaLoading}
            ideasError={Boolean(readyIdeasError || queryIdeaError)}
            selectedIdea={selectedIdea}
            text={text}
            takes={takes}
            onChange={changeSettings}
            onStart={startCamera}
            onReviewTake={(id) => { setActiveTakeId(id); setScreen('review') }}
            onRetryBrands={() => { void retryBrands().catch(() => { /* SWR exposes the error above. */ }) }}
            onRetryIdeas={() => {
              void retryIdeas().catch(() => { /* Paste mode stays available. */ })
              void retryQueryIdea().catch(() => { /* SWR exposes the error above. */ })
            }}
          />
        </>
      )}
    </>
  )
}
