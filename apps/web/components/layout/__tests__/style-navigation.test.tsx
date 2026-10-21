import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isNavActive } from '../nav-items'
import { MobileTabBar } from '../mobile-tab-bar'
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/style/interview/i1' }))
afterEach(cleanup)
describe('Style navigation', () => {
  it.each(['/style', '/studio/style', '/studio/style/templates', '/studio/style/s1', '/studio/style/interview/i1'])('highlights Style for %s', (path) => {
    expect(isNavActive(path, '/style')).toBe(true)
  })
  it.each(['/studio/styleish', '/projects/style/assets/123', '/styles'])('does not highlight Style for %s', (path) => {
    expect(isNavActive(path, '/style')).toBe(false)
  })
  it('uses the shared active state in the mobile tab bar', () => {
    render(<MobileTabBar />)
    expect(screen.getByRole('link', { name: 'Style' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Style' })).toHaveAttribute('href', '/style')
  })
})
