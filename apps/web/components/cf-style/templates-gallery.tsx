'use client'

import { useState } from 'react'
import type { Brand } from './types'
import { useStyleLive, useTemplates } from './use-style'
import { StyleCard } from './style-card'
import { TemplateUseDialog } from './template-use-dialog'
import { ErrorState, Loading, actionClass, panelClass, primaryClass } from './ui'

export function TemplatesGallery({ brand }: { brand: Brand }) {
  const { data, error, mutate } = useTemplates(brand.brand)
  useStyleLive(brand)
  const [tag, setTag] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  if (error) return <ErrorState retry={() => { void mutate() }}>Could not load templates.</ErrorState>
  if (!data) return <Loading label="Loading templates..." />
  const tags = Array.from(new Set(data.flatMap((template) => template.tags))).sort()
  const filtered = tag ? data.filter((template) => template.tags.includes(tag)) : data
  return <div className="space-y-6"><header><h1 className="text-2xl font-semibold">Find your starting point</h1><p className="mt-2 text-sm text-text-secondary">See it move. Make it yours. Every detail can change.</p></header>
    <div role="group" aria-label="Filter templates by tag" className="flex flex-wrap gap-2"><button className={actionClass} aria-pressed={!tag} onClick={() => setTag(null)}>All styles</button>{tags.map((item) => <button key={item} className={`${actionClass} ${tag === item ? 'bg-accent-muted text-accent' : ''}`} aria-pressed={tag === item} onClick={() => setTag(tag === item ? null : item)}>{item}</button>)}</div>
    {!filtered.length && <p className={panelClass}>{data.length ? 'No templates match this tag.' : 'No templates are available yet.'}</p>}
    <div className="grid min-w-0 gap-6 md:grid-cols-2 xl:grid-cols-3">{filtered.map((template) => <article key={template.key} className={`${panelClass} space-y-4`}>
      {template.recommended_for_brand && <span className="inline-block rounded-full bg-accent-muted px-3 py-1 text-xs text-accent">Recommended for you</span>}
      <h2 className="break-words text-xl font-semibold">{template.name}</h2>{template.summary && <p className="text-sm text-text-secondary">{template.summary}</p>}
      <StyleCard name={template.name} preview={template.preview} sampleUrl={template.sample_url} posterUrl={template.poster_url} motion />
      {template.best_for && <p className="text-sm text-text-secondary"><strong className="text-text-primary">Best for: </strong>{template.best_for}</p>}
      {template.why_it_works && <p className="text-sm text-text-secondary"><strong className="text-text-primary">Why it works: </strong>{template.why_it_works}</p>}
      {template.trend_note && <aside className="space-y-2 rounded-xl bg-bg-tertiary p-3 text-sm"><h3 className="font-medium">What is working right now</h3><p className="text-text-secondary">{template.trend_note}</p>{template.trend_updated_at && <p className="text-xs text-text-secondary">Updated {formatStyleDate(template.trend_updated_at)}</p>}</aside>}
      {brand.role === 'owner' && <button className={`${primaryClass} w-full`} onClick={() => setSelected(template.key)}>Use this template</button>}
    </article>)}</div>
    {selected && <TemplateUseDialog key={selected} brand={brand.brand} template={selected} open onOpenChange={(open) => { if (!open) setSelected(null) }} />}
  </div>
}
export function formatStyleDate(date?: string | null) { return date && !Number.isNaN(Date.parse(date)) ? new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable' }
