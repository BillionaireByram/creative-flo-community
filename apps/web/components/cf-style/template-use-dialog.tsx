'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { createInterview, createStyle, getTemplate, templateKey, markRecommendationUsed } from './api'
import { rememberInterview } from './interview/resume'
import { styleUrl, useStyleAction } from './use-style'
import { StyleCard } from './style-card'
import { ErrorState, StudioDialog, fieldClass, primaryClass } from './ui'

export function TemplateUseDialog({ brand, template, open, onOpenChange, recommendationId }: {
  brand: string; template: string; open: boolean; onOpenChange: (open: boolean) => void; recommendationId?: string
}) {
  const router = useRouter()
  const { data } = useSWR(open ? templateKey(template) : null, () => getTemplate(template))
  const [name, setName] = useState('')
  const draftId = useRef<string | null>(null)
  const interviewId = useRef<string | null>(null)
  const action = useStyleAction()
  return <StudioDialog open={open} onOpenChange={(next) => { if (!action.busy) onOpenChange(next) }} title="Make this style yours" description="Name your style, then customize it in the interview.">
    <form className="space-y-4" onSubmit={(event) => {
      event.preventDefault()
      void action.run(async () => {
        if (!draftId.current) draftId.current = (await createStyle({ brand, name: name.trim(), from_template: template })).id
        if (!interviewId.current) interviewId.current = (await createInterview({ brand, style_id: draftId.current, mode: 'improve' })).id
        if (recommendationId) await markRecommendationUsed(recommendationId)
        rememberInterview(brand, interviewId.current)
        router.push(styleUrl(brand, `interview/${encodeURIComponent(interviewId.current)}`))
      })
    }}>
      {data?.name && <p className="text-sm text-text-secondary">Starting from {data.name}</p>}
      {data && <StyleCard name={data.name} preview={data.preview} sampleUrl={data.sample_url} posterUrl={data.poster_url} compact motion />}
      <label className="block space-y-2 text-sm">Style name<input autoFocus required maxLength={80} className={fieldClass} value={name} disabled={action.busy || !!draftId.current} onChange={(event) => setName(event.target.value)} /></label>
      {action.error && <ErrorState>{action.error}</ErrorState>}
      <button className={primaryClass} disabled={action.busy || !name.trim()}>{action.busy ? 'Opening your interview...' : 'Customize this style'}</button>
    </form>
  </StudioDialog>
}
