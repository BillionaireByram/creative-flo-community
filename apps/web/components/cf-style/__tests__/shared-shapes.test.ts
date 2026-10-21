import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'
import { sectionFields, sections, sectionSamples, sectionNoteKey, type FieldSpec } from '../interview/sections'
import { emptyAnswers, setAnswer, setNote, toggleRating } from '../interview/logic'
import { useInterviewDraft } from '../interview/use-interview-draft'
import type { AnswerValue, Rating } from '../types'

vi.mock('@/lib/api', () => ({ api: { patch: vi.fn() } }))
const REPO = resolve(__dirname, '../../../../..')
const UPDATE = !!process.env.UPDATE_SHARED_SHAPES

function matches(path: string, actual: unknown) {
  if (UPDATE) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(actual, null, 2)}\n`) }
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(JSON.parse(JSON.stringify(actual)))
}

describe('shapes shared with the engine and the API tests', () => {
  /** The builder on the render server offers only these questions, options and samples as suggestions. */
  it('keeps engine/styles/interview-choices.json in step with the interview form', () => {
    const chosen = Object.fromEntries(sections.map((section) => [section.id, {
      fields: Object.fromEntries(sectionFields(section).filter((field) => !['logo', 'words', 'lengths'].includes(field.type)).map((field) => [field.key, {
        type: field.type, ...(field.options ? { options: field.options } : {}), ...(field.type === 'range' ? { max: field.max ?? 5 } : {}), ...(field.maxItems ? { max_items: field.maxItems } : {}),
      }])),
      samples: sectionSamples(section).map((sample) => sample.id),
    }]))
    matches(resolve(REPO, 'engine/styles/interview-choices.json'), { sections: chosen })
  })

  describe('the web autosave stream', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-06T12:00:00.000Z')); vi.mocked(api.patch).mockReset(); localStorage.clear() })
    afterEach(() => { cleanup(); vi.useRealTimers() })
    const sample = (field: FieldSpec, formats: string[]): AnswerValue => {
      const options = field.options ?? []
      switch (field.type) {
        case 'chips': return options.slice(0, 2) as string[]
        case 'single': return options[0]
        case 'bool': return true
        case 'range': return field.max ?? 5
        case 'color': return field.key === 'color1' ? '#112233' : '#ffffff'
        case 'words': return { is: ['bold', 'warm', 'clear'], never: ['loud', 'cheap', 'messy'] }
        case 'lengths': return Object.fromEntries(formats.map((format) => [format, '20-40s']))
        case 'logo': return '0b8f1e4c-7a55-4a3c-9f6e-2d5a7b1c9e30'
        case 'list': return field.links ? ['https://example.com/reel-one', 'https://example.com/reel-two'] : [`${field.label} one`, `${field.label} two`]
        default: return `Sample ${field.key}`
      }
    }
    it('writes every field, rating and note the way the API merges them (golden file for the API end to end test)', async () => {
      const sent: unknown[] = []
      vi.mocked(api.patch).mockImplementation(async (_path, body) => { sent.push(body) })
      const { result } = renderHook(() => useInterviewDraft('i1', { version: 'style-lab-v3', ratings: {}, notes: {}, answers: {} }))
      for (let index = 0; index < sections.length; index += 1) {
        const section = sections[index]
        act(() => result.current.update((current) => sectionFields(section).reduce((next, field) => setAnswer(next, field.key, sample(field, (next.answers.formats as string[] | undefined) ?? [])), current)))
        const ids = section.id === 'templates' ? ['tmpl-genius-cut', 'tmpl-fast-cut', 'tmpl-bold-captions'] : sectionSamples(section).slice(0, 3).map((item) => item.id)
        act(() => result.current.update((current) => ids.reduce((next, id, position) => toggleRating(next, id, (['love', 'maybe', 'no'] as Rating[])[position]), current)))
        if (ids[0]) act(() => result.current.update((current) => setNote(current, ids[0], `Note on ${ids[0]}`)))
        act(() => result.current.update((current) => setNote(current, sectionNoteKey(section.id), `About ${section.title}`)))
        act(() => result.current.setSection(index + 1))
        await act(async () => { await result.current.flush() })
      }
      act(() => result.current.update((current) => setAnswer(current, 'done', true)))
      await act(async () => { await result.current.flush() })
      expect(sent).toHaveLength(sections.length + 1)
      for (const section of sections) for (const field of sectionFields(section)) expect(result.current.answers.answers, field.key).toHaveProperty(field.key)
      expect(emptyAnswers().answers).toEqual({})
      matches(resolve(REPO, 'apps/api/tests/fixtures/style_studio_web_flow.json'), { patches: sent, final: result.current.answers })
    })
  })
})
