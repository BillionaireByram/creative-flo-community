import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SetupScreen } from '../setup-screen'
import { DEFAULT_SETTINGS, type ShootSettings } from '../settings'
import { brand } from './recorder-fixtures'

afterEach(cleanup)

function Setup({ initial = DEFAULT_SETTINGS, onChange = vi.fn() }: {
  initial?: ShootSettings
  onChange?: (patch: Partial<ShootSettings>) => void
}) {
  const [settings, setSettings] = useState(initial)
  return <SetupScreen settings={settings} brands={[brand]} brandsLoading={false} brandsError={false}
    ideas={[]} ideasLoading={false} ideasError={false} selectedIdea={null} text="Hello" takes={[]}
    onChange={(patch) => { onChange(patch); setSettings((current) => ({ ...current, ...patch })) }}
    onStart={vi.fn()} onReviewTake={vi.fn()} onRetryBrands={vi.fn()} onRetryIdeas={vi.fn()} />
}

describe('SetupScreen camera preferences', () => {
  it('shows defaults and changes Studio Look in the Camera section', () => {
    const onChange = vi.fn()
    render(<Setup onChange={onChange} />)
    const camera = within(screen.getByRole('region', { name: 'Camera' }))
    expect(camera.getByRole('switch', { name: 'Studio Look' })).toHaveAttribute('aria-checked', 'true')
    expect(camera.getByText("Blurs your background so you stand out. Uses your phone's Portrait effect.")).toBeInTheDocument()
    expect(camera.getByRole('group', { name: 'Camera facing' }).nextElementSibling).toBe(camera.getByRole('switch', { name: 'Studio Look' }))
    fireEvent.click(camera.getByRole('switch', { name: 'Studio Look' }))
    expect(onChange).toHaveBeenLastCalledWith({ studioLook: false })
    expect(camera.getByRole('switch', { name: 'Studio Look' })).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(camera.getByRole('switch', { name: 'Studio Look' }))
    expect(onChange).toHaveBeenLastCalledWith({ studioLook: true })
  })

  it('selects both quality options without changing camera facing', () => {
    const onChange = vi.fn()
    render(<Setup initial={{ ...DEFAULT_SETTINGS, facing: 'environment' }} onChange={onChange} />)
    const quality = within(screen.getByRole('group', { name: 'Capture quality' }))
    expect(quality.getByRole('button', { name: '4K' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('4K looks sharpest. Use 1080p if uploads are slow.')).toBeInTheDocument()
    fireEvent.click(quality.getByRole('button', { name: '1080p' }))
    expect(onChange).toHaveBeenLastCalledWith({ quality: '1080p' })
    expect(quality.getByRole('button', { name: '1080p' })).toHaveAttribute('aria-pressed', 'true')
    expect(quality.getByRole('button', { name: '4K' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Back camera' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(quality.getByRole('button', { name: '4K' }))
    expect(onChange).toHaveBeenLastCalledWith({ quality: '4k' })
  })
})
