import type { BoardStatus, Idea, IdeaScript, IdeaStatus, ScriptBeat } from './types'

export const BOARD_COLUMNS: ReadonlyArray<{ status: BoardStatus; label: string }> = [
  { status: 'idea', label: 'Idea' },
  { status: 'scripting', label: 'Scripting' },
  { status: 'ready', label: 'Ready to shoot' },
  { status: 'shot', label: 'Shot' },
]

export function teleprompterText(
  hook: string | null | undefined,
  script: IdeaScript | null | undefined,
  scriptText?: string | null,
): string {
  if (scriptText?.trim()) return scriptText
  return [hook, ...(script?.beats ?? []).map((beat) => beat.text), script?.cta]
    .map((part) => part?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n')
}

export function newBeatId(): string {
  // getRandomValues also works on self-hosted HTTP origins without randomUUID.
  const bytes = new Uint8Array(6)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function addBeat(beats: readonly ScriptBeat[], text = ''): ScriptBeat[] {
  return [...beats, { id: newBeatId(), text, broll: null }]
}

export function removeBeat(beats: readonly ScriptBeat[], index: number): ScriptBeat[] {
  return beats.filter((_, current) => current !== index)
}

export function updateBeat(
  beats: readonly ScriptBeat[], index: number, changes: Partial<Pick<ScriptBeat, 'text' | 'broll'>>,
): ScriptBeat[] {
  return beats.map((beat, current) => current === index ? { ...beat, ...changes } : beat)
}

export function moveBeat(beats: readonly ScriptBeat[], index: number, dir: -1 | 1): ScriptBeat[] {
  const result = [...beats]
  const target = index + dir
  if (index < 0 || index >= beats.length || target < 0 || target >= beats.length) return result
  ;[result[index], result[target]] = [result[target], result[index]]
  return result
}

export function groupByStatus(ideas: readonly Idea[]): Record<BoardStatus, Idea[]> {
  const groups: Record<BoardStatus, Idea[]> = { idea: [], scripting: [], ready: [], shot: [] }
  for (const idea of ideas) {
    if (idea.status !== 'archived') groups[idea.status].push(idea)
  }
  for (const column of BOARD_COLUMNS) {
    groups[column.status].sort((a, b) => a.position - b.position
      || Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id))
  }
  return groups
}

export function nextStatus(status: IdeaStatus): BoardStatus | null {
  const index = BOARD_COLUMNS.findIndex((column) => column.status === status)
  return index >= 0 ? BOARD_COLUMNS[index + 1]?.status ?? null : null
}

export function prevStatus(status: IdeaStatus): BoardStatus | null {
  if (status === 'archived') return 'shot'
  const index = BOARD_COLUMNS.findIndex((column) => column.status === status)
  return BOARD_COLUMNS[index - 1]?.status ?? null
}

export function statusLabel(status: IdeaStatus): string {
  return BOARD_COLUMNS.find((column) => column.status === status)?.label ?? 'Archived'
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

export function readSeconds(text: string): number {
  return Math.ceil(wordCount(text) * 60 / 150)
}
