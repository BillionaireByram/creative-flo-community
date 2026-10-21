import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'
import { StyleHome } from '../style-home'
import { StyleDetail } from '../style-detail'
import { TemplatesGallery } from '../templates-gallery'
import { StyleOnboardingBanner } from '../onboarding-banner'
import { AssetStyleSwitcher } from '../asset-style-switcher'
import { BrandPage } from '../brand-page'
import { TestCache, brand, interview, recommendation, style, styleDetail, template, templateWithSample, version } from './fixtures'
import type { AssetResponse } from '@/types'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: push }), usePathname: () => '/studio/style' }))
vi.mock('@/hooks/use-page-title', () => ({ usePageTitle: vi.fn() }))
vi.mock('@/hooks/use-sse', () => ({ useSSE: vi.fn() }))
vi.mock('@/lib/api', async () => {
  const original = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...original, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn() } }
})
beforeEach(() => { localStorage.clear(); vi.resetAllMocks(); vi.mocked(api.post).mockResolvedValue({}); vi.mocked(api.patch).mockResolvedValue({}) })
afterEach(cleanup)
function defaults(extra: Record<string, unknown> = {}) {
  vi.mocked(api.get).mockImplementation(async (path) => ({
    '/cf/brands': [brand], '/cf/styles?brand=studio': [style()], '/cf/styles/s1': styleDetail(),
    '/cf/style-recommendations?brand=studio': [], '/cf/style-templates?brand=studio': [template], '/cf/style-templates/cinema': template,
    ...extra,
  }[path] ?? []))
}
function mount(node: React.ReactNode) { return render(<TestCache>{node}</TestCache>) }

describe('Style home and brand routing', () => {
  it('offers the first interview when there is no approved style', async () => {
    defaults({ '/cf/styles?brand=studio': [] }); vi.mocked(api.post).mockResolvedValue(interview())
    mount(<StyleHome brand={brand} />)
    expect(await screen.findByText("Let's build your style")).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Start the interview' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/cf/style-interviews', { brand: 'studio', mode: 'new' }))
    expect(push).toHaveBeenCalledWith('/studio/style/interview/i1')
  })
  it('offers a saved interview after exiting to the home page', async () => {
    defaults()
    localStorage.setItem('cf-style-resume:studio', 'saved-interview')
    mount(<StyleHome brand={brand} />)
    expect(await screen.findByRole('link', { name: 'Resume your interview' })).toHaveAttribute('href', '/studio/style/interview/saved-interview')
  })
  it('shows cards, default badge, proposals and open recommendations', async () => {
    defaults({ '/cf/styles?brand=studio': [style({ is_default: true, open_proposals: 1 })], '/cf/style-recommendations?brand=studio': [recommendation(), recommendation({ id: 'old', status: 'dismissed', reason: 'Hidden recommendation' })] })
    mount(<StyleHome brand={brand} />)
    expect(await screen.findByText('Story mode')).toBeVisible(); expect(screen.getByText('Default')).toBeVisible()
    expect(screen.getByText('New version to review')).toBeVisible()
    expect(await screen.findByText('Clearer words hold attention.')).toBeVisible()
    expect(screen.queryByText('Hidden recommendation')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/cf/styles/s1/improve', { request: 'Bigger captions' }))
    expect(api.post).toHaveBeenCalledWith('/cf/style-recommendations/r1/use')
  })
  it('shows a building style from the list and loads its draft only while nothing is approved yet', async () => {
    const building = { current_version: null, current_version_id: null, building_count: 1 }
    defaults({ '/cf/styles?brand=studio': [style(building)], '/cf/styles/s1': styleDetail({ ...building, versions: [version({ id: 'v1', status: 'building', preview: {} })] }) })
    mount(<StyleHome brand={brand} />)
    expect(await screen.findByText('Flo is building...')).toBeVisible()
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/cf/styles/s1'))
    expect(await screen.findByText('Version 1')).toBeVisible()
  })
  it('does not fetch every style detail when each list row already has its approved version', async () => {
    defaults({ '/cf/styles?brand=studio': [style()] })
    mount(<StyleHome brand={brand} />)
    expect(await screen.findByText('Version 1')).toBeVisible()
    expect(api.get).not.toHaveBeenCalledWith('/cf/styles/s1')
  })
  it('makes failed reads retryable', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Offline'))
    mount(<StyleHome brand={brand} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your styles.')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  })
  it('does not expose owner writes to editors', async () => {
    defaults({ '/cf/styles?brand=studio': [] }); mount(<StyleHome brand={{ ...brand, role: 'editor' }} />)
    expect(await screen.findByText('Your brand owner can start the interview.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'New style' })).not.toBeInTheDocument()
  })
  it('shows unknown brands without rendering another brand data', async () => {
    defaults(); mount(<BrandPage slug="other">{() => <div>Wrong brand</div>}</BrandPage>)
    expect(await screen.findByText('Brand not found')).toBeVisible(); expect(screen.queryByText('Wrong brand')).not.toBeInTheDocument()
  })
})

describe('style detail owner review', () => {
  function detail(owner = true, isDefault = false) {
    defaults({ '/cf/styles/s1': styleDetail({ is_default: isDefault, versions: [version({ id: 'v2', version: 2, status: 'proposed', changelog: 'Bigger words' }), version()] }) })
    mount(<StyleDetail brand={{ ...brand, role: owner ? 'owner' : 'editor' }} id="s1" />)
  }
  it('compares approved and proposed samples and lets the owner approve or reject with a note', async () => {
    detail()
    expect(await screen.findByRole('region', { name: 'Compare versions' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Approve version 2' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/cf/style-versions/v2/approve'))
    fireEvent.change(screen.getByLabelText('Optional rejection note'), { target: { value: 'Too busy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject version 2' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/cf/style-versions/v2/reject', { note: 'Too busy' }))
  })
  it('hides write controls from non-owners', async () => {
    detail(false)
    expect(await screen.findByText('Only the brand owner can change or approve styles.')).toBeVisible()
    for (const name of ['Approve version 2', 'Reject version 2', 'Send', 'Make default', 'Archive']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
  })
  it('posts improvements and changes default', async () => {
    detail()
    fireEvent.change(await screen.findByLabelText('What should change?'), { target: { value: 'Bigger captions' } })
    expect(screen.getByLabelText('What should change?')).toHaveAttribute('maxlength', '4000')
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/cf/styles/s1/improve', { request: 'Bigger captions' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Make default' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Make default' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/cf/styles/s1/default'))
  })
  it('disables archive on the default', async () => { detail(true, true); expect(await screen.findByRole('button', { name: 'Archive' })).toBeDisabled() })
  it('requires confirmation to archive and returns to the brand home', async () => {
    detail(); fireEvent.click(await screen.findByRole('button', { name: 'Archive' }))
    expect(api.post).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Archive style' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/cf/styles/s1/archive'))
    expect(push).toHaveBeenCalledWith('/studio/style')
  })
  it('restarts a failed build with the retry endpoint, not a new request', async () => {
    defaults({ '/cf/styles/s1': styleDetail({ versions: [version({ id: 'v2', version: 2, status: 'failed', error: 'I need you on this one. Please try again or adjust your style choices.', request: 'Less motion' }), version()] }) })
    mount(<StyleDetail brand={brand} id="s1" />)
    expect(await screen.findByText('I need you on this one')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/cf/style-versions/v2/retry'))
    expect(api.post).not.toHaveBeenCalledWith('/cf/styles/s1/improve', expect.anything())
  })
  it('does not offer to approve a proposal that an approved version has already replaced', async () => {
    const current = version({ id: 'v2', version: 2, status: 'approved' })
    defaults({ '/cf/styles/s1': styleDetail({ current_version_id: 'v2', current_version: current, versions: [current, version({ id: 'v1', version: 1, status: 'proposed', changelog: 'Started from a template' })] }) })
    mount(<StyleDetail brand={brand} id="s1" />)
    expect(await screen.findByText('Replaced by a newer approved version.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Approve version 1' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Compare versions' })).not.toBeInTheDocument()
  })
  it('asks for an approved version before offering improvements', async () => {
    defaults({ '/cf/styles/s1': styleDetail({ current_version: null, current_version_id: null, versions: [version({ status: 'proposed' })] }) })
    mount(<StyleDetail brand={brand} id="s1" />)
    expect(await screen.findByText(/Approve a version first/)).toBeVisible()
    expect(screen.queryByLabelText('What should change?')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retake the interview' })).toBeVisible()
  })
  it('creates an improvement interview for a retake', async () => {
    defaults(); vi.mocked(api.post).mockResolvedValue(interview()); mount(<StyleDetail brand={brand} id="s1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Retake the interview' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/cf/style-interviews', { brand: 'studio', style_id: 's1', mode: 'improve' }))
  })
})

describe('templates', () => {
  it.each([template, templateWithSample])('shows the sample or motion fallback in the gallery and customize dialog ($sample_url)', async (row) => {
    defaults({ '/cf/style-templates?brand=studio': [row], '/cf/style-templates/cinema': row })
    mount(<TemplatesGallery brand={brand} />)
    await screen.findByRole('heading', { name: row.name })
    const gallery = within(screen.getByRole('article'))
    if (row.sample_url) {
      expect(gallery.getByLabelText(`${row.name} sample video`)).toHaveAttribute('src', row.sample_url)
      expect(gallery.getByLabelText(`${row.name} sample video`)).toHaveAttribute('poster', row.poster_url)
      expect(gallery.queryByRole('img', { name: `${row.name} motion sample` })).not.toBeInTheDocument()
    } else {
      expect(gallery.getByRole('img', { name: `${row.name} motion sample` })).toBeVisible()
      expect(gallery.queryByLabelText(`${row.name} sample video`)).not.toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('button', { name: 'Use this template' }))
    const dialog = within(screen.getByRole('dialog'))
    await dialog.findByText(`Starting from ${row.name}`)
    if (row.sample_url) {
      const video = dialog.getByLabelText(`${row.name} sample video`)
      expect(video).toHaveAttribute('src', row.sample_url)
      expect(video).toHaveAttribute('poster', row.poster_url)
      expect(video).toHaveProperty('muted', true)
      expect(video).toHaveAttribute('loop')
      expect(video).toHaveAttribute('playsinline')
      expect(dialog.queryByRole('img', { name: `${row.name} motion sample` })).not.toBeInTheDocument()
    } else {
      expect(dialog.getByRole('img', { name: `${row.name} motion sample` })).toBeVisible()
      expect(dialog.queryByLabelText(`${row.name} sample video`)).not.toBeInTheDocument()
    }
  })
  it('shows recommendations and customizes a named template draft through improve mode', async () => {
    defaults(); vi.mocked(api.post).mockResolvedValueOnce({ id: 'new-style' }).mockResolvedValueOnce(interview())
    mount(<TemplatesGallery brand={brand} />)
    expect(await screen.findByText('Recommended for you')).toBeVisible()
    expect(screen.getByText('What is working right now')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Use this template' }))
    fireEvent.change(screen.getByLabelText('Style name'), { target: { value: 'My cinematic style' } })
    fireEvent.click(screen.getByRole('button', { name: 'Customize this style' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/studio/style/interview/i1'))
    expect(api.post).toHaveBeenNthCalledWith(1, '/cf/styles', { brand: 'studio', name: 'My cinematic style', from_template: 'cinema' })
    expect(api.post).toHaveBeenNthCalledWith(2, '/cf/style-interviews', { brand: 'studio', style_id: 'new-style', mode: 'improve' })
  })
  it('retries interview creation without creating a second draft', async () => {
    defaults(); vi.mocked(api.post).mockResolvedValueOnce({ id: 'new-style' }).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(interview())
    mount(<TemplatesGallery brand={brand} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Use this template' }))
    fireEvent.change(screen.getByLabelText('Style name'), { target: { value: 'Mine' } })
    fireEvent.click(screen.getByRole('button', { name: 'Customize this style' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline')
    fireEvent.click(screen.getByRole('button', { name: 'Customize this style' }))
    await waitFor(() => expect(push).toHaveBeenCalled())
    expect(vi.mocked(api.post).mock.calls.filter(([path]) => path === '/cf/styles')).toHaveLength(1)
  })
  it('filters template tags', async () => {
    defaults({ '/cf/style-templates?brand=studio': [template, { ...template, key: 'minimal', name: 'Clean', tags: ['Minimal'] }] })
    mount(<TemplatesGallery brand={brand} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Minimal' }))
    expect(screen.queryByRole('heading', { name: 'Cinematic Story' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Clean' })).toBeVisible()
  })
})

const asset: AssetResponse = { id: 'a1', project_id: 'project-1', asset_type: 'video', name: 'Video', status: 'in_review', description: null, rating: null, assignee_id: null, folder_id: null, due_date: null, keywords: [], created_by: 'u1', created_at: '', updated_at: '', deleted_at: null, latest_version: null, thumbnail_url: null }
describe('project and review mounts', () => {
  it.each([false, true, undefined])('shows onboarding only for style_ready=false (%s)', async (ready) => {
    defaults({ '/cf/brands': [{ ...brand, style_ready: ready }] }); mount(<StyleOnboardingBanner projectId="project-1" />)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/cf/brands'))
    if (ready === false) expect(await screen.findByRole('link')).toHaveAttribute('href', '/studio/style')
    else expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
  it('renders nothing for non-brand projects', async () => {
    defaults(); const { container } = mount(<><StyleOnboardingBanner projectId="other" /><AssetStyleSwitcher asset={{ ...asset, project_id: 'other' }} /></>)
    await waitFor(() => expect(api.get).toHaveBeenCalled()); expect(container).toBeEmptyDOMElement()
  })
  it('lets the owner set and clear a video override with the style endpoint', async () => {
    const other = style({ id: 's2', name: 'Fast cut', is_default: false, current_version: version({ id: 'v9', style_id: 's2', version: 4 }) })
    defaults({ '/cf/styles?brand=studio': [style({ is_default: true }), other] })
    vi.mocked(api.put).mockResolvedValueOnce({ asset_id: 'a1', style_id: 's2' }).mockResolvedValueOnce({ asset_id: 'a1', style_id: null })
    const changed = vi.fn()
    mount(<AssetStyleSwitcher asset={asset} onChanged={changed} />)
    expect(await screen.findByText('Edited in: Story mode v1')).toBeVisible()
    fireEvent.change(await screen.findByLabelText('Editing style for this video'), { target: { value: 's2' } })
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/cf/assets/a1/style', { style_id: 's2' }))
    expect(await screen.findByText('Edited in: Fast cut v4')).toBeVisible()
    expect(changed).toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Editing style for this video'), { target: { value: '' } })
    await waitFor(() => expect(api.put).toHaveBeenLastCalledWith('/cf/assets/a1/style', { style_id: null }))
    expect(await screen.findByText('Edited in: Story mode v1')).toBeVisible()
  })
  it('shows the brand default when the video points at a style that is gone', async () => {
    defaults({ '/cf/styles?brand=studio': [style({ is_default: true })] })
    mount(<AssetStyleSwitcher asset={{ ...asset, cf_style_id: 'archived-style' }} />)
    expect(await screen.findByText('Edited in: Story mode v1')).toBeVisible()
  })
  it('shows only read-only text for editors', async () => {
    defaults({ '/cf/brands': [{ ...brand, role: 'editor' }], '/cf/styles?brand=studio': [style({ is_default: true })] })
    mount(<AssetStyleSwitcher asset={asset} />)
    expect(await screen.findByText('Edited in: Story mode v1')).toBeVisible()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})
