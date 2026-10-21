import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'
import { useIdeaDraft } from '../use-idea-draft'
import type { Idea } from '../types'
import { makeIdea as idea } from './fixtures'

vi.mock('@/lib/api', () => ({ api: { patch: vi.fn() } }))

describe('idea autosave', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.mocked(api.patch).mockReset() })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('debounces and sends only changed fields', async () => {
    vi.mocked(api.patch).mockResolvedValue(idea({ hook: 'A hook', notes: 'Notes' }))
    const onSaved = vi.fn()
    const { result } = renderHook(() => useIdeaDraft(idea(), true, onSaved))
    act(() => result.current.update({ hook: 'A hook' }))
    act(() => result.current.update({ notes: 'Notes' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(699) })
    expect(api.patch).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(api.patch).toHaveBeenCalledExactlyOnceWith('/cf/ideas/idea-1', { hook: 'A hook', notes: 'Notes' })
    expect(result.current.saveState).toBe('saved')
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('flushes immediately on close and preserves edits during an in-flight save', async () => {
    let finish!: (value: Idea) => void
    vi.mocked(api.patch).mockImplementationOnce(() => new Promise<Idea>((resolve) => { finish = resolve }))
      .mockResolvedValueOnce(idea({ hook: 'Latest' }))
    const { result } = renderHook(() => useIdeaDraft(idea(), true, vi.fn()))
    act(() => result.current.update({ hook: 'First' }))
    let saving!: Promise<boolean>
    act(() => { saving = result.current.flush() })
    expect(api.patch).toHaveBeenCalledTimes(1)
    act(() => result.current.update({ hook: 'Latest' }))
    await act(async () => { finish(idea({ hook: 'First' })); expect(await saving).toBe(true) })
    expect(api.patch).toHaveBeenLastCalledWith('/cf/ideas/idea-1', { hook: 'Latest' })
    expect(result.current.draft.hook).toBe('Latest')
    expect(result.current.saveState).toBe('saved')
  })

  it('retains failed edits and retries the same changes', async () => {
    vi.mocked(api.patch).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(idea({ notes: 'Keep me' }))
    const { result } = renderHook(() => useIdeaDraft(idea(), true, vi.fn()))
    act(() => result.current.update({ notes: 'Keep me' }))
    await act(async () => { expect(await result.current.flush()).toBe(false) })
    expect(result.current.draft.notes).toBe('Keep me')
    expect(result.current.error).toBe('Offline')
    await act(async () => { expect(await result.current.flush()).toBe(true) })
    expect(api.patch).toHaveBeenLastCalledWith('/cf/ideas/idea-1', { notes: 'Keep me' })
    expect(result.current.saveState).toBe('saved')
  })

  it('does not write for read-only users', async () => {
    const { result } = renderHook(() => useIdeaDraft(idea(), false, vi.fn()))
    act(() => result.current.update({ notes: 'Denied' }))
    await act(async () => { expect(await result.current.flush()).toBe(true) })
    expect(api.patch).not.toHaveBeenCalled()
    expect(result.current.draft.notes).toBeNull()
  })

  it('does not send a write when typing is reverted before the debounce', async () => {
    const { result } = renderHook(() => useIdeaDraft(idea(), true, vi.fn()))
    act(() => result.current.update({ notes: 'Temporary' }))
    act(() => result.current.update({ notes: null }))
    await act(async () => { await vi.advanceTimersByTimeAsync(700) })
    expect(api.patch).not.toHaveBeenCalled()
    expect(result.current.saveState).toBe('saved')
  })

  it('keeps an invalid title locally and refuses to flush it', async () => {
    const { result } = renderHook(() => useIdeaDraft(idea(), true, vi.fn()))
    act(() => result.current.update({ title: '  ' }))
    await act(async () => { expect(await result.current.flush()).toBe(false) })
    expect(result.current.draft.title).toBe('  ')
    expect(result.current.saveState).toBe('error')
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('applies server normalization without losing another edited field', async () => {
    let finish!: (value: Idea) => void
    vi.mocked(api.patch).mockImplementationOnce(() => new Promise<Idea>((resolve) => { finish = resolve }))
      .mockResolvedValueOnce(idea({ title: 'Trimmed', notes: 'New note' }))
    const { result } = renderHook(() => useIdeaDraft(idea(), true, vi.fn()))
    act(() => result.current.update({ title: '  Trimmed  ' }))
    let saving!: Promise<boolean>
    act(() => { saving = result.current.flush() })
    act(() => result.current.update({ notes: 'New note' }))
    await act(async () => { finish(idea({ title: 'Trimmed' })); expect(await saving).toBe(true) })
    expect(api.patch).toHaveBeenLastCalledWith('/cf/ideas/idea-1', { notes: 'New note' })
    expect(result.current.draft.title).toBe('Trimmed')
    expect(result.current.draft.notes).toBe('New note')
  })
})
