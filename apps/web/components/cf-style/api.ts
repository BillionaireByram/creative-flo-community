import { api } from '@/lib/api'
import type { AnswersPatch, AssetStyleResult, Brand, CreateInterviewBody, CreateStyleBody, Interview, Recommendation, Style, StyleDetail, StyleTemplate, StyleVersion, SubmitResult } from './types'

const idPath = (base: string, id: string) => `/cf/${base}/${encodeURIComponent(id)}`
const brandQuery = (base: string, brand: string) => `/cf/${base}?${new URLSearchParams({ brand })}`
export const brandsKey = '/cf/brands'
export const stylesKey = (brand: string) => brandQuery('styles', brand)
export const styleKey = (id: string) => idPath('styles', id)
export const interviewKey = (id: string) => idPath('style-interviews', id)
export const templatesKey = (brand: string) => brandQuery('style-templates', brand)
export const templateKey = (key: string) => idPath('style-templates', key)
export const recommendationsKey = (brand: string) => brandQuery('style-recommendations', brand)

export const listBrands = () => api.get<Brand[]>(brandsKey)
export const listStyles = (brand: string) => api.get<Style[]>(stylesKey(brand))
export const getStyle = (id: string) => api.get<StyleDetail>(styleKey(id))
export const createStyle = (body: CreateStyleBody) => api.post<Style>('/cf/styles', body)
export const patchStyle = (id: string, body: { name?: string; description?: string }) => api.patch<Style>(styleKey(id), body)
export const makeDefault = (id: string) => api.post<Style>(`${styleKey(id)}/default`)
export const archiveStyle = (id: string) => api.post<Style>(`${styleKey(id)}/archive`)
export const improveStyle = (id: string, request: string) => api.post<StyleVersion>(`${styleKey(id)}/improve`, { request })
export const approveVersion = (id: string) => api.post<StyleVersion>(`${idPath('style-versions', id)}/approve`)
export const rejectVersion = (id: string, note?: string) => api.post<StyleVersion>(`${idPath('style-versions', id)}/reject`, note ? { note } : {})
export const restoreVersion = (id: string) => api.post<StyleVersion>(`${idPath('style-versions', id)}/restore`)
export const retryVersion = (id: string) => api.post<StyleVersion>(`${idPath('style-versions', id)}/retry`)
export const createInterview = (body: CreateInterviewBody) => api.post<Interview>('/cf/style-interviews', body)
export const getInterview = (id: string) => api.get<Interview>(interviewKey(id))
export const patchInterview = (id: string, answers: AnswersPatch) => api.patch<Interview>(interviewKey(id), { answers })
export const submitInterview = (id: string) => api.post<SubmitResult>(`${interviewKey(id)}/submit`)
export const listTemplates = (brand: string) => api.get<StyleTemplate[]>(templatesKey(brand))
export const getTemplate = (key: string) => api.get<StyleTemplate>(templateKey(key))
export const listRecommendations = (brand: string) => api.get<Recommendation[]>(recommendationsKey(brand))
export const dismissRecommendation = (id: string) => api.post<Recommendation>(`${idPath('style-recommendations', id)}/dismiss`)
export const markRecommendationUsed = (id: string) => api.post<Recommendation>(`${idPath('style-recommendations', id)}/use`)
/** Sets one video's style. A null style puts the video back on the brand default. */
export const setAssetStyle = (id: string, styleId: string | null) => api.put<AssetStyleResult>(`/cf/assets/${encodeURIComponent(id)}/style`, { style_id: styleId })

export function isBrandStyleKey(key: unknown, brand: string, styleIds: string[] = [], interviewId?: string) {
  if (typeof key !== 'string') return false
  return [stylesKey(brand), templatesKey(brand), recommendationsKey(brand), ...styleIds.map(styleKey), ...(interviewId ? [interviewKey(interviewId)] : [])].includes(key)
}
