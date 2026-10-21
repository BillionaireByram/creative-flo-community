export type { Brand } from '@/components/cf-ideas/types'

export type VersionStatus = 'building' | 'proposed' | 'approved' | 'rejected' | 'failed'
/** The preview object every style version and template carries. The builder writes it and the cards read it. */
export interface StylePreview {
  palette?: string[] | null
  fonts?: string[] | null
  caption_sample?: string | null
  caption_style?: string | null
  transitions?: string[] | null
  music_beds?: string[] | null
  pace?: number | null
  motion_sample?: string | null
}
export interface StyleVersion {
  id: string
  style_id: string
  version: number
  status: VersionStatus
  preview: StylePreview
  design_md: string
  style_json: Record<string, unknown>
  skin_css: string
  answers: InterviewAnswers | null
  request: string | null
  changelog: string
  sample_asset_id: string | null
  sample_url: string | null
  error: string | null
  attempt: number
  created_by: string
  approved_by: string | null
  approved_at: string | null
  created_at: string
}
export interface Style {
  id: string
  project_id: string
  brand: string
  name: string
  slug: string
  description: string
  is_default: boolean
  origin: 'interview' | 'template' | 'copy' | 'import'
  template_key: string | null
  current_version_id: string | null
  /** Only the approved current version. A style whose first version is still being reviewed has none. */
  current_version: StyleVersion | null
  open_proposals: number
  building_count: number
  archived_at: string | null
  created_at: string
  updated_at: string
}
export interface StyleDetail extends Style { versions: StyleVersion[] }
export interface StyleTemplate {
  key: string
  name: string
  summary: string
  best_for: string
  why_it_works: string
  tags: string[]
  design_md: string
  style_json: Record<string, unknown>
  preview: StylePreview
  sample_url: string | null
  poster_url: string | null
  trend_note: string | null
  trend_updated_at: string | null
  recommended_for_brand?: boolean | null
}
export type Rating = 'love' | 'maybe' | 'no'
export type AnswerValue = string | number | boolean | string[] | Record<string, unknown>
/** The interview, exactly as the API stores it and the builder reads it (style-lab-v3). */
export interface InterviewAnswers {
  version?: string
  ratings: Record<string, Rating>
  notes: Record<string, string>
  answers: Record<string, AnswerValue>
  progress?: { section: number; updated: string }
}
/** A partial save. A null value deletes that key on the server. */
export interface AnswersPatch {
  ratings?: Record<string, Rating | null>
  notes?: Record<string, string | null>
  answers?: Record<string, AnswerValue | null>
  progress?: { section: number; updated: string } | null
}
export interface Interview {
  id: string
  project_id: string
  brand: string
  style_id: string | null
  mode: 'new' | 'improve'
  status: 'in_progress' | 'submitted' | 'built' | 'abandoned'
  answers: InterviewAnswers
  created_at: string
  updated_at: string
}
export type RecommendationChoice = { field: string; value: AnswerValue } | { sample_id: string; rating: Rating; note?: string }
export interface Recommendation {
  id: string
  brand: string
  interview_id: string | null
  kind: 'template' | 'choice' | 'improvement'
  payload: { template_key?: string; style_id?: string; change?: string; section?: string; choice?: RecommendationChoice }
  reason: string
  status: 'open' | 'used' | 'dismissed'
  created_by?: string
  created_at?: string
}
export interface SubmitResult { style_id: string; version_id: string }
export interface CreateStyleBody { brand: string; name: string; from_template?: string; copy_of?: string }
export interface CreateInterviewBody { brand: string; style_id?: string; mode: 'new' | 'improve' }
export interface AssetStyleResult { asset_id: string; style_id: string | null }
