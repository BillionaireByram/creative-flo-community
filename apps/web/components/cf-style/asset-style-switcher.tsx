'use client'

import { useEffect, useState } from 'react'
import type { Asset } from '@/types'
import type { Brand } from './types'
import { setAssetStyle } from './api'
import { useBrands, useStyleAction, useStyleLive, useStyles } from './use-style'
import { ChevronDown, Palette } from 'lucide-react'
import { actionClass } from './ui'

// Matches the toolbar buttons beside it (Compare, New Version): one line, h-8, never wraps.
const pillClass = 'relative inline-flex h-8 max-w-48 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-text-secondary transition-colors [@media(pointer:coarse)]:min-h-11'

export function AssetStyleSwitcher({ asset, onChanged }: { asset: Asset; onChanged?: () => void }) {
  const { data, error } = useBrands()
  const brand = !error ? data?.find((item) => item.project_id === asset.project_id) : undefined
  if (!brand || asset.asset_type !== 'video') return null
  return <BrandAssetStyle key={asset.id} asset={asset} brand={brand} onChanged={onChanged} />
}
function BrandAssetStyle({ asset, brand, onChanged }: { asset: Asset; brand: Brand; onChanged?: () => void }) {
  const styles = useStyles(brand.brand)
  const [styleId, setStyleId] = useState(asset.cf_style_id ?? null)
  useEffect(() => setStyleId(asset.cf_style_id ?? null), [asset.cf_style_id])
  const refresh = useStyleLive(brand, styles.data?.map((style) => style.id))
  const action = useStyleAction(() => { refresh(); onChanged?.() })
  if (styles.error) return <span role="alert" className={pillClass}>Style failed <button className={actionClass} onClick={() => { void styles.mutate() }}>Retry</button></span>
  if (!styles.data) return <span role="status" className={pillClass}>Loading style...</span>
  // A style that has since been archived no longer applies, so the video follows the brand default.
  const selected = styles.data.find((style) => style.id === styleId) ?? styles.data.find((style) => style.is_default)
  const options = styles.data.filter((style) => style.current_version?.status === 'approved')
  const label = selected ? `${selected.name}${selected.current_version ? ` v${selected.current_version.version}` : ''}` : 'Brand default'
  const owner = brand.role === 'owner'
  return <div className={`${pillClass} ${owner ? '[@media(hover:hover)]:hover:bg-bg-hover [@media(hover:hover)]:hover:text-text-primary focus-within:ring-2 focus-within:ring-accent' : ''} ${action.busy ? 'opacity-60' : ''}`}
    title={action.error ? `${label}: ${action.error}` : `Edited in: ${label}`}>
    <Palette aria-hidden className="h-3.5 w-3.5 shrink-0" />
    <span aria-hidden className="truncate whitespace-nowrap">{label}</span>
    <span className="sr-only">Edited in: {label}</span>
    {owner && <><ChevronDown aria-hidden className="h-3 w-3 shrink-0 opacity-70" />
      <select aria-label="Editing style for this video" className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait" value={selected && styleId === selected.id ? selected.id : ''} disabled={action.busy} onChange={(event) => {
        const next = event.target.value || null
        void action.run(async () => { const result = await setAssetStyle(asset.id, next); setStyleId(result.style_id) })
      }}><option value="">Brand default</option>{options.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}</select></>}
    {action.error && <span role="alert" className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-warning"><span className="sr-only">{action.error}</span></span>}
  </div>
}
