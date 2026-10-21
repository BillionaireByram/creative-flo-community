import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShootErrorPanel } from '../error-panel'
import { shootError, type ShootErrorKind } from '../media'

const kinds: ShootErrorKind[] = [
  'insecure', 'unsupported-camera', 'unsupported-recorder', 'permission-denied',
  'no-camera', 'camera-busy', 'constraints', 'unknown',
]

afterEach(cleanup)

describe('ShootErrorPanel', () => {
  it.each(kinds)('renders the %s title and message from shootError', (kind) => {
    const error = shootError(kind)
    render(<ShootErrorPanel error={error} onRetry={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByRole('heading', { name: error.title })).toBeInTheDocument()
    expect(screen.getByText(error.message)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(error.message)
  })

  it('calls Try again and Back callbacks', () => {
    const onRetry = vi.fn()
    const onBack = vi.fn()
    render(<ShootErrorPanel error={{ ...shootError('camera-busy'), retryable: true }} onRetry={onRetry} onBack={onBack} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to setup' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('offers Back for errors that cannot be retried', () => {
    render(<ShootErrorPanel error={{ ...shootError('insecure'), retryable: false }} onRetry={vi.fn()} onBack={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to setup' })).toBeInTheDocument()
  })
})
