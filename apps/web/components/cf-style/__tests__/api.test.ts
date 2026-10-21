import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'
import * as client from '../api'
import { template, templateWithSample } from './fixtures'
vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn() } }))
beforeEach(() => { vi.resetAllMocks(); vi.mocked(api.get).mockResolvedValue([]) })

/** Every path, method and body here is the one the API serves (apps/api/routers/cf_styles.py). */
describe('Style API contract', () => {
  const getCases: [string, () => Promise<unknown>, string][] = [
    ['brands', client.listBrands, '/cf/brands'], ['styles', () => client.listStyles('a b'), '/cf/styles?brand=a+b'],
    ['style detail', () => client.getStyle('s/1'), '/cf/styles/s%2F1'],
    ['interview', () => client.getInterview('i/1'), '/cf/style-interviews/i%2F1'],
    ['templates', () => client.listTemplates('a b'), '/cf/style-templates?brand=a+b'],
    ['template', () => client.getTemplate('x/y'), '/cf/style-templates/x%2Fy'],
    ['recommendations', () => client.listRecommendations('a b'), '/cf/style-recommendations?brand=a+b'],
  ]
  it.each(getCases)('GET %s', async (_name, run, path) => { await run(); expect(api.get).toHaveBeenCalledExactlyOnceWith(path) })
  it('returns the API body as it is, with no reshaping', async () => {
    const rows = [{ id: 's1' }]
    vi.mocked(api.get).mockResolvedValueOnce(rows)
    expect(await client.listStyles('studio')).toBe(rows)
  })
  it.each([template, templateWithSample])('preserves nullable template media addresses in list and detail responses ($sample_url)', async (row) => {
    vi.mocked(api.get).mockResolvedValueOnce([row]).mockResolvedValueOnce(row)
    expect(await client.listTemplates('studio')).toEqual([row])
    expect(await client.getTemplate(row.key)).toBe(row)
  })
  const cases: [string, () => Promise<unknown>, 'post' | 'patch' | 'put', string, unknown?][] = [
    ['create', () => client.createStyle({ brand: 'b', name: 'N', from_template: 't' }), 'post', '/cf/styles', { brand: 'b', name: 'N', from_template: 't' }],
    ['patch', () => client.patchStyle('s/1', { name: 'New', description: 'Look' }), 'patch', '/cf/styles/s%2F1', { name: 'New', description: 'Look' }],
    ['default', () => client.makeDefault('s1'), 'post', '/cf/styles/s1/default'],
    ['archive', () => client.archiveStyle('s1'), 'post', '/cf/styles/s1/archive'],
    ['improve', () => client.improveStyle('s1', 'Bigger'), 'post', '/cf/styles/s1/improve', { request: 'Bigger' }],
    ['approve', () => client.approveVersion('v1'), 'post', '/cf/style-versions/v1/approve'],
    ['reject', () => client.rejectVersion('v1', 'Too busy'), 'post', '/cf/style-versions/v1/reject', { note: 'Too busy' }],
    ['reject no note', () => client.rejectVersion('v1'), 'post', '/cf/style-versions/v1/reject', {}],
    ['restore', () => client.restoreVersion('v1'), 'post', '/cf/style-versions/v1/restore'],
    ['retry', () => client.retryVersion('v1'), 'post', '/cf/style-versions/v1/retry'],
    ['new interview', () => client.createInterview({ brand: 'b', mode: 'new' }), 'post', '/cf/style-interviews', { brand: 'b', mode: 'new' }],
    ['improve interview', () => client.createInterview({ brand: 'b', style_id: 's1', mode: 'improve' }), 'post', '/cf/style-interviews', { brand: 'b', style_id: 's1', mode: 'improve' }],
    ['save interview', () => client.patchInterview('i1', { answers: { brand: 'B' }, notes: { 'section:brand': null } }), 'patch', '/cf/style-interviews/i1', { answers: { answers: { brand: 'B' }, notes: { 'section:brand': null } } }],
    ['submit interview', () => client.submitInterview('i1'), 'post', '/cf/style-interviews/i1/submit'],
    ['dismiss', () => client.dismissRecommendation('r1'), 'post', '/cf/style-recommendations/r1/dismiss'],
    ['use', () => client.markRecommendationUsed('r1'), 'post', '/cf/style-recommendations/r1/use'],
    ['asset override', () => client.setAssetStyle('a/1', 's1'), 'put', '/cf/assets/a%2F1/style', { style_id: 's1' }],
    ['asset default', () => client.setAssetStyle('a1', null), 'put', '/cf/assets/a1/style', { style_id: null }],
  ]
  it.each(cases)('%s method, path and body', async (_name, run, method, path, body) => {
    await run(); expect(api[method]).toHaveBeenCalledExactlyOnceWith(...(body === undefined ? [path] : [path, body]))
  })
  it('invalidates only keys for this brand and its loaded records', () => {
    expect(client.isBrandStyleKey(client.stylesKey('a b'), 'a b')).toBe(true)
    expect(client.isBrandStyleKey(client.stylesKey('other'), 'a b')).toBe(false)
    expect(client.isBrandStyleKey(client.styleKey('s1'), 'a b', ['s1'])).toBe(true)
    expect(client.isBrandStyleKey(client.interviewKey('i1'), 'a b', [], 'i1')).toBe(true)
    expect(client.isBrandStyleKey('/cf/posts?brand=a+b', 'a b')).toBe(false)
  })
})
