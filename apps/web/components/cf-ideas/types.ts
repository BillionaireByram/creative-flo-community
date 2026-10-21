export type IdeaStatus = 'idea' | 'scripting' | 'ready' | 'shot' | 'archived'
export type BoardStatus = Exclude<IdeaStatus, 'archived'>

export interface ScriptBeat {
  id: string
  text: string
  broll: string | null
}

export interface IdeaScript {
  beats: ScriptBeat[]
  cta: string
}

export interface Idea {
  id: string
  brand: string | null
  project_id: string
  title: string
  hook: string | null
  angle: string | null
  pillar: string | null
  format: string | null
  status: IdeaStatus
  script: IdeaScript
  script_text: string | null
  teleprompter_text: string
  notes: string | null
  tracker_cf_id: string | null
  asset_id: string | null
  position: number
  created_at: string
  updated_at: string
}

export interface Brand {
  style_ready?: boolean
  brand: string
  project_id: string
  project_name: string
  role: 'owner' | 'editor' | 'reviewer' | 'viewer'
}

export type IdeaDraft = Pick<Idea,
  'title' | 'hook' | 'angle' | 'pillar' | 'format' | 'status' | 'script' | 'script_text' | 'notes'
>

export type IdeaPatch = Partial<IdeaDraft & Pick<Idea, 'tracker_cf_id' | 'asset_id' | 'position'>>
