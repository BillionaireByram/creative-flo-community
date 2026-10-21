/**
 * The creator credit is license attribution (see NOTICE), not white-label
 * branding. It must render on the sign-in page and in Settings even when an
 * admin switches the "Powered by" badge off.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({ poweredByFreeframe: false }))

vi.mock('@/components/shared/branding-provider', () => ({
  useBranding: () => ({ poweredByFreeframe: h.poweredByFreeframe, orgName: 'Acme Studio' }),
}))
vi.mock('@/components/shared/themed-default-logo', () => ({ ThemedDefaultLogo: () => null }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/settings/profile',
}))
vi.mock('@/lib/api', () => ({ api: { get: vi.fn(() => Promise.resolve({ needs_setup: false })) } }))
vi.mock('@/lib/auth', () => ({ getAccessToken: () => null }))
vi.mock('@/components/auth/login-form', () => ({ LoginForm: () => <form aria-label="login" /> }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({ user: { name: 'Admin' }, isSuperAdmin: true }),
}))

import { CreatorCredit, CREATOR_CREDIT, CREATOR_URL } from '../creator-credit'
import LoginPage from '@/app/(auth)/login/page'
import SettingsLayout from '@/app/(dashboard)/settings/layout'

const creditLink = () => screen.getByRole('link', { name: CREATOR_CREDIT })

beforeEach(() => { h.poweredByFreeframe = false })

describe('CreatorCredit', () => {
  it('names the creator and links to the website', () => {
    render(<CreatorCredit />)
    expect(CREATOR_CREDIT).toBe('Creative Flo by Byram Smith Jr. · DigitalFlo')
    expect(creditLink().getAttribute('href')).toBe(CREATOR_URL)
    expect(CREATOR_URL).toBe('https://mydigitalflo.io')
  })

  it('stays on the login page when the Powered by badge is switched off', () => {
    render(<LoginPage />)
    expect(screen.queryByText(/Powered by/)).toBeNull()
    expect(creditLink()).toBeTruthy()
  })

  it('appears alongside the Powered by badge when the badge is on', () => {
    h.poweredByFreeframe = true
    render(<LoginPage />)
    expect(screen.getByText(/Powered by/)).toBeTruthy()
    expect(creditLink()).toBeTruthy()
  })

  it('stays in Settings when the Powered by badge is switched off', () => {
    render(<SettingsLayout><div>page</div></SettingsLayout>)
    expect(creditLink()).toBeTruthy()
  })
})
