import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'
import type { Brand, Interview, Recommendation, Style, StyleDetail, StyleTemplate, StyleVersion } from '../types'

export const brand: Brand = { brand: 'studio', project_id: 'project-1', project_name: 'Studio', role: 'owner', style_ready: false }
export const preview = { palette: ['#101010', '#d9b26a'], fonts: ['Archivo', 'Manrope'], caption_sample: 'Make your next move', caption_style: 'Pop words', transitions: ['Hard cuts only'], music_beds: ['Minimal lo-fi'], pace: 3 }
/** Shapes match what the API returns, so a field the API never sends is not invented here. */
export const version = (patch: Partial<StyleVersion> = {}): StyleVersion => ({
  id: 'v1', style_id: 's1', version: 1, status: 'approved', preview, design_md: '# Signature\n**Bold** type\n## Never\n- Noise', style_json: {}, skin_css: '',
  answers: null, request: null, changelog: '', sample_asset_id: null, sample_url: null, error: null, attempt: 0, created_by: 'u1', approved_by: null, approved_at: null,
  created_at: '2026-10-06T12:00:00Z', ...patch,
})
export const style = (patch: Partial<Style> = {}): Style => ({
  id: 's1', project_id: 'project-1', brand: 'studio', name: 'Story mode', slug: 'story-mode', description: '', is_default: false, origin: 'interview', template_key: null,
  current_version_id: 'v1', current_version: version(), open_proposals: 0, building_count: 0, archived_at: null, created_at: '2026-10-06T12:00:00Z', updated_at: '2026-10-06T12:00:00Z', ...patch,
})
export const styleDetail = (patch: Partial<StyleDetail> = {}): StyleDetail => ({ ...style(), versions: [version()], ...patch })
export const template: StyleTemplate = {
  key: 'cinema', name: 'Cinematic Story', summary: 'Slow and cinematic.', preview, recommended_for_brand: true, tags: ['Cinematic'], best_for: 'Stories', why_it_works: 'Keeps the story clear.',
  trend_note: 'Start with the result.', trend_updated_at: '2026-10-06T00:00:00Z', design_md: '# Cinematic', sample_url: null, poster_url: null,
  style_json: { look: 'look-noir', type: 'type-archivo', caption: 'cap-pop', transition_id: 'tr-glitch', grade: 'grade-teal', density: 'density-balanced', accent: '#d9b26a', highlight: '#ffffff', music: ['Minimal lo-fi'], pace: 7 },
}
export const templateWithSample: StyleTemplate = {
  ...template,
  sample_url: 'https://media.example/template-sample.mp4?signature=sample',
  poster_url: 'https://media.example/template-poster.jpg?signature=poster',
}
export const interview = (patch: Partial<Interview> = {}): Interview => ({
  id: 'i1', project_id: 'project-1', brand: 'studio', style_id: null, mode: 'new', status: 'in_progress', answers: { version: 'style-lab-v3', ratings: {}, notes: {}, answers: {} },
  created_at: '2026-10-06T12:00:00Z', updated_at: '2026-10-06T12:00:00Z', ...patch,
})
export const recommendation = (patch: Partial<Recommendation> = {}): Recommendation => ({
  id: 'r1', brand: 'studio', interview_id: null, kind: 'improvement', status: 'open', reason: 'Clearer words hold attention.', payload: { style_id: 's1', change: 'Bigger captions' }, ...patch,
})
export function TestCache({ children }: { children: ReactNode }) { return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, revalidateOnFocus: false }}>{children}</SWRConfig> }
