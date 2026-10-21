import { describe, expect, it } from 'vitest'
import { fieldByKey, sectionFields, sections, sectionSamples } from '../interview/sections'
import { samples } from '../interview/samples'
import { applyPatch, applyRecommendation, choicePatch, diffAnswers, emptyAnswers, fieldIssue, progress, restoredSection, setAnswer, setNote, setRating, summary, templateRecommendations, toggleRating } from '../interview/logic'
import { detailRefreshInterval, listRefreshInterval } from '../use-style'
import type { InterviewAnswers } from '../types'
import { recommendation, style, template } from './fixtures'

const answers = (patch: Partial<InterviewAnswers> = {}): InterviewAnswers => ({ ...emptyAnswers(), ...patch })

describe('interview schema and pure logic', () => {
  it('has all 13 sections in the agreed order, named with the contract section keys', () => {
    expect(sections.map((section) => section.title)).toEqual(['Your brand', 'Platforms and formats', 'Editing styles', 'Ten looks', 'Type', 'Captions', 'Hooks and structure', 'Transitions', 'Motion graphics and B-roll', 'Color grade', 'Music and sound', 'How much editing?', 'Anything else'])
    expect(sections.map((section) => section.id)).toEqual(['brand', 'platforms', 'templates', 'looks', 'type', 'captions', 'hooks', 'transitions', 'motion', 'grade', 'music', 'pace', 'other'])
    expect(new Set(samples.map((sample) => sample.id)).size).toBe(samples.length)
  })
  it('uses each question key once, because answers are one flat object', () => {
    const keys = sections.flatMap((section) => sectionFields(section).map((field) => field.key))
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of ['brand', 'handle', 'sell', 'price_range', 'audience', 'transformation', 'feel', 'action', 'cta_keyword', 'words', 'refs', 'avoid_refs', 'colorsMode', 'color1', 'color2', 'logo_asset_id', 'reference_videos', 'platforms', 'formats', 'lengths', 'frequency', 'oncam', 'hook_styles', 'hook_energy', 'chaptering', 'end_tag', 'motif', 'motifNote', 'cta', 'graphics_intensity', 'card_tiers', 'broll_sources', 'zoom_frequency', 'stickers', 'sound_text', 'music', 'music_energy', 'music_under', 'sound_design', 'sfx_density', 'pace', 'perfect_video', 'hate', 'style_name']) expect(fieldByKey(key), key).toBeDefined()
  })
  it('includes original samples, at least 12 type pairings and all caption treatments', () => {
    expect(sectionSamples(sections[3])).toHaveLength(10)
    expect(sectionSamples(sections[4]).length).toBeGreaterThanOrEqual(12)
    expect(sectionSamples(sections[5]).map((sample) => sample.id)).toEqual(expect.arrayContaining(['cap-pop', 'cap-kara', 'cap-color', 'cap-emoji', 'cap-none']))
    expect(sectionSamples(sections[4]).flatMap((sample) => sample.fonts)).toEqual(expect.arrayContaining(['Caveat', 'Nunito', 'Space Mono', 'Bebas Neue', 'Instrument Serif']))
  })
  it('counts answered sections by field, rated sample or note, never by progress', () => {
    expect(progress(answers()).percent).toBe(0)
    const result = progress(answers({ ratings: { 'look-noir': 'maybe', 'tmpl-genius-cut': 'love' }, notes: { 'section:type': 'Wide', 'cap-pop': '  ' }, answers: { brand: 'Studio', music_energy: 2, stickers: false }, progress: { section: 12, updated: '' } }))
    expect(result.bySection.filter((item) => item.answered).map((item) => item.id)).toEqual(['brand', 'templates', 'looks', 'type', 'motion', 'music'])
  })
  it('toggles exclusive ratings and keeps the note in its own place', () => {
    let state = setNote(answers(), 'look-noir', 'Keep the flare')
    state = toggleRating(state, 'look-noir', 'love'); expect(state.ratings['look-noir']).toBe('love')
    state = toggleRating(state, 'look-noir', 'no'); expect(state.ratings['look-noir']).toBe('no')
    state = toggleRating(state, 'look-noir', 'no'); expect(state.ratings).toEqual({}); expect(state.notes['look-noir']).toBe('Keep the flare')
  })
  it('treats blank answers as deleted and derives the builder colors list', () => {
    let state = setAnswer(answers(), 'handle', '   ')
    expect(state.answers).toEqual({})
    state = setAnswer(setAnswer(state, 'color1', '#112233'), 'color2', '#ffffff')
    expect(state.answers).toMatchObject({ colorsMode: 'Use these colors', colors: ['#112233', '#ffffff'] })
    expect(setAnswer(state, 'colorsMode', 'No brand colors yet').answers.colors).toBeUndefined()
    expect(setAnswer(state, 'stickers', false).answers.stickers).toBe(false)
  })
  it('diffs to changed keys with null for deletions, and applies a patch the way the server merges it', () => {
    const old = answers({ ratings: { a: 'love' }, notes: { 'section:brand': 'x' }, answers: { brand: 'Studio', words: { is: ['a'] } } })
    const next = setNote(setRating(setAnswer(old, 'brand', 'Studio 2'), 'a', null), 'section:brand', '')
    const patch = diffAnswers(old, next)
    expect(patch).toEqual({ answers: { brand: 'Studio 2' }, ratings: { a: null }, notes: { 'section:brand': null } })
    expect(applyPatch(old, patch)).toEqual(next)
    expect(diffAnswers(next, next)).toEqual({})
    expect(diffAnswers(answers(), answers({ progress: { section: 2, updated: 't' } }))).toEqual({ progress: { section: 2, updated: 't' } })
  })
  it('applies field and sample choices while preserving local notes', () => {
    const start = answers({ notes: { 'look-noir': 'Just the flare' }, answers: { music: ['House'] } })
    expect(applyRecommendation(start, recommendation({ kind: 'choice', payload: { section: 'music', choice: { field: 'music_energy', value: 2 } } })).answers).toEqual({ music: ['House'], music_energy: 2 })
    const rated = applyRecommendation(start, recommendation({ kind: 'choice', payload: { section: 'looks', choice: { sample_id: 'look-noir', rating: 'love', note: 'Suggested note' } } }))
    expect(rated.ratings['look-noir']).toBe('love'); expect(rated.notes['look-noir']).toBe('Just the flare')
    expect(choicePatch('brand', { field: '__proto__', value: 'bad' })).toBeNull()
    expect(choicePatch('music', { field: 'music_energy', value: 9 })).toBeNull()
    expect(choicePatch('pace', { field: 'pace', value: 9 })).toEqual({ answers: { pace: 9 } })
    expect(choicePatch('music', { field: 'music', value: ['Not an option'] })).toBeNull()
    expect(choicePatch('music', { field: 'pace', value: 3 })).toBeNull()
    expect(choicePatch('looks', { sample_id: 'type-archivo', rating: 'love' })).toBeNull()
    expect(choicePatch('templates', { sample_id: 'tmpl-genius-cut', rating: 'maybe' })).toEqual({ ratings: { 'tmpl-genius-cut': 'maybe' } })
    expect(applyRecommendation(start, recommendation({ kind: 'choice', payload: { section: 'unknown', choice: { field: 'x', value: 'x' } } }))).toBe(start)
  })
  it('derives choices from the loved style using its real style settings', () => {
    const loved = answers({ ratings: { 'tmpl-cinema': 'love' } })
    expect(templateRecommendations(loved, [template], 'type')[0].payload.choice).toEqual({ sample_id: 'type-archivo', rating: 'love' })
    expect(templateRecommendations(loved, [template], 'music')[0].payload.choice).toEqual({ field: 'music', value: ['Minimal lo-fi'] })
    expect(templateRecommendations(loved, [template], 'brand').map((item) => item.payload.choice)).toEqual([{ field: 'color1', value: '#d9b26a' }, { field: 'color2', value: '#ffffff' }])
    expect(templateRecommendations(loved, [template], 'pace').map((item) => item.payload.choice)).toEqual([{ sample_id: 'density-balanced', rating: 'love' }, { field: 'pace', value: 7 }])
    expect(templateRecommendations(answers(), [template], 'type')).toEqual([])
  })
  it('summarizes picks with readable labels, notes, and unfilled required fields', () => {
    const result = summary(answers({ ratings: { 'look-noir': 'love', 'tmpl-cinema': 'no' }, notes: { 'look-noir': 'Keep the flare', 'section:looks': 'Calm' }, answers: { brand: 'Studio', stickers: true, words: { is: ['a', 'b', 'c'], never: ['x'] } } }), [template])
    expect(result).toHaveLength(13); expect(result[0].missing).toContain('What do you sell, and to who? is still open.')
    expect(result[0].fields).toContainEqual({ label: 'Three words your brand IS, and three it is NEVER', value: 'IS: a, b, c · NEVER: x' })
    expect(result[0].missing).toContain('Add 3 words for each list, or leave it empty.')
    expect(result[2].ratings[0]).toMatchObject({ label: 'Cinematic Story', rating: 'no' })
    expect(result[3].ratings[0]).toMatchObject({ label: 'Neo-noir anamorphic', note: 'Keep the flare' }); expect(result[3].note).toBe('Calm')
  })
  it('validates links, counts and colors, and bounds the saved position', () => {
    const links = fieldByKey('reference_videos')!
    expect(fieldIssue(links, ['javascript:alert(1)'])).toContain('full link')
    expect(fieldIssue(links, ['https://example.com/video'])).toBeNull()
    expect(fieldIssue(links, ['https://a.com', 'https://b.com', 'https://c.com', 'https://d.com'])).toContain('up to 3')
    expect(fieldIssue(fieldByKey('color1')!, 'red')).toContain('hex color')
    expect(restoredSection(answers({ progress: { section: 99, updated: '' } }))).toBe(13)
    expect(restoredSection(answers())).toBe(0)
  })
  it('polls every 4 seconds only while a build is running', () => {
    expect(detailRefreshInterval(style())).toBe(0)
    expect(listRefreshInterval([style({ building_count: 1 })])).toBe(4000)
    expect(detailRefreshInterval(style({ building_count: 1 }))).toBe(4000)
  })
})
