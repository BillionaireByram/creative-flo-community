import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { IdeasBoard } from '../board'
import { makeIdea } from './fixtures'

const ideas = [
  makeIdea({ id: 'idea', title: 'An idea' }),
  makeIdea({ id: 'scripting', title: 'Writing now', status: 'scripting' }),
  makeIdea({ id: 'ready', title: 'Camera ready', status: 'ready' }),
  makeIdea({ id: 'shot', title: 'Already filmed', status: 'shot' }),
  makeIdea({ id: 'archived', title: 'Old idea', status: 'archived' }),
]

afterEach(cleanup)

describe('IdeasBoard', () => {
  it('places each card in its column and excludes archived ideas', () => {
    render(<IdeasBoard ideas={ideas} canEdit onOpen={vi.fn()} onMove={vi.fn()} />)
    for (const [label, title] of [['Idea', 'An idea'], ['Scripting', 'Writing now'], ['Ready to shoot', 'Camera ready'], ['Shot', 'Already filmed']]) {
      expect(within(screen.getByRole('region', { name: label })).getByRole('button', { name: `Open ${title}` })).toBeInTheDocument()
    }
    expect(screen.queryByText('Old idea')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Shoot this' })).toHaveAttribute('href', '/shoot?idea=ready')
  })

  it('switches the active phone column with a four-button segmented control', () => {
    render(<IdeasBoard ideas={ideas} canEdit={false} onOpen={vi.fn()} />)
    const controls = within(screen.getByRole('group', { name: 'Idea columns' }))
    expect(controls.getAllByRole('button')).toHaveLength(4)
    expect(controls.getByRole('button', { name: 'Idea 1' })).toHaveAttribute('aria-pressed', 'true')
    const ready = controls.getByRole('button', { name: 'Ready to shoot 1' })
    fireEvent.click(ready)
    expect(ready).toHaveAttribute('aria-pressed', 'true')
    expect(controls.getByRole('button', { name: 'Idea 1' })).toHaveAttribute('aria-pressed', 'false')
    // jsdom does not evaluate Tailwind media queries. Verify the actual responsive
    // classes and active state that control which column is shown on a phone.
    expect(screen.getByRole('region', { name: 'Ready to shoot' })).toHaveAttribute('data-active', 'true')
    expect(screen.getByRole('region', { name: 'Ready to shoot' })).not.toHaveClass('hidden')
    expect(screen.getByRole('region', { name: 'Idea' })).toHaveClass('hidden', 'md:block')
    fireEvent.click(controls.getByRole('button', { name: 'Shot 1' }))
    expect(screen.getByRole('region', { name: 'Shot' })).not.toHaveClass('hidden')
    expect(screen.getByRole('region', { name: 'Ready to shoot' })).toHaveClass('hidden', 'md:block')
  })

  it('opens cards and moves forward without opening the editor', () => {
    const onOpen = vi.fn()
    const onMove = vi.fn()
    render(<IdeasBoard ideas={ideas} canEdit onOpen={onOpen} onMove={onMove} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open An idea' }))
    expect(onOpen).toHaveBeenCalledWith(ideas[0])
    fireEvent.click(screen.getByRole('button', { name: 'Move An idea to Scripting' }))
    expect(onMove).toHaveBeenCalledWith(ideas[0], 'scripting')
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('hides write controls for readers and disables moves while saving', () => {
    const { rerender } = render(<IdeasBoard ideas={ideas} canEdit={false} onOpen={vi.fn()} onMove={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /^Move / })).not.toBeInTheDocument()
    rerender(<IdeasBoard ideas={ideas} canEdit onOpen={vi.fn()} onMove={vi.fn()} busyIds={new Set(['idea'])} />)
    expect(screen.getByRole('button', { name: 'Move An idea to Scripting' })).toBeDisabled()
  })
})
