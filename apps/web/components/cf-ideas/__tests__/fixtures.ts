import type { Idea } from '../types'

export function makeIdea(overrides: Partial<Idea> = {}): Idea {
  return {
    id: 'idea-1', brand: 'demo', project_id: 'project-1', title: 'The first story',
    hook: 'How it started', angle: null, pillar: 'Marketing', format: null, status: 'idea',
    script: { beats: [], cta: '' }, script_text: null, teleprompter_text: 'How it started',
    notes: null, tracker_cf_id: null, asset_id: null, position: 0,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}
