import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ usePathname: () => '/ideas' }))

import { MobileTabBar } from '../mobile-tab-bar'

describe('MobileTabBar', () => {
  it('lists every main section and marks the current one', () => {
    render(<MobileTabBar />)
    for (const label of ['Ideas', 'Shoot', 'Style', 'Projects']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'Ideas' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Projects' })).not.toHaveAttribute('aria-current')
  })

  it('is hidden from desktop widths, where the rail takes over', () => {
    render(<MobileTabBar />)
    expect(screen.getByRole('navigation', { name: 'Main' })).toHaveClass('md:hidden')
  })
})
