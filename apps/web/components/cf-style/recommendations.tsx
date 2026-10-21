'use client'

import { useRef, useState } from 'react'
import { dismissRecommendation, improveStyle, markRecommendationUsed } from './api'
import { useRecommendations, useStyleAction } from './use-style'
import { TemplateUseDialog } from './template-use-dialog'
import { ErrorState, actionClass, panelClass } from './ui'

export function Recommendations({ brand, styleId, onChange, canEdit }: { brand: string; styleId?: string; onChange: () => void; canEdit: boolean }) {
  const { data, error, mutate } = useRecommendations(brand)
  const [template, setTemplate] = useState<{ key: string; recommendationId: string } | null>(null)
  const applied = useRef(new Set<string>())
  const action = useStyleAction(() => { void mutate(); onChange() })
  const rows = (data ?? []).filter((item) => item.status === 'open' && (styleId ? item.kind === 'improvement' && item.payload?.style_id === styleId : item.kind !== 'choice'))
  if (error) return <ErrorState retry={() => { void mutate() }}>Could not load Flo&apos;s recommendations.</ErrorState>
  if (!rows.length) return null
  return <section className={panelClass} aria-label="Flo recommends"><h2 className="mb-4 text-lg font-semibold">Flo recommends</h2>
    <div className="grid gap-3 md:grid-cols-2">{rows.map((item) => <div key={item.id} className="min-w-0 space-y-3 rounded-xl border border-border p-4">
      <p className="text-xs uppercase tracking-wide text-accent">{item.kind === 'template' ? 'A style to try' : 'A style improvement'}</p>
      <p className="break-words text-sm">{item.reason || 'A suggestion for your next style.'}</p>
      {item.payload?.change && <p className="break-words text-sm text-text-secondary">{item.payload.change}</p>}
      {canEdit && <div className="flex flex-wrap gap-2"><button type="button" className={actionClass} disabled={action.busy || (item.kind === 'template' ? !item.payload?.template_key : !item.payload?.style_id || !item.payload.change)} onClick={() => {
        if (item.kind === 'template' && item.payload?.template_key) { setTemplate({ key: item.payload.template_key, recommendationId: item.id }); return }
        void action.run(async () => {
          if (!applied.current.has(item.id)) {
            await improveStyle(item.payload!.style_id!, item.payload!.change!)
            applied.current.add(item.id)
            onChange()
          }
          await markRecommendationUsed(item.id)
        })
      }}>{applied.current.has(item.id) ? 'Clear applied suggestion' : styleId ? 'Make it part of the style' : 'Use'}</button>
        <button type="button" className={actionClass} disabled={action.busy} onClick={() => { void action.run(() => dismissRecommendation(item.id)) }}>Dismiss</button></div>}
    </div>)}</div>
    {action.error && <ErrorState>{action.error}</ErrorState>}
    {template && <TemplateUseDialog key={template.recommendationId} open brand={brand} template={template.key} recommendationId={template.recommendationId} onOpenChange={(open) => { if (!open) setTemplate(null) }} />}
  </section>
}
