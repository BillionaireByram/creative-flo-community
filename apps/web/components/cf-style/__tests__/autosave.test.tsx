import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'
import { draftStorageKey, useInterviewDraft } from '../interview/use-interview-draft'
import { setAnswer, setNote, setRating } from '../interview/logic'
import type { InterviewAnswers } from '../types'
vi.mock('@/lib/api', () => ({ api: { patch: vi.fn() } }))
beforeEach(() => { vi.useFakeTimers(); vi.mocked(api.patch).mockReset(); localStorage.clear() })
afterEach(() => { cleanup(); vi.useRealTimers() })
const server = (answers: InterviewAnswers['answers'] = {}, extra: Partial<InterviewAnswers> = {}): InterviewAnswers => ({ version: 'style-lab-v3', ratings: {}, notes: {}, ...extra, answers })

describe('interview save queue', () => {
  it('debounces, merges edits locally and sends only the keys that changed', async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined)
    const { result } = renderHook(() => useInterviewDraft('i1', server({ brand: 'B', sell: 'Original', music_energy: 2 })))
    act(() => result.current.update((a) => setAnswer(a, 'brand', 'New')))
    act(() => result.current.update((a) => setAnswer(a, 'sell', 'Coaching')))
    await act(async () => { await vi.advanceTimersByTimeAsync(699) }); expect(api.patch).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(api.patch).toHaveBeenCalledExactlyOnceWith('/cf/style-interviews/i1', { answers: { answers: { brand: 'New', sell: 'Coaching' } } })
    expect(result.current.answers.answers.music_energy).toBe(2); expect(result.current.status).toBe('saved')
  })
  it('deletes a cleared answer, rating and note with null', async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined)
    const { result } = renderHook(() => useInterviewDraft('i1', server({ handle: 'old' }, { ratings: { 'look-noir': 'love' }, notes: { 'look-noir': 'flare' } })))
    act(() => result.current.update((a) => setNote(setRating(setAnswer(a, 'handle', '  '), 'look-noir', null), 'look-noir', '')))
    await act(async () => { await vi.advanceTimersByTimeAsync(700) })
    expect(api.patch).toHaveBeenCalledExactlyOnceWith('/cf/style-interviews/i1', { answers: { answers: { handle: null }, ratings: { 'look-noir': null }, notes: { 'look-noir': null } } })
  })
  it('flushes through edits typed during a request without losing any', async () => {
    let resolve!: (value: undefined) => void
    vi.mocked(api.patch).mockImplementationOnce(() => new Promise<undefined>((finish) => { resolve = finish })).mockResolvedValue(undefined)
    const { result } = renderHook(() => useInterviewDraft('i1', server()))
    act(() => result.current.update((a) => setAnswer(a, 'brand', 'First')))
    let flush!: Promise<boolean>
    act(() => { flush = result.current.flush() })
    act(() => result.current.update((a) => setAnswer(a, 'brand', 'Latest')))
    act(() => result.current.update((a) => setAnswer(a, 'music_energy', 5)))
    await act(async () => { resolve(undefined); expect(await flush).toBe(true) })
    expect(api.patch).toHaveBeenCalledTimes(2)
    expect(api.patch).toHaveBeenLastCalledWith('/cf/style-interviews/i1', { answers: { answers: { brand: 'Latest', music_energy: 5 } } })
  })
  it('retries with backoff and preserves newer edits after failure', async () => {
    vi.mocked(api.patch).mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(undefined)
    const { result } = renderHook(() => useInterviewDraft('i1', server()))
    act(() => result.current.update((a) => setAnswer(a, 'brand', 'Keep me')))
    await act(async () => { expect(await result.current.flush()).toBe(false) })
    expect(result.current.status).toBe('error'); expect(result.current.answers.answers.brand).toBe('Keep me')
    await act(async () => { await vi.advanceTimersByTimeAsync(999) }); expect(api.patch).toHaveBeenCalledTimes(1)
    act(() => result.current.update((a) => setAnswer(a, 'music_energy', 1)))
    await act(async () => { await vi.advanceTimersByTimeAsync(700) })
    expect(api.patch).toHaveBeenLastCalledWith('/cf/style-interviews/i1', { answers: { answers: { brand: 'Keep me', music_energy: 1 } } })
    expect(result.current.status).toBe('saved')
  })
  it('flushes on pagehide and unmount and records where the person stopped', async () => {
    vi.mocked(api.patch).mockResolvedValue(undefined)
    const { result, unmount } = renderHook(() => useInterviewDraft('i1', server()))
    act(() => result.current.setSection(4))
    await act(async () => { window.dispatchEvent(new Event('pagehide')) })
    expect(api.patch).toHaveBeenCalledWith('/cf/style-interviews/i1', { answers: { progress: { section: 4, updated: expect.any(String) } } })
    act(() => result.current.update((a) => setNote(a, 'section:type', 'Bold')))
    await act(async () => { unmount() })
    expect(api.patch).toHaveBeenLastCalledWith('/cf/style-interviews/i1', { answers: { notes: { 'section:type': 'Bold' } } })
  })
  it('recovers unsaved edits while keeping fresh server answers', () => {
    localStorage.setItem(draftStorageKey('i1'), JSON.stringify({ pending: { answers: { brand: 'Unsaved' }, ratings: { 'look-noir': null } } }))
    const { result } = renderHook(() => useInterviewDraft('i1', server({ brand: 'Old', handle: 'from-another-device' }, { ratings: { 'look-noir': 'love', 'look-hud': 'maybe' } })))
    expect(result.current.answers.answers).toEqual({ brand: 'Unsaved', handle: 'from-another-device' })
    expect(result.current.answers.ratings).toEqual({ 'look-hud': 'maybe' })
  })
  it('merges remote refreshes without erasing dirty local answers', () => {
    const { result, rerender } = renderHook(({ initial }) => useInterviewDraft('i1', initial), { initialProps: { initial: server({ brand: 'Old', handle: 'Old' }) } })
    act(() => result.current.update((a) => setAnswer(a, 'brand', 'Local')))
    rerender({ initial: server({ brand: 'Remote', handle: 'Remote' }) })
    expect(result.current.answers.answers).toEqual({ brand: 'Local', handle: 'Remote' })
  })
  it('does not write read-only interviews', async () => {
    const { result } = renderHook(() => useInterviewDraft('i1', server(), false))
    act(() => result.current.update((a) => setAnswer(a, 'brand', 'Denied')))
    await act(async () => { expect(await result.current.flush()).toBe(true) })
    expect(api.patch).not.toHaveBeenCalled()
  })
  it('does not overwrite edits with normalized responses or stale server snapshots', async () => {
    vi.mocked(api.patch).mockResolvedValue({ answers: { answers: { brand: 'Older' } } })
    const { result } = renderHook(() => useInterviewDraft('i1', server()))
    act(() => result.current.update((a) => setAnswer(a, 'brand', 'Mine')))
    await act(async () => { await result.current.flush() })
    expect(result.current.answers.answers.brand).toBe('Mine')
  })
})
