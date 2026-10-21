import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { setCoarsePointer } from '@/test/setup'
import { Button } from '../button'
import { Input } from '../input'
import { Switch } from '../switch'
import { ConfirmDialog } from '../confirm-dialog'

afterEach(() => { cleanup(); setCoarsePointer(false) })

describe('touch primitives', () => {
  it.each(['sm', 'md'] as const)('grows %s buttons only for a coarse pointer', (size) => {
    setCoarsePointer(true)
    render(<Button size={size}>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('[@media(pointer:coarse)]:min-h-11', '[@media(pointer:coarse)]:min-w-11')
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass(size === 'sm' ? 'h-8' : 'h-9')
  })
  it('keeps password visibility tappable and labelled', () => {
    render(<Input type="password" label="Password" defaultValue="example" />)
    const button = screen.getByRole('button', { name: 'Show password' })
    expect(button).toHaveClass('absolute', 'tap-target')
    fireEvent.click(button)
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument()
  })
  it('gives a switch a positioned touch hit area', () => {
    render(<Switch aria-label="Email notifications" />)
    expect(screen.getByRole('switch')).toHaveClass('relative', 'tap-target')
  })
  it('bounds a confirmation to the viewport and lets a tap cancel it', () => {
    setCoarsePointer(true)
    const change = vi.fn()
    render(<ConfirmDialog open onOpenChange={change} title="Discard this take?" description="This cannot be undone." onConfirm={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveClass('w-[calc(100vw-2rem)]', 'max-h-[calc(100dvh-2rem)]', 'overflow-y-auto')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(change).toHaveBeenCalledWith(false)
  })
})
