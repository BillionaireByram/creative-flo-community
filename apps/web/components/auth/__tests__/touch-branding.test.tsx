import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AuthBrandingHeader } from '../auth-branding-header'

vi.mock('@/components/shared/branding-provider', () => ({
  useEnsureBranding: () => {},
  useBranding: () => ({ orgName: 'Averylongunbrokenworkspacename', loginLogoUrl: '/wide-logo.svg' }),
}))
vi.mock('@/hooks/use-resolved-theme', () => ({ useResolvedTheme: () => 'dark' }))
afterEach(cleanup)

describe('touch auth branding', () => {
  it('caps wide logos and wraps long names within the phone viewport', () => {
    render(<AuthBrandingHeader />)
    const logo = screen.getByRole('img', { name: 'Averylongunbrokenworkspacename' })
    expect(logo).toHaveClass('max-w-full')
    expect(logo.parentElement).toHaveClass('min-w-0', 'max-w-full', 'break-words')
  })
})
