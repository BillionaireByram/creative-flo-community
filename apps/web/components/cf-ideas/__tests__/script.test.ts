import { describe, expect, it } from 'vitest'
import { addBeat, BOARD_COLUMNS, groupByStatus, moveBeat, newBeatId, nextStatus, prevStatus, readSeconds, removeBeat, teleprompterText, updateBeat, wordCount } from '../script'
import type { IdeaScript, ScriptBeat } from '../types'
import { makeIdea } from './fixtures'

const beats: ScriptBeat[] = [
  { id: 'a', text: ' First thought ', broll: 'Hands' },
  { id: 'b', text: '\n\t', broll: null },
  { id: 'c', text: 'Last thought\n', broll: null },
]
const script: IdeaScript = { beats, cta: ' Follow along ' }

describe('teleprompterText', () => {
  it('joins stripped spoken parts, omitting blanks and B-roll', () => {
    expect(teleprompterText(' Hook\n', script)).toBe('Hook\n\nFirst thought\n\nLast thought\n\nFollow along')
    expect(teleprompterText(' \t', { beats, cta: ' ' })).toBe('First thought\n\nLast thought')
    expect(teleprompterText(null, null)).toBe('')
    expect(teleprompterText('', { beats: [], cta: '' })).toBe('')
  })
  it('preserves a nonblank full script verbatim', () => {
    expect(teleprompterText('Hook', script, '  My full script\n')).toBe('  My full script\n')
  })
  it('falls back when the full script contains only whitespace', () => {
    expect(teleprompterText('Hook', script, ' \n\t')).toBe(teleprompterText('Hook', script))
  })
})

describe('beat helpers', () => {
  it('moves up and down without changing the source array or beats', () => {
    const source = Object.freeze(beats.map((beat) => Object.freeze({ ...beat })))
    expect(moveBeat(source, 2, -1).map((beat) => beat.id)).toEqual(['a', 'c', 'b'])
    expect(moveBeat(source, 0, 1).map((beat) => beat.id)).toEqual(['b', 'a', 'c'])
    expect(source.map((beat) => beat.id)).toEqual(['a', 'b', 'c'])
  })
  it('leaves edge moves and invalid indices unchanged', () => {
    expect(moveBeat(beats, 0, -1)).toEqual(beats)
    expect(moveBeat(beats, 2, 1)).toEqual(beats)
    expect(moveBeat(beats, -1, 1)).toEqual(beats)
    expect(moveBeat(beats, 3, -1)).toEqual(beats)
    expect(moveBeat([], 0, 1)).toEqual([])
  })
  it('adds unique beat ids and removes or updates a beat immutably', () => {
    const added = addBeat(beats)
    expect(added).toHaveLength(4)
    expect(added[3]).toEqual({ id: expect.stringMatching(/^[0-9a-f]{12}$/), text: '', broll: null })
    expect(addBeat([], 'Opening')[0].text).toBe('Opening')
    expect(newBeatId()).not.toBe(newBeatId())
    expect(removeBeat(beats, 1)).toEqual([beats[0], beats[2]])
    expect(updateBeat(beats, 1, { text: 'New words', broll: 'Street' })[1]).toEqual({ id: 'b', text: 'New words', broll: 'Street' })
    expect(beats[1]).toEqual({ id: 'b', text: '\n\t', broll: null })
    expect(beats).toHaveLength(3)
    expect(removeBeat(beats, -1)).toEqual(beats)
    expect(updateBeat(beats, 9, { text: 'No change' })).toEqual(beats)
  })
})

describe('board and reading helpers', () => {
  it('groups by status and sorts by position then creation date, excluding archives', () => {
    const ideas = [
      makeIdea({ id: 'late', position: 1, created_at: '2026-02-01T00:00:00Z' }),
      makeIdea({ id: 'shot', status: 'shot' }),
      makeIdea({ id: 'first', position: 0 }),
      makeIdea({ id: 'archived', status: 'archived' }),
      makeIdea({ id: 'early', position: 1 }),
      makeIdea({ id: 'ready', status: 'ready' }),
      makeIdea({ id: 'scripting', status: 'scripting' }),
    ]
    const original = ideas.slice()
    const groups = groupByStatus(ideas)
    expect(groups.idea.map((idea) => idea.id)).toEqual(['first', 'early', 'late'])
    expect(groups.scripting.map((idea) => idea.id)).toEqual(['scripting'])
    expect(groups.ready.map((idea) => idea.id)).toEqual(['ready'])
    expect(groups.shot.map((idea) => idea.id)).toEqual(['shot'])
    expect(Object.keys(groups)).toEqual(['idea', 'scripting', 'ready', 'shot'])
    expect(ideas).toEqual(original)
    expect(groupByStatus([])).toEqual({ idea: [], scripting: [], ready: [], shot: [] })
  })
  it('moves through board statuses without skipping stages', () => {
    expect(BOARD_COLUMNS.map((column) => column.label)).toEqual(['Idea', 'Scripting', 'Ready to shoot', 'Shot'])
    expect(nextStatus('idea')).toBe('scripting')
    expect(nextStatus('scripting')).toBe('ready')
    expect(nextStatus('ready')).toBe('shot')
    expect(nextStatus('shot')).toBeNull()
    expect(prevStatus('idea')).toBeNull()
    expect(prevStatus('ready')).toBe('scripting')
    expect(prevStatus('archived')).toBe('shot')
  })
  it('counts words and estimates a 150 wpm read', () => {
    expect(wordCount(' \n\t')).toBe(0)
    expect(wordCount(' One\n\ntwo   three ')).toBe(3)
    expect(readSeconds('')).toBe(0)
    expect(readSeconds('Hello')).toBe(1)
    expect(readSeconds(Array(150).fill('word').join(' '))).toBe(60)
  })
})
