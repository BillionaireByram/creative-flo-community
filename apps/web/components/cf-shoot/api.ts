import { api, ApiError } from '@/lib/api'

export interface Brand {
  brand: string
  project_id: string
  project_name: string
  role: string
}

export interface ScriptBeat {
  id: string
  text: string
  broll?: string | null
}

export interface Idea {
  id: string
  brand: string
  project_id: string
  title: string
  hook?: string | null
  status: string
  teleprompter_text?: string | null
  script?: { beats?: ScriptBeat[]; cta?: string | null } | null
}

export interface Folder {
  id: string
  project_id: string
  parent_id: string | null
  name: string
}

export const CONTENT_BIN = 'Content Bin'
export const BRAND_LABELS: Record<string, string> = {
  demo: 'Sample Creator',
  studio: 'Creative Flo',
}

export function brandLabel(b: Pick<Brand, 'brand' | 'project_name'>): string {
  return Object.prototype.hasOwnProperty.call(BRAND_LABELS, b.brand)
    ? BRAND_LABELS[b.brand]
    : b.project_name
}

export function fetchBrands(): Promise<Brand[]> {
  return api.get<Brand[]>('/cf/brands')
}

export async function fetchReadyIdeas(brand: string): Promise<Idea[]> {
  try {
    return await api.get<Idea[]>(`/cf/ideas?brand=${encodeURIComponent(brand)}&status=ready`)
  } catch (err) {
    // Freestyle shooting stays available while the Ideas API rolls out.
    if (err instanceof ApiError && err.status === 404) return []
    throw err
  }
}

export async function fetchIdea(id: string): Promise<Idea | null> {
  try {
    return await api.get<Idea>(`/cf/ideas/${encodeURIComponent(id)}`)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

export function markIdeaShot(id: string, assetId: string): Promise<Idea> {
  return api.patch<Idea>(`/cf/ideas/${encodeURIComponent(id)}`, { status: 'shot', asset_id: assetId })
}

export async function findContentBin(projectId: string): Promise<Folder | null> {
  const folders = await api.get<Folder[]>(`/projects/${encodeURIComponent(projectId)}/folders`)
  const projectFolders = folders.filter((folder) => folder.project_id === projectId)
  const exact = projectFolders.filter((folder) => folder.name === CONTENT_BIN)
  const matches = exact.length > 0 ? exact : projectFolders.filter(
    (folder) => folder.name.trim().toLowerCase() === CONTENT_BIN.toLowerCase(),
  )
  return matches.find((folder) => folder.parent_id === null) ?? matches[0] ?? null
}

export function teleprompterTextFor(idea: Idea): string {
  if (idea.teleprompter_text?.trim()) return idea.teleprompter_text.trim()
  return [idea.hook, ...(idea.script?.beats ?? []).map((beat) => beat.text), idea.script?.cta]
    .map((text) => text?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n')
}

export function assetUrl(projectId: string, assetId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`
}
