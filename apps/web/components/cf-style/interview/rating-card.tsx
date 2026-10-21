'use client'

import type { ReactNode } from 'react'
import type { Rating } from '../types'
import css from './interview.module.css'

export function RatingCard({ title, description, rating, note, onRate, onNote, children }: {
  title: string; description?: string; rating?: Rating; note?: string; onRate: (rating: Rating) => void; onNote: (note: string) => void; children: ReactNode
}) {
  return <article className={css.card}>{children}<div className={css.meta}><h3>{title}</h3>{description && <p>{description}</p>}</div>
    <div className={css.rate} role="group" aria-label={`Rate ${title}`}>{(['love', 'maybe', 'no'] as Rating[]).map((value) => <button key={value} type="button" data-v={value} aria-label={`${value[0].toUpperCase() + value.slice(1)}: ${title}`} aria-pressed={rating === value} onClick={() => onRate(value)}>{value}</button>)}</div>
    <input className={css.input} aria-label={`Note on ${title}`} placeholder="What works? What would you change?" value={note ?? ''} maxLength={4000} onChange={(event) => onNote(event.target.value)} />
  </article>
}
