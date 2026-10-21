import type { InterviewAnswers, StyleTemplate } from '../types'
import { summary } from './logic'
import css from './interview.module.css'

export function InterviewSummary({ answers, templates, onEdit }: { answers: InterviewAnswers; templates: StyleTemplate[]; onEdit: (index: number) => void }) {
  return <div className={css.grid}>{summary(answers, templates).map((section, index) => <section key={section.id} className={css.field}>
    <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{section.title}</h2><button type="button" className={css.button} aria-label={`Edit ${section.title}`} onClick={() => onEdit(index)}>Edit</button></div>
    {section.ratings.filter((rating) => rating.rating || rating.note).map((rating) => <p key={rating.id} className={css.hint}><strong className="capitalize text-white">{rating.rating ?? 'Note'}: {rating.label}</strong>{rating.note && ` · ${rating.note}`}</p>)}
    {section.fields.map((field) => <p key={field.label} className={`${css.hint} break-words`}><strong className="text-white">{field.label}: </strong>{field.value}</p>)}
    {section.note && <p className={`${css.hint} whitespace-pre-wrap break-words`}>Note: {section.note}</p>}
    {!section.fields.length && !section.ratings.some((rating) => rating.rating || rating.note) && !section.note && <p className={css.hint}>No picks yet. Flo can propose a starting point.</p>}
    {section.missing.map((issue) => <p key={issue} className={css.error}>{issue}</p>)}
  </section>)}</div>
}
