import { StrictMode, type MouseEvent as ReactMouseEvent } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCamera } from '../use-camera'
import { ShootApp } from '../shoot-app'
import { fetchBrands, fetchIdea, fetchReadyIdeas, findContentBin, markIdeaShot } from '../api'
import { uploadTake, type TakeUploadResult, type TakeUploadSession } from '../upload'
import { getTakeStore, resetTakeStoreForTests, type StoredTake, type TakeStore } from '../take-store'
import { createIdbShim } from './idb-shim'
import { FakeMediaRecorder, FakeVideoTrack, videoStream, brand, deferred, restoreProperties, setProperty, storedTake } from './recorder-fixtures'

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('../api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api')>(),
  fetchBrands: vi.fn(), fetchIdea: vi.fn(), fetchReadyIdeas: vi.fn(), findContentBin: vi.fn(), markIdeaShot: vi.fn(),
}))
vi.mock('../upload', async (importOriginal) => ({
  ...await importOriginal<typeof import('../upload')>(), uploadTake: vi.fn(),
}))
vi.mock('@/hooks/use-stream-url', () => ({ useStreamUrl: () => ({ url: null, error: false }) }))
vi.mock('../use-camera', () => ({ useCamera: vi.fn() }))
vi.mock('../use-wake-lock', () => ({ useWakeLock: () => undefined }))
vi.mock('../teleprompter-overlay', () => ({ TeleprompterOverlay: () => null }))

const session: TakeUploadSession = {
  upload_id: 'upload-1', s3_key: 'raw/take.mp4', asset_id: 'asset-1', version_id: 'version-1', chunk_size_bytes: 2,
}
const uploaded: TakeUploadResult = { asset_id: 'asset-1', version_id: 'version-1', project_id: 'project-1' }
let shim: ReturnType<typeof createIdbShim>
let urlNumber = 0
const createObjectURL = vi.fn(() => `blob:take-${++urlNumber}`)
const revokeObjectURL = vi.fn()
const navigate = vi.fn((event: ReactMouseEvent<HTMLAnchorElement>) => event.preventDefault())

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  const stream = { getTracks: () => [], getVideoTracks: () => [] } as unknown as MediaStream
  vi.mocked(useCamera).mockReturnValue({ status: 'live', stream, error: null, restart: vi.fn() })
  shim = createIdbShim()
  vi.stubGlobal('indexedDB', shim.indexedDB)
  vi.stubGlobal('IDBKeyRange', shim.IDBKeyRange)
  resetTakeStoreForTests()
  urlNumber = 0
  setProperty(URL, 'createObjectURL', createObjectURL)
  setProperty(URL, 'revokeObjectURL', revokeObjectURL)
  setProperty(globalThis, 'MediaRecorder', FakeMediaRecorder)
  FakeMediaRecorder.instances = []
  FakeMediaRecorder.isTypeSupported.mockReturnValue(true)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  vi.mocked(fetchBrands).mockResolvedValue([brand])
  vi.mocked(fetchReadyIdeas).mockResolvedValue([])
  vi.mocked(fetchIdea).mockResolvedValue(null)
  vi.mocked(findContentBin).mockResolvedValue({ id: 'bin', name: 'Content Bin', project_id: brand.project_id, parent_id: null })
  vi.mocked(uploadTake).mockReset()
})
afterEach(() => {
  cleanup()
  resetTakeStoreForTests()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  restoreProperties()
})

async function storeReady(): Promise<TakeStore> {
  const store = await getTakeStore()
  if (!store) throw new Error('Store unavailable')
  return store
}
async function seed(patch: Partial<StoredTake> = {}) {
  const store = await storeReady()
  const record = storedTake({ state: 'ready', durationMs: 1000, assetName: 'Saved name', fileName: 'saved-name.mp4',
    kept: true, upload: { session, partsDone: 0, percent: 25 }, ...patch })
  await store.beginTake(record)
  await store.putChunk(record.id, 0, new Blob(['footage']))
  return store
}
function renderApp() {
  const cache = new Map()
  return render(
    <StrictMode>
      <SWRConfig value={{ provider: () => cache, shouldRetryOnError: false }}>
        {[
          { name: 'Projects', href: '/projects' },
          { name: 'Same page', href: `${window.location.pathname}${window.location.search}#same` },
          { name: 'New tab', href: '/projects', target: '_blank' },
          { name: 'Other site', href: 'https://example.org/projects' },
        ].map((link) => <a key={link.name} href={link.href} target={link.target} rel="noreferrer" onClick={navigate}>{link.name}</a>)}
        <ShootApp />
      </SWRConfig>
    </StrictMode>,
  )
}
async function panel() {
  return screen.findByRole('region', { name: 'Takes waiting on this phone' })
}
async function finishUpload(pending: ReturnType<typeof deferred<TakeUploadResult>>) {
  await act(async () => { pending.resolve(uploaded); await pending.promise })
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Takes waiting on this phone' })).not.toBeInTheDocument())
}

describe('ShootApp stored takes', () => {
  it('restores once under Strict Mode and discards only after confirmation', async () => {
    const store = await seed()
    renderApp()
    const restored = within(await panel())
    expect(restored.getByText('My script')).toBeInTheDocument()
    expect(restored.getByText('Sample Creator · 0:01')).toBeInTheDocument()
    expect(restored.getByRole('button', { name: 'Resume upload' })).toBeEnabled()
    expect(restored.getByRole('link', { name: 'Save to phone' })).toHaveAttribute('download', 'saved-name.mp4')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    fireEvent.click(restored.getByRole('button', { name: 'Discard' }))
    expect((await store.listTakes())).toHaveLength(1)
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(restored.getByRole('button', { name: 'Discard' }))
    expect(window.confirm).toHaveBeenLastCalledWith('Discard this take? It will be deleted from this phone.')
    await waitFor(async () => { expect(await store.listTakes()).toEqual([]) })
    expect(await store.chunkSeqs('take-1')).toEqual([])
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:take-1')
  })

  it('resumes the persisted upload, displays progress, and deletes and revokes after success', async () => {
    const store = await seed()
    const pending = deferred<TakeUploadResult>()
    vi.mocked(uploadTake).mockReturnValue(pending.promise)
    const { unmount } = renderApp()
    fireEvent.click(within(await panel()).getByRole('button', { name: 'Resume upload' }))
    await waitFor(() => expect(uploadTake).toHaveBeenCalledTimes(1))
    const params = vi.mocked(uploadTake).mock.calls[0][0]
    expect(params).toMatchObject({ session, fileName: 'saved-name.mp4', assetName: 'Saved name' })
    expect((await store.listTakes())[0].kept).toBe(true)
    const nextSession = { ...session, upload_id: 'resumed' }
    act(() => { params.onSession?.(nextSession); params.onProgress?.(50) })
    expect(within(await panel()).getByText('Saving · 50%')).toBeInTheDocument()
    await waitFor(async () => {
      expect((await store.listTakes())[0].upload).toMatchObject({ session: nextSession, partsDone: 1, percent: 50 })
    })
    expect(revokeObjectURL).not.toHaveBeenCalled()
    await finishUpload(pending)
    expect(await store.listTakes()).toEqual([])
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:take-1')
    fireEvent.click(screen.getByRole('button', { name: 'Review My script take' }))
    expect(screen.getByText('Saved to Content Bin')).toBeInTheDocument()
    expect(screen.getByText('Saved. Open it in Creative Flo to watch it back.')).toBeInTheDocument()
    expect(document.querySelector('video[src=""]')).toBeNull()
    expect(document.querySelector('a[href=""]')).toBeNull()
    expect(markIdeaShot).not.toHaveBeenCalled()
    unmount()
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  it('recovers an interrupted recording and estimates its duration from committed chunks', async () => {
    const store = await seed({ state: 'recording', durationMs: 0, kept: false })
    renderApp()
    expect(within(await panel()).getByText('Recovered')).toBeInTheDocument()
    expect((await store.listTakes())[0]).toMatchObject({ state: 'ready', recovered: true, durationMs: 1000 })
  })

  it('revokes URLs on unmount while retaining footage and the session for the next mount', async () => {
    const store = await seed()
    const pending = deferred<TakeUploadResult>()
    vi.mocked(uploadTake).mockReturnValue(pending.promise)
    const { unmount } = renderApp()
    fireEvent.click(within(await panel()).getByRole('button', { name: 'Resume upload' }))
    await waitFor(() => expect(uploadTake).toHaveBeenCalledTimes(1))
    const params = vi.mocked(uploadTake).mock.calls[0][0]
    unmount()
    expect(params.signal?.aborted).toBe(true)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:take-1')
    // Initiation may finish after navigation; its session must still be saved.
    params.onSession?.({ ...session, upload_id: 'late-session' })
    await act(async () => { pending.reject(new DOMException('Aborted', 'AbortError')) })
    await waitFor(async () => {
      expect((await store.listTakes())[0].upload.session?.upload_id).toBe('late-session')
    })
    expect(await store.chunkSeqs('take-1')).toEqual([0])
    renderApp()
    await panel()
    expect(createObjectURL).toHaveBeenCalledTimes(2)
  })

  it('keeps upload failures resumable and visible in the restore panel', async () => {
    const store = await seed()
    vi.mocked(uploadTake).mockRejectedValue(new TypeError('Network gone'))
    renderApp()
    fireEvent.click(within(await panel()).getByRole('button', { name: 'Resume upload' }))
    expect(await within(await panel()).findByRole('alert')).toHaveTextContent('The upload did not finish')
    expect((await store.listTakes())[0].upload.session).toEqual(session)
    expect(revokeObjectURL).not.toHaveBeenCalled()
  })

  it('writes progress only when the integer completed-part count changes', async () => {
    const store = await seed()
    const update = vi.spyOn(store, 'updateTake')
    const pending = deferred<TakeUploadResult>()
    vi.mocked(uploadTake).mockReturnValue(pending.promise)
    renderApp()
    fireEvent.click(within(await panel()).getByRole('button', { name: 'Resume upload' }))
    await waitFor(() => expect(uploadTake).toHaveBeenCalledTimes(1))
    const params = vi.mocked(uploadTake).mock.calls[0][0]
    act(() => {
      params.onSession?.(session)
      params.onProgress?.(30) // floor(7 * .30 / 2) = 1
      params.onProgress?.(35) // still 1
      params.onProgress?.(40) // still 1
      params.onProgress?.(60) // now 2
    })
    await waitFor(async () => { expect((await store.listTakes())[0].upload.partsDone).toBe(2) })
    const progressWrites = update.mock.calls.filter(([, patch]) => patch.upload?.partsDone !== undefined)
    expect(progressWrites.map(([, patch]) => patch.upload)).toEqual([
      { partsDone: 1, percent: 30 }, { partsDone: 2, percent: 60 },
    ])
    await finishUpload(pending)
  })

  it('continues uploading even if persisting kept/session/progress fails', async () => {
    const store = await seed()
    const pending = deferred<TakeUploadResult>()
    vi.mocked(uploadTake).mockImplementation((params) => {
      params.onSession?.(session)
      params.onProgress?.(50)
      return pending.promise
    })
    renderApp()
    await panel()
    shim.failPutsAfter(0)
    fireEvent.click(screen.getByRole('button', { name: 'Resume upload' }))
    await waitFor(() => expect(uploadTake).toHaveBeenCalledTimes(1))
    await finishUpload(pending)
    expect(await store.listTakes()).toEqual([])
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:take-1')
  })

  it('persists a newly recorded take and deletes it through Retake', async () => {
    const store = await storeReady()
    renderApp()
    await screen.findByRole('button', { name: 'Shoot for Sample Creator' })
    fireEvent.change(screen.getByLabelText('Your teleprompter text'), { target: { value: 'Hello camera' } })
    const countdown = screen.getByRole('switch', { name: '3s countdown' })
    if (countdown.getAttribute('aria-checked') === 'true') fireEvent.click(countdown)
    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    act(() => { FakeMediaRecorder.instances[0].emitData(new Blob(['new footage'])) })
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))
    await screen.findByText('Safe on this phone')
    expect((await store.listTakes())[0]).toMatchObject({ state: 'ready', size: 11, assetName: expect.any(String), fileName: expect.any(String) })
    fireEvent.click(screen.getByRole('button', { name: 'Discard this take and retake' }))
    await waitFor(async () => { expect(await store.listTakes()).toEqual([]) })
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:take-1')
  })
})

describe('Shoot navigation guard', () => {
  it('does not prompt without takes', async () => {
    renderApp()
    await screen.findByRole('button', { name: 'Shoot for Sample Creator' })
    fireEvent.click(screen.getByRole('link', { name: 'Projects' }))
    expect(window.confirm).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('blocks same-origin navigation before React, ignores excluded links, and switches off after upload', async () => {
    await seed()
    const pending = deferred<TakeUploadResult>()
    vi.mocked(uploadTake).mockReturnValue(pending.promise)
    renderApp()
    await panel()
    expect(fireEvent.click(screen.getByRole('link', { name: 'Projects' }))).toBe(false)
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('saved on this phone but not uploaded yet'))
    expect(navigate).not.toHaveBeenCalled()
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    vi.mocked(window.confirm).mockClear()
    for (const name of ['Same page', 'New tab', 'Other site']) {
      fireEvent.click(screen.getByRole('link', { name }))
    }
    expect(window.confirm).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledTimes(3)
    fireEvent.click(screen.getByRole('button', { name: 'Resume upload' }))
    await waitFor(() => expect(uploadTake).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('link', { name: 'Projects' }))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    await finishUpload(pending)
    vi.mocked(window.confirm).mockClear()
    navigate.mockClear()
    fireEvent.click(screen.getByRole('link', { name: 'Projects' }))
    expect(window.confirm).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledTimes(1)
    const after = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
  })
})

describe('ShootApp saved camera preferences', () => {
  it('persists capture quality, Studio Look and the one-time Portrait tip across visits', async () => {
    const track = new FakeVideoTrack()
    vi.mocked(useCamera).mockReturnValue({ status: 'live', stream: videoStream(track), error: null, restart: vi.fn() })
    const first = renderApp()
    await screen.findByRole('button', { name: 'Shoot for Sample Creator' })
    fireEvent.click(screen.getByRole('button', { name: '1080p' }))
    fireEvent.change(screen.getByLabelText('Your teleprompter text'), { target: { value: 'Hello camera' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }))
    expect(screen.getByRole('region', { name: 'Studio Look tip' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('cf-shoot-settings') ?? '{}')).toMatchObject({
      quality: '1080p', studioLook: true, studioTipSeen: true,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to setup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }))
    expect(screen.queryByRole('region', { name: 'Studio Look tip' })).not.toBeInTheDocument()
    first.unmount()
    const second = renderApp()
    await screen.findByRole('button', { name: 'Shoot for Sample Creator' })
    expect(screen.getByRole('button', { name: '1080p' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByLabelText('Your teleprompter text'), { target: { value: 'Second visit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }))
    expect(screen.queryByRole('region', { name: 'Studio Look tip' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to setup' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Studio Look' }))
    expect(JSON.parse(localStorage.getItem('cf-shoot-settings') ?? '{}').studioLook).toBe(false)
    second.unmount()
    renderApp()
    await screen.findByRole('button', { name: 'Shoot for Sample Creator' })
    expect(screen.getByRole('switch', { name: 'Studio Look' })).toHaveAttribute('aria-checked', 'false')
  })
})
