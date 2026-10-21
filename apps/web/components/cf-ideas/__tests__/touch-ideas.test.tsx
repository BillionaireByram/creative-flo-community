import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { setCoarsePointer } from '@/test/setup'
import { IdeaCard } from '../idea-card'
import { makeIdea } from './fixtures'

afterEach(() => { cleanup(); setCoarsePointer(false) })

describe('touch ideas', () => {
  it.each([true, false])('opens once from a single click with coarse=%s', (coarse) => {
    setCoarsePointer(coarse)
    const idea = makeIdea({ title: 'A new idea' })
    const open = vi.fn(), move = vi.fn()
    render(<IdeaCard idea={idea} canEdit onOpen={open} onMove={move} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open A new idea' }))
    expect(open).toHaveBeenCalledExactlyOnceWith(idea)
    fireEvent.click(screen.getByRole('button', { name: 'Move A new idea to Scripting' }))
    expect(move).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledOnce()
  })
})
