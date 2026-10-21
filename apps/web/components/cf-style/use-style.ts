'use client'

import { useCallback, useRef, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { ApiError } from '@/lib/api'
import { useSSE } from '@/hooks/use-sse'
import * as client from './api'
import type { Brand, Style } from './types'

export const styleUrl = (brand: string, tail = '') => `/${encodeURIComponent(brand)}/style${tail ? `/${tail}` : ''}`
export const currentVersion = (style: Style) => style.current_version ?? undefined
export const isBuilding = (style: Style) => style.building_count > 0
export const listRefreshInterval = (styles?: Style[]) => styles?.some(isBuilding) ? 4000 : 0
export const detailRefreshInterval = (style?: Style) => style && isBuilding(style) ? 4000 : 0
export function useBrands() { return useSWR(client.brandsKey, client.listBrands) }
export function useStyles(brand: string) {
  return useSWR(client.stylesKey(brand), () => client.listStyles(brand), { refreshInterval: listRefreshInterval })
}
export function useStyle(id: string) {
  return useSWR(client.styleKey(id), () => client.getStyle(id), { refreshInterval: detailRefreshInterval })
}
export function useTemplates(brand: string) { return useSWR(client.templatesKey(brand), () => client.listTemplates(brand)) }
export function useRecommendations(brand: string) { return useSWR(client.recommendationsKey(brand), () => client.listRecommendations(brand)) }
export function useStyleLive(brand: Brand, ids: string[] = [], interviewId?: string) {
  const { mutate } = useSWRConfig()
  const refresh = useCallback((eventId?: string | null) => {
    void mutate((key) => client.isBrandStyleKey(key, brand.brand, [...ids, ...(eventId ? [eventId] : [])], interviewId)).catch(() => undefined)
    void mutate(client.brandsKey).catch(() => undefined)
  }, [mutate, brand.brand, ids, interviewId])
  useSSE(brand.project_id, { onCfStyleUpdated: (event) => { if (event.brand === brand.brand) refresh(event.style_id) } })
  return refresh
}
export function styleError(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return 'Only the brand owner can change this style.'
  if (error instanceof ApiError && error.status === 429) return 'Please wait a moment, then try again.'
  if (error instanceof ApiError && error.status >= 500) return 'Flo could not finish that request. Please try again.'
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
export function useStyleAction(onSuccess?: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)
  const run = async (action: () => Promise<unknown>) => {
    if (pending.current) return false
    pending.current = true
    setBusy(true)
    setError(null)
    try { await action(); onSuccess?.(); return true }
    catch (cause) { setError(styleError(cause)); return false }
    finally { pending.current = false; setBusy(false) }
  }
  return { run, busy, error }
}
