import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'
import { StyleCard } from '../style-card'
import { RatingCard } from '../interview/rating-card'
import { DesignMarkdown } from '../design-markdown'
import type { Rating } from '../types'
import { TestCache, preview, templateWithSample, version } from './fixtures'
vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }))
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.restoreAllMocks() })

describe('preview cards', () => {
  it('renders palette, actual font families, captions and pace from preview', () => {
    render(<TestCache><StyleCard name="Story" version={version()} /></TestCache>)
    expect(screen.getByRole('img', { name: '#d9b26a' })).toHaveStyle({ backgroundColor: '#d9b26a' })
    expect(screen.getByText('Archivo')).toHaveStyle({ fontFamily: '"Archivo", Arial, sans-serif' })
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '3')
    expect(screen.getByText('Make your next move')).toBeVisible()
    expect(screen.getByText('Minimal lo-fi')).toBeVisible()
    expect(screen.getByText('Sample renders after your style is built')).toBeVisible()
  })
  it('waits for tap before mounting a native video from the version sample address', async () => {
    render(<TestCache><StyleCard name="Story" version={version({ sample_asset_id: 'a1', sample_url: 'https://media.example/sample.mp4' })} /></TestCache>)
    expect(screen.queryByLabelText('Story sample video')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Play Story sample' }))
    const video = await screen.findByLabelText('Story sample video')
    expect(video).toHaveAttribute('controls'); expect(video).toHaveAttribute('playsinline'); expect(video).toHaveAttribute('src', 'https://media.example/sample.mp4')
    expect(api.get).not.toHaveBeenCalled()
  })
  it('explains a sample that is saved but not ready to play yet', () => {
    render(<TestCache><StyleCard name="Story" version={version({ sample_asset_id: 'a1', sample_url: null })} /></TestCache>)
    expect(screen.getByText('Your sample video is almost ready.')).toBeVisible()
  })
  it('plays a template sample address and keeps line breaks in the caption sample', () => {
    render(<TestCache><StyleCard name="Template" preview={{ ...preview, caption_sample: 'STOP\nWASTING' }} sampleUrl="https://media.example/t.mp4" /></TestCache>)
    expect(screen.getByRole('button', { name: 'Play Template sample' })).toBeVisible()
    expect(screen.getByText(/STOP/)).toHaveClass('whitespace-pre-line')
  })
  it('handles absent previews and injects the runtime font link once', () => {
    render(<TestCache><StyleCard name="Empty" /><StyleCard name="Building" version={version({ status: 'building', preview: {} })} /></TestCache>)
    expect(screen.getByText('Flo is building your sample...')).toBeVisible()
    expect(document.querySelectorAll('#cf-style-fonts')).toHaveLength(1)
  })
  it('drives template motion with preview values', () => {
    render(<StyleCard name="Template" preview={preview} motion />)
    expect(screen.getByRole('img', { name: 'Template motion sample' })).toHaveAttribute('data-treatment', 'pop words')
  })
  it('renders safe collapsible markdown without HTML execution or unsafe links', () => {
    const { container } = render(<DesignMarkdown markdown={'# Signature\n**Bold** type\n## Never\n- Noise\n<script>alert(1)</script>\n[Unsafe](javascript:alert)\n[Reference](https://example.com)'} />)
    expect(container.querySelectorAll('details')).toHaveLength(2)
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByRole('link', { name: 'Reference' })).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.queryByRole('link', { name: 'Unsafe' })).not.toBeInTheDocument()
  })
})
describe('rendered template samples', () => {
  const card = (sampleUrl: string | null = templateWithSample.sample_url, posterUrl: string | null = templateWithSample.poster_url) => <StyleCard name="Template" preview={preview} sampleUrl={sampleUrl} posterUrl={posterUrl} motion />
  it('replaces the motion sample with a muted, inline, looping video and its poster', () => {
    render(card())
    const video = screen.getByLabelText('Template sample video')
    expect(video).toHaveAttribute('src', templateWithSample.sample_url)
    expect(video).toHaveAttribute('poster', templateWithSample.poster_url)
    expect(video).toHaveProperty('muted', true)
    expect(video).toHaveAttribute('loop')
    expect(video).toHaveAttribute('playsinline')
    expect(video).toHaveAttribute('autoplay')
    expect(video).not.toHaveAttribute('controls')
    expect(screen.queryByRole('img', { name: 'Template motion sample' })).not.toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalled()
  })
  it('plays the same video with sound and native controls after a tap', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    render(card())
    const video = screen.getByLabelText('Template sample video')
    fireEvent.click(screen.getByRole('button', { name: 'Play Template sample with sound' }))
    expect(play).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Template sample video')).toBe(video)
    expect(video).toHaveProperty('muted', false)
    expect(video).toHaveAttribute('controls')
    expect(video).toHaveAttribute('loop')
    expect(screen.queryByRole('button', { name: 'Play Template sample with sound' })).not.toBeInTheDocument()
  })
  it.each([null, '', 'javascript:alert(1)', '//media.example/sample.mp4'])('keeps the live motion fallback for an absent or invalid sample (%s)', (url) => {
    render(card(url))
    expect(screen.getByRole('img', { name: 'Template motion sample' })).toBeVisible()
    expect(screen.queryByLabelText('Template sample video')).not.toBeInTheDocument()
    expect(screen.queryByText('Sample renders after your style is built')).not.toBeInTheDocument()
  })
  it.each([null, 'javascript:alert(1)'])('plays without an absent or invalid poster (%s)', (poster) => {
    render(card(templateWithSample.sample_url, poster))
    expect(screen.getByLabelText('Template sample video')).not.toHaveAttribute('poster')
  })
  it('retries a failed preview muted without submitting the surrounding form', () => {
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault())
    render(<form onSubmit={submit}>{card()}</form>)
    fireEvent.error(screen.getByLabelText('Template sample video'))
    expect(screen.getByRole('alert')).toHaveTextContent('Could not play this sample.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByLabelText('Template sample video')).toHaveProperty('muted', true)
    expect(submit).not.toHaveBeenCalled()
  })
  it('makes a rejected playback request retryable', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('Playback unavailable'))
    render(card())
    fireEvent.click(screen.getByRole('button', { name: 'Play Template sample with sound' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not play this sample.'))
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
  })
  it('clears a failed preview when a refreshed sample address arrives', () => {
    const { rerender } = render(card())
    fireEvent.error(screen.getByLabelText('Template sample video'))
    rerender(card('/samples/refreshed.mp4', '/samples/refreshed.jpg'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Template sample video')).toHaveAttribute('src', '/samples/refreshed.mp4')
    expect(screen.getByLabelText('Template sample video')).toHaveAttribute('poster', '/samples/refreshed.jpg')
  })
})
function RatedSample() {
  const [rating, setRating] = useState<Rating>()
  const [note, setNote] = useState('')
  return <RatingCard title="Neo-noir" rating={rating} note={note} onRate={(next) => setRating(rating === next ? undefined : next)} onNote={setNote}><div>Live sample</div></RatingCard>
}
it('keeps one rating pressed, toggles off, and preserves the note', () => {
  render(<RatedSample />)
  fireEvent.change(screen.getByLabelText('Note on Neo-noir'), { target: { value: 'Just the light' } })
  fireEvent.click(screen.getByRole('button', { name: 'Love: Neo-noir' }))
  expect(screen.getByRole('button', { name: 'Love: Neo-noir' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'No: Neo-noir' }))
  expect(screen.getByRole('button', { name: 'Love: Neo-noir' })).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(screen.getByRole('button', { name: 'No: Neo-noir' }))
  expect(screen.getByRole('button', { name: 'No: Neo-noir' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByLabelText('Note on Neo-noir')).toHaveValue('Just the light')
})
