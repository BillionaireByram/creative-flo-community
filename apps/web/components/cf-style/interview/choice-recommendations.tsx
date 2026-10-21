'use client'

import { useState } from 'react'
import { markRecommendationUsed } from '../api'
import { useStyleAction } from '../use-style'
import type { InterviewAnswers, Recommendation, StyleTemplate } from '../types'
import { applyRecommendation, choiceLabel, choicePatch, templateRecommendations } from './logic'
import type { SectionId } from './sections'
import css from './interview.module.css'

export function ChoiceRecommendations({ section, answers, templates, recommendations, interviewId, onApply, onUsed }: {
  section: SectionId; answers: InterviewAnswers; templates: StyleTemplate[]; recommendations: Recommendation[]; interviewId: string; onApply: (change: (answers: InterviewAnswers) => InterviewAnswers) => void; onUsed: () => void
}) {
  const [applied, setApplied] = useState<string[]>([])
  const action = useStyleAction(onUsed)
  const apiChoices = recommendations.filter((item) => item.kind === 'choice' && item.status === 'open' && item.payload.section === section && (!item.interview_id || item.interview_id === interviewId))
  const choices = (apiChoices.length ? apiChoices : templateRecommendations(answers, templates, section)).filter((item) => choicePatch(section, item.payload.choice))
  return <aside className={css.recommend}><h3>Flo recommends</h3>{choices.length ? <div className={css.chips}>{choices.map((item) => <div key={item.id} className="min-w-0 space-y-2"><button type="button" className={css.chip} aria-pressed={applied.includes(item.id)} disabled={action.busy} onClick={() => {
    onApply((current) => applyRecommendation(current, item))
    setApplied((old) => [...old.filter((id) => id !== item.id), item.id])
    if (!item.id.startsWith('local:')) void action.run(() => markRecommendationUsed(item.id))
  }}>{choiceLabel(item.payload.choice)}</button><p className={css.hint}>{item.reason}</p></div>)}</div> : <p className={css.hint}>Rate a style you love to help Flo suggest details. Every choice is yours to customize.</p>}
    {action.error && <p role="alert" className={css.error}>Your choice is applied. Flo could not clear the suggestion yet. Tap it again to retry.</p>}
  </aside>
}
