import type { AnswersPatch, AnswerValue, InterviewAnswers, Rating, Recommendation, StyleTemplate } from '../types'
import { samples } from './samples'
import { fieldByKey, isSectionId, sectionFields, sectionNoteKey, sections, sectionSamples, TEMPLATE_SAMPLE_PREFIX, templateSampleId, type FieldSpec, type Section, type SectionId } from './sections'

export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const RATINGS: readonly string[] = ['love', 'maybe', 'no']
const HEX = /^#[0-9a-f]{6}$/i
export const emptyAnswers = (): InterviewAnswers => ({ ratings: {}, notes: {}, answers: {} })
export function normalize(raw?: Partial<InterviewAnswers> | null): InterviewAnswers {
  return { ...raw, ratings: { ...raw?.ratings }, notes: { ...raw?.notes }, answers: { ...raw?.answers } }
}

/** An answer with nothing in it is the same as no answer: it is deleted, never saved as blank text. */
export function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return !value.trim()
  if (Array.isArray(value)) return value.every(isEmpty)
  if (typeof value === 'object') return Object.values(value).every(isEmpty)
  return false
}

/** Applies a save the same way the server does: each key is replaced, and null deletes it. */
export function applyPatch(base: InterviewAnswers, patch: AnswersPatch): InterviewAnswers {
  const result = normalize(base)
  for (const group of ['ratings', 'notes', 'answers'] as const) {
    const changes = patch[group] as Record<string, unknown> | undefined
    if (!changes) continue
    const target = result[group] as Record<string, unknown>
    for (const [key, value] of Object.entries(changes)) { if (value === null) delete target[key]; else target[key] = value }
  }
  if ('progress' in patch) { if (patch.progress) result.progress = patch.progress; else delete result.progress }
  return result
}
/** Only the keys that changed, so a save never overwrites something typed on another device. */
export function diffAnswers(saved: InterviewAnswers, next: InterviewAnswers): AnswersPatch {
  const patch: AnswersPatch = {}
  for (const group of ['ratings', 'notes', 'answers'] as const) {
    const before = (saved[group] ?? {}) as Record<string, unknown>
    const after = (next[group] ?? {}) as Record<string, unknown>
    const changes: Record<string, unknown> = {}
    for (const key of Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))) {
      if (!same(before[key], after[key])) changes[key] = after[key] === undefined ? null : after[key]
    }
    if (Object.keys(changes).length) (patch as Record<string, unknown>)[group] = changes
  }
  if (!same(saved.progress, next.progress)) patch.progress = next.progress ?? null
  return patch
}
export const hasPatch = (patch: AnswersPatch) => Object.keys(patch).length > 0

function withColors(answers: InterviewAnswers): InterviewAnswers {
  const values = answers.answers
  const next = { ...values }
  const colors = ['color1', 'color2'].map((key) => values[key]).filter((color): color is string => typeof color === 'string' && HEX.test(color))
  if (colors.length && !next.colorsMode) next.colorsMode = 'Use these colors'
  // The builder reads "colors" when the person chose to use their own.
  if (next.colorsMode === 'Use these colors' && colors.length) next.colors = colors
  else delete next.colors
  return { ...answers, answers: next }
}
export function setAnswer(answers: InterviewAnswers, key: string, value: AnswerValue | null | undefined): InterviewAnswers {
  const next = normalize(answers)
  if (isEmpty(value)) delete next.answers[key]
  else next.answers[key] = value as AnswerValue
  return key === 'color1' || key === 'color2' || key === 'colorsMode' ? withColors(next) : next
}
export function setRating(answers: InterviewAnswers, id: string, rating: Rating | null): InterviewAnswers {
  const next = normalize(answers)
  if (rating) next.ratings[id] = rating
  else delete next.ratings[id]
  return next
}
/** Tapping the rating a sample already has clears it. A note is kept either way. */
export const toggleRating = (answers: InterviewAnswers, id: string, rating: Rating) => setRating(answers, id, answers.ratings[id] === rating ? null : rating)
export function setNote(answers: InterviewAnswers, id: string, text: string): InterviewAnswers {
  const next = normalize(answers)
  if (text.trim()) next.notes[id] = text
  else delete next.notes[id]
  return next
}

export function sectionAnswered(section: Section, answers: InterviewAnswers): boolean {
  const prefix = section.samplePrefix
  const rated = !!prefix && [...Object.keys(answers.ratings), ...Object.entries(answers.notes).filter(([, text]) => text.trim()).map(([id]) => id)].some((id) => id.startsWith(prefix))
  return rated || sectionFields(section).some((field) => !isEmpty(answers.answers[field.key])) || !!answers.notes[sectionNoteKey(section.id)]?.trim()
}
export function progress(answers: InterviewAnswers) {
  const bySection = sections.map((section) => ({ id: section.id, answered: sectionAnswered(section, answers) }))
  const answered = bySection.filter((item) => item.answered).length
  return { bySection, answered, total: sections.length, percent: Math.round(answered / sections.length * 100) }
}
export function validUrl(value: string): boolean {
  try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false }
}
export const toLines = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
export function fieldIssue(field: FieldSpec, value: unknown): string | null {
  if (field.required && isEmpty(value)) return `${field.label} is still open.`
  if (field.type === 'list') {
    const lines = toLines(value)
    if (field.links && lines.some((line) => !validUrl(line))) return 'Use a full link starting with https:// or http://.'
    if (field.maxItems && lines.length > field.maxItems) return `Choose up to ${field.maxItems}.`
  }
  if (field.type === 'words' && value && typeof value === 'object') {
    const groups = Object.values(value as Record<string, unknown>).map(toLines).filter((words) => words.length)
    if (groups.some((words) => words.length !== 3)) return 'Add 3 words for each list, or leave it empty.'
  }
  if (field.type === 'color' && typeof value === 'string' && value && !HEX.test(value)) return 'Use a six-digit hex color, such as #d9b26a.'
  return null
}
export function displayValue(field: FieldSpec | undefined, value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string') return field?.labels?.[value] ?? value
  if (Array.isArray(value)) return value.map((item) => displayValue(field, item)).join(', ')
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (field?.type === 'words') return `IS: ${toLines(record.is).join(', ') || 'none'} · NEVER: ${toLines(record.never).join(', ') || 'none'}`
    return Object.entries(record).filter(([, item]) => !isEmpty(item)).map(([key, item]) => `${key}: ${String(item)}`).join(' · ')
  }
  return String(value)
}

export function sampleTitle(id: string, templates: StyleTemplate[] = []): string {
  if (id.startsWith(TEMPLATE_SAMPLE_PREFIX)) return templates.find((template) => templateSampleId(template.key) === id)?.name ?? id.slice(TEMPLATE_SAMPLE_PREFIX.length)
  return samples.find((sample) => sample.id === id)?.title ?? id
}
export function summary(answers: InterviewAnswers, templates: StyleTemplate[] = []) {
  return sections.map((section) => {
    const prefix = section.samplePrefix
    const ids = prefix ? Array.from(new Set([...Object.keys(answers.ratings), ...Object.keys(answers.notes)])).filter((id) => id.startsWith(prefix)) : []
    const ratings = ids.map((id) => ({ id, label: sampleTitle(id, templates), rating: answers.ratings[id] ?? null, note: answers.notes[id] ?? '' }))
    const fields = sectionFields(section).filter((field) => !isEmpty(answers.answers[field.key])).map((field) => ({ label: field.label, value: displayValue(field, answers.answers[field.key]) }))
    const missing = sectionFields(section).map((field) => fieldIssue(field, answers.answers[field.key])).filter((issue): issue is string => !!issue)
    return { id: section.id, title: section.title, ratings, fields, missing, note: answers.notes[sectionNoteKey(section.id)] ?? '' }
  })
}
export function restoredSection(answers: InterviewAnswers): number {
  const index = answers.progress?.section
  return typeof index === 'number' && Number.isFinite(index) ? Math.max(0, Math.min(sections.length, Math.floor(index))) : 0
}

function validFieldValue(field: FieldSpec, value: unknown): value is AnswerValue {
  switch (field.type) {
    case 'range': return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= (field.max ?? 5)
    case 'chips': return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && !!field.options?.includes(item))
    case 'single': return typeof value === 'string' && !!field.options?.includes(value)
    case 'bool': return typeof value === 'boolean'
    case 'color': return typeof value === 'string' && HEX.test(value)
    case 'list': return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string') && (!field.maxItems || value.length <= field.maxItems)
    case 'text': case 'textarea': return typeof value === 'string' && !!value.trim() && value.length <= 4000
    default: return false
  }
}
/** The save a Flo recommendation would make, or null when it does not fit this section or this form. */
export function choicePatch(sectionId: string, choice: unknown): AnswersPatch | null {
  if (!isSectionId(sectionId) || !choice || typeof choice !== 'object' || Array.isArray(choice)) return null
  const section = sections.find((item) => item.id === sectionId)!
  const record = choice as Record<string, unknown>
  if (typeof record.sample_id === 'string') {
    if (!RATINGS.includes(String(record.rating))) return null
    const known = sectionId === 'templates' ? record.sample_id.startsWith(TEMPLATE_SAMPLE_PREFIX) : sectionSamples(section).some((sample) => sample.id === record.sample_id)
    if (!known) return null
    return { ratings: { [record.sample_id]: record.rating as Rating }, ...(typeof record.note === 'string' && record.note.trim() ? { notes: { [record.sample_id]: record.note } } : {}) }
  }
  if (typeof record.field !== 'string') return null
  const field = sectionFields(section).find((item) => item.key === record.field)
  return field && validFieldValue(field, record.value) ? { answers: { [field.key]: record.value } } : null
}
export function applyRecommendation(answers: InterviewAnswers, recommendation: Pick<Recommendation, 'kind' | 'payload'>): InterviewAnswers {
  const section = recommendation.payload.section
  if (recommendation.kind !== 'choice' || !section) return answers
  const patch = choicePatch(section, recommendation.payload.choice)
  if (!patch) return answers
  let next = answers
  for (const [id, rating] of Object.entries(patch.ratings ?? {})) next = setRating(next, id, rating as Rating)
  // A note the person already wrote outranks a suggested one.
  for (const [id, text] of Object.entries(patch.notes ?? {})) if (!next.notes[id]?.trim()) next = setNote(next, id, text ?? '')
  for (const [key, value] of Object.entries(patch.answers ?? {})) next = setAnswer(next, key, value)
  return next
}

/** Choices taken from the style the person loved, shown when Flo has no saved suggestions yet. */
export function templateRecommendations(answers: InterviewAnswers, templates: StyleTemplate[], section: SectionId): Recommendation[] {
  const loved = Object.keys(answers.ratings).filter((id) => id.startsWith(TEMPLATE_SAMPLE_PREFIX) && answers.ratings[id] === 'love').sort()[0]
  const template = templates.find((item) => templateSampleId(item.key) === loved)
  if (!template) return []
  const style = template.style_json as Record<string, unknown>
  const text = (key: string) => typeof style[key] === 'string' ? style[key] : undefined
  const choices: unknown[] = []
  const sample = (id?: string) => { if (id) choices.push({ sample_id: id, rating: 'love' }) }
  if (section === 'brand') { for (const [field, key] of [['color1', 'accent'], ['color2', 'highlight']] as const) { const color = text(key); if (color) choices.push({ field, value: color }) } }
  if (section === 'looks') sample(text('look'))
  if (section === 'type') sample(text('type'))
  if (section === 'captions') sample(text('caption'))
  if (section === 'transitions') sample(text('transition_id'))
  if (section === 'grade') sample(text('grade'))
  if (section === 'music' && Array.isArray(style.music)) choices.push({ field: 'music', value: style.music })
  if (section === 'pace') { sample(text('density')); if (typeof style.pace === 'number') choices.push({ field: 'pace', value: style.pace }) }
  return choices.filter((choice) => choicePatch(section, choice)).map((choice, index) => ({
    id: `local:${template.key}:${section}:${index}`, brand: '', interview_id: null, kind: 'choice' as const, status: 'open' as const,
    payload: { section, choice: choice as never }, reason: `From ${template.name}, a style you love.`,
  }))
}
export function choiceLabel(choice: unknown): string {
  if (!choice || typeof choice !== 'object') return 'Suggested choice'
  const item = choice as Record<string, unknown>
  if (typeof item.sample_id === 'string') { const rating = typeof item.rating === 'string' ? item.rating : 'love'
    return `${rating[0].toUpperCase()}${rating.slice(1)}: ${sampleTitle(item.sample_id)}` }
  const field = typeof item.field === 'string' ? fieldByKey(item.field) : undefined
  return field ? `${field.label}: ${displayValue(field, item.value)}` : 'Suggested choice'
}
