import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UploadFile } from '@/stores/upload-store'
import { api } from '@/lib/api'
import { InterviewFlow, InterviewPage } from '../interview/interview'
import { draftStorageKey } from '../interview/use-interview-draft'
import { TestCache, brand, interview, template, templateWithSample } from './fixtures'
const { push, uploads } = vi.hoisted(() => ({ push: vi.fn(), uploads: { files: [] as UploadFile[], startUpload: vi.fn(() => 'upload1') } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/hooks/use-sse', () => ({ useSSE: vi.fn() }))
vi.mock('@/stores/upload-store', () => ({ useUploadStore: (selector: (state: typeof uploads) => unknown) => selector(uploads) }))
vi.mock('@/lib/api', async () => ({ ...await vi.importActual<typeof import('@/lib/api')>('@/lib/api'), api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }))
beforeEach(() => {
  vi.clearAllMocks(); uploads.files = []; uploads.startUpload.mockReturnValue('upload1'); localStorage.clear()
  vi.mocked(api.get).mockImplementation(async (path) => path === '/cf/style-templates?brand=studio' ? [template] : path === '/cf/style-interviews/i1' ? interview() : [])
  vi.mocked(api.patch).mockResolvedValue(undefined)
  vi.mocked(api.post).mockResolvedValue({ style_id: 's1', version_id: 'v1' })
})
afterEach(cleanup)
const mount = (value = interview()) => render(<TestCache><InterviewFlow brand={brand} interview={value} /></TestCache>)
const saved = (answers: object) => interview({ answers: { version: 'style-lab-v3', ratings: {}, notes: {}, answers: {}, ...answers } })
const patchBody = (body: object) => ['/cf/style-interviews/i1', { answers: body }] as const

describe('full screen interview', () => {
  it.each([template, templateWithSample])('shows the template sample or motion fallback while choosing an editing style ($sample_url)', async (row) => {
    vi.mocked(api.get).mockImplementation(async (path) => path === '/cf/style-templates?brand=studio' ? [row] : [])
    mount(saved({ progress: { section: 2, updated: '' } }))
    await screen.findByRole('button', { name: `Love: ${row.name}` })
    if (row.sample_url) {
      const video = screen.getByLabelText(`${row.name} sample video`)
      expect(video).toHaveAttribute('src', row.sample_url)
      expect(video).toHaveAttribute('poster', row.poster_url)
      expect(video).toHaveProperty('muted', true)
      expect(video).toHaveAttribute('loop')
      expect(video).toHaveAttribute('playsinline')
      expect(screen.queryByRole('img', { name: `${row.name} motion sample` })).not.toBeInTheDocument()
    } else {
      expect(screen.getByRole('img', { name: `${row.name} motion sample` })).toBeVisible()
      expect(screen.queryByLabelText(`${row.name} sample video`)).not.toBeInTheDocument()
    }
  })
  it('navigates, saves only changed keys and restores body scrolling after exit', async () => {
    document.body.style.overflow = 'auto'
    const { unmount } = mount()
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.change(screen.getByLabelText('Brand or business name *'), { target: { value: 'My brand' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'Platforms and formats' })).toBeVisible()
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(...patchBody({ answers: { brand: 'My brand' }, progress: { section: 1, updated: expect.any(String) } })))
    fireEvent.click(screen.getByRole('button', { name: 'IG Reels' }))
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/studio/style'))
    expect(api.patch).toHaveBeenLastCalledWith(...patchBody({ answers: { platforms: ['IG Reels'] } }))
    unmount(); expect(document.body.style.overflow).toBe('auto')
  })
  it('rates samples as love, maybe or no with a separate note, and writes notes by sample id', async () => {
    mount(saved({ progress: { section: 3, updated: '' } }))
    expect(screen.getByRole('heading', { name: 'Ten looks' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Love: Neo-noir anamorphic' }))
    fireEvent.change(screen.getByLabelText('Note on Neo-noir anamorphic'), { target: { value: 'No letterbox bars' } })
    fireEvent.change(screen.getByLabelText('Anything to add about this section?'), { target: { value: 'Make it feel like a film' } })
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(...patchBody({ ratings: { 'look-noir': 'love' }, notes: { 'look-noir': 'No letterbox bars', 'section:looks': 'Make it feel like a film' } })))
    fireEvent.click(screen.getByRole('button', { name: 'Love: Neo-noir anamorphic' }))
    await waitFor(() => expect(api.patch).toHaveBeenLastCalledWith(...patchBody({ ratings: { 'look-noir': null } })))
  })
  it('rates editing styles as tmpl-<key> and applies a Flo suggestion from the loved style', async () => {
    mount(saved({ ratings: { 'tmpl-cinema': 'love' }, progress: { section: 4, updated: '' } }))
    expect(screen.getByRole('heading', { name: 'Type' })).toBeVisible()
    fireEvent.click(within(await screen.findByRole('complementary')).getByRole('button', { name: /Love: Wide grotesk/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Jump to a section' }))
    fireEvent.click(screen.getByRole('button', { name: '6. Captions' }))
    expect(screen.getByRole('heading', { name: 'Captions' })).toBeVisible()
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(...patchBody({ ratings: { 'type-archivo': 'love' }, progress: { section: 5, updated: expect.any(String) } })))
  })
  it('saves list, words, yes and no, number and length answers in the shapes the builder reads', async () => {
    mount(saved({ progress: { section: 0, updated: '' } }))
    fireEvent.change(screen.getByLabelText('Reference videos'), { target: { value: 'https://example.com/a\n\nhttps://example.com/b\n' } })
    expect(screen.getByLabelText('Reference videos')).toHaveValue('https://example.com/a\n\nhttps://example.com/b\n')
    fireEvent.change(screen.getByLabelText('IS word 1'), { target: { value: 'Bold' } })
    fireEvent.change(screen.getByLabelText('NEVER word 2'), { target: { value: 'Loud' } })
    fireEvent.change(screen.getByLabelText('Primary color'), { target: { value: '#112233' } })
    fireEvent.click(screen.getByRole('button', { name: 'Business owners' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(...patchBody({ answers: {
      reference_videos: ['https://example.com/a', 'https://example.com/b'], words: { is: ['Bold'], never: ['Loud'] },
      color1: '#112233', colorsMode: 'Use these colors', colors: ['#112233'], audience: ['Business owners'],
    } })))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Vertical 9:16 (Reels, TikTok, Shorts)' }))
    fireEvent.change(screen.getByLabelText('Vertical 9:16'), { target: { value: '20-40s' } })
    await waitFor(() => expect(api.patch).toHaveBeenLastCalledWith(...patchBody({ answers: { formats: ['Vertical 9:16 (Reels, TikTok, Shorts)'], lengths: { 'Vertical 9:16 (Reels, TikTok, Shorts)': '20-40s' } } })))
  })
  it('stores yes and no as booleans, music under talking in lower case, and pace out of ten', async () => {
    mount(saved({ progress: { section: 8, updated: '' } }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Stickers and emoji' })).getByRole('button', { name: 'Yes' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Sound words on screen' })).getByRole('button', { name: 'No' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(...patchBody({ answers: { stickers: true, sound_text: false } })))
    fireEvent.click(screen.getByRole('button', { name: 'Jump to a section' }))
    fireEvent.click(screen.getByRole('button', { name: '11. Music and sound' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Music under talking' })).getByRole('button', { name: 'Low' }))
    fireEvent.click(screen.getByRole('button', { name: 'Minimal lo-fi' }))
    fireEvent.click(screen.getByRole('button', { name: 'Jump to a section' }))
    fireEvent.click(screen.getByRole('button', { name: '12. How much editing?' }))
    fireEvent.change(screen.getByLabelText('Pace'), { target: { value: '8' } })
    await waitFor(() => {
      const sent = Object.assign({}, ...vi.mocked(api.patch).mock.calls.map(([, body]) => (body as { answers: { answers?: object } }).answers.answers))
      expect(sent).toMatchObject({ stickers: true, sound_text: false, music_under: 'low', music: ['Minimal lo-fi'], pace: 8 })
    })
  })
  it('submits after a successful flush, marks the interview done and routes to the building style', async () => {
    mount(saved({ answers: { brand: 'Studio' }, progress: { section: 13, updated: '' } }))
    expect(screen.getByText('What do you sell, and to who? is still open.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Build my style' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/cf/style-interviews/i1/submit'))
    expect(api.patch).toHaveBeenCalledWith(...patchBody({ answers: { done: true } }))
    expect(push).toHaveBeenCalledWith('/studio/style/s1')
  })
  it('blocks submission only for a missing brand name or failed save', async () => {
    mount(saved({ progress: { section: 13, updated: '' } }))
    fireEvent.click(screen.getByRole('button', { name: 'Build my style' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Add your brand name')
    expect(api.post).not.toHaveBeenCalled()
  })
  it('keeps unsaved edits on this device and never submits past a failed flush', async () => {
    vi.mocked(api.patch).mockRejectedValue(new Error('Offline'))
    mount(saved({ answers: { brand: 'Studio' }, progress: { section: 12, updated: '' } }))
    fireEvent.change(screen.getByLabelText('Describe your perfect video'), { target: { value: 'Quiet and warm' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review picks' }))
    await screen.findByText("Couldn't save, retrying")
    fireEvent.click(screen.getByRole('button', { name: 'Build my style' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Reconnect and try building again.')
    expect(api.post).not.toHaveBeenCalled()
    expect(localStorage.getItem(draftStorageKey('i1'))).toContain('Quiet and warm')
  })
  it('keeps the logo receipt when the upload completes on a later section and saves only the asset id', async () => {
    const { rerender } = mount()
    fireEvent.change(screen.getByLabelText('Logo upload'), { target: { files: [new File(['logo'], 'logo.png', { type: 'image/png' })] } })
    expect(uploads.startUpload).toHaveBeenCalledWith(expect.any(File), 'project-1', 'Studio logo', 'Studio')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    uploads.files = [{ id: 'upload1', fileName: 'logo.png', fileSize: 4, fileType: 'image/png', projectId: 'project-1', assetName: 'Logo', progress: 100, processingProgress: 100, status: 'complete', assetId: 'logo-asset', createdAt: 1 }]
    rerender(<TestCache><InterviewFlow brand={brand} interview={interview()} /></TestCache>)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(...patchBody({ answers: { logo_asset_id: 'logo-asset' }, progress: expect.anything() })))
  })
  it('does not open an editable interview for a non-owner', async () => {
    render(<TestCache><InterviewPage brand={{ ...brand, role: 'editor' }} id="i1" /></TestCache>)
    expect(await screen.findByText('Only the brand owner can take this interview.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
  })
})
