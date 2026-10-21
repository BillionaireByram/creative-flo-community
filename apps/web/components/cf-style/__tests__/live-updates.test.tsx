import { renderHook, act, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSSE } from '@/hooks/use-sse'
import { useStyleLive } from '../use-style'
import { brand } from './fixtures'
const { mutate } = vi.hoisted(() => ({ mutate: vi.fn().mockResolvedValue(undefined) }))
vi.mock('swr', () => ({ default: vi.fn(), useSWRConfig: () => ({ mutate }) }))
vi.mock('@/hooks/use-sse', () => ({ useSSE: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
describe('brand scoped style updates', () => {
  it('subscribes to the brand project and revalidates the loaded style and interview keys', () => {
    renderHook(() => useStyleLive(brand, ['s1'], 'i1'))
    const [project, options] = vi.mocked(useSSE).mock.calls[0]
    expect(project).toBe('project-1')
    act(() => options?.onCfStyleUpdated?.({ brand: 'studio', style_id: 's2' }))
    const predicate = mutate.mock.calls[0][0] as (key: unknown) => boolean
    for (const key of ['/cf/styles?brand=studio', '/cf/styles/s1', '/cf/styles/s2', '/cf/style-interviews/i1', '/cf/style-templates?brand=studio', '/cf/style-recommendations?brand=studio']) expect(predicate(key)).toBe(true)
    expect(predicate('/cf/styles?brand=other')).toBe(false)
    expect(mutate).toHaveBeenCalledWith('/cf/brands')
  })
  it('ignores another brand on the same event channel', () => {
    renderHook(() => useStyleLive(brand, ['s1']))
    act(() => vi.mocked(useSSE).mock.calls[0][1]?.onCfStyleUpdated?.({ brand: 'other', style_id: 's1' }))
    expect(mutate).not.toHaveBeenCalled()
  })
})
