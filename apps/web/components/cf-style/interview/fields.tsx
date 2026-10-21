'use client'

import { useEffect, useRef, useState } from 'react'
import type { AnswerValue, Brand, InterviewAnswers } from '../types'
import { fieldIssue, same, toLines } from './logic'
import { LogoUpload } from './logo-upload'
import type { FieldSpec } from './sections'
import css from './interview.module.css'

type SetAnswer = (key: string, value: AnswerValue | null) => void
interface LogoState { uploadId?: string; onUpload: (id: string) => void }

const parseLines = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean)
/** Keeps what is being typed (blank lines, spaces) while the saved answer is the clean list. */
function ListField({ id, value, onChange, invalid, describedBy }: { id: string; value: string[]; onChange: (lines: string[]) => void; invalid: boolean; describedBy?: string }) {
  const [text, setText] = useState(() => value.join('\n'))
  const latest = useRef(text)
  latest.current = text
  useEffect(() => { if (!same(parseLines(latest.current), value)) setText(value.join('\n')) }, [value])
  return <textarea id={id} className={css.input} maxLength={4000} value={text} aria-invalid={invalid} aria-describedby={describedBy}
    onChange={(event) => { setText(event.target.value); onChange(parseLines(event.target.value)) }} />
}
function WordsField({ id, label, value, onChange }: { id: string; label: string; value: Record<string, unknown>; onChange: (value: { is: string[]; never: string[] }) => void }) {
  const from = (words: unknown) => [0, 1, 2].map((index) => toLines(words)[index] ?? '')
  const [slots, setSlots] = useState({ is: from(value.is), never: from(value.never) })
  const latest = useRef(slots)
  latest.current = slots
  const compact = (words: string[]) => words.map((word) => word.trim()).filter(Boolean)
  useEffect(() => {
    if (!same(compact(latest.current.is), toLines(value.is)) || !same(compact(latest.current.never), toLines(value.never))) setSlots({ is: from(value.is), never: from(value.never) })
  }, [value])
  const change = (group: 'is' | 'never', index: number, word: string) => {
    const next = { ...slots, [group]: slots[group].map((item, i) => i === index ? word : item) }
    setSlots(next)
    onChange({ is: compact(next.is), never: compact(next.never) })
  }
  return <fieldset className="space-y-3"><legend className="mb-3">{label}</legend>
    {(['is', 'never'] as const).map((group) => <div key={group} className="space-y-2"><p className={css.hint}>{group === 'is' ? 'Three words it IS' : 'Three words it is NEVER'}</p>
      <div className="grid gap-2 sm:grid-cols-3">{slots[group].map((word, index) => <input key={index} id={index === 0 ? `${id}-${group}` : undefined} className={css.input} maxLength={40} aria-label={`${group === 'is' ? 'IS' : 'NEVER'} word ${index + 1}`} value={word} onChange={(event) => change(group, index, event.target.value)} />)}</div></div>)}
  </fieldset>
}
const shortFormat = (format: string) => format.replace(/ \(.*\)$/, '')

export function InterviewFields({ fields, answers, brand, onSet, logo }: { fields: readonly FieldSpec[]; answers: InterviewAnswers; brand: Brand; onSet: SetAnswer; logo: LogoState }) {
  return <div className={css.fields}>{fields.map((field) => {
    const key = field.key
    const value = answers.answers[key]
    const id = `style-field-${key}`
    const issue = value === undefined ? null : fieldIssue(field, value)
    const describedBy = issue ? `${id}-issue` : undefined
    const set = (next: AnswerValue | null) => onSet(key, next)
    let control
    if (field.type === 'logo') return <LogoUpload key={key} brand={brand} value={typeof value === 'string' ? value : undefined} uploadId={logo.uploadId} onUpload={logo.onUpload} />
    if (field.type === 'chips' || field.type === 'single' || field.type === 'bool') {
      const options = field.options ?? []
      const chosen = field.type === 'chips' ? toLines(value) : field.type === 'bool' ? (typeof value === 'boolean' ? [value ? 'Yes' : 'No'] : []) : typeof value === 'string' ? [value] : []
      // An answer made before (or outside) this list still shows, so nothing is hidden from the person.
      const shown = [...options, ...chosen.filter((item) => !options.includes(item))]
      control = <fieldset><legend className="mb-3">{field.label}</legend><div className={css.chips}>{shown.map((option) => {
        const active = chosen.includes(option)
        const toggle = () => set(field.type === 'chips' ? (active ? chosen.filter((item) => item !== option) : [...chosen, option]) : field.type === 'bool' ? (active ? null : option === 'Yes') : active ? null : option)
        return <button type="button" key={option} className={css.chip} aria-pressed={active} onClick={toggle}>{field.labels?.[option] ?? option}</button>
      })}</div></fieldset>
    } else if (field.type === 'words') {
      control = <WordsField id={id} label={field.label} value={value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}} onChange={(words) => set(words)} />
    } else if (field.type === 'lengths') {
      const lengths = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, string> : {}
      const formats = toLines(answers.answers.formats)
      control = <fieldset><legend className="mb-3">{field.label}</legend>{formats.length ? <div className="space-y-3">{formats.map((format) => <label key={format} className="block text-sm">{shortFormat(format)}<input className={css.input} maxLength={40} placeholder="20-40s" value={lengths[format] ?? ''} onChange={(event) => set(Object.fromEntries(Object.entries({ ...lengths, [format]: event.target.value }).filter(([, length]) => length.trim())))} /></label>)}</div> : <p className={css.hint}>Pick your formats above, then add a length for each.</p>}</fieldset>
    } else {
      control = <><label htmlFor={id}>{field.label}{field.key === 'brand' ? ' *' : ''}</label>
        {field.type === 'range' ? <><input className={css.range} id={id} type="range" min={1} max={field.max ?? 5} step={1} value={typeof value === 'number' ? value : Math.ceil((field.max ?? 5) / 2)} onChange={(event) => set(Number(event.target.value))} /><p className={css.hint}>1 gentle · <output htmlFor={id}>{typeof value === 'number' ? value : `${Math.ceil((field.max ?? 5) / 2)} (not chosen yet)`}</output> · {field.max ?? 5} intense</p></>
          : field.type === 'color' ? <div className="flex min-w-0 items-center gap-3"><input type="color" aria-label={`${field.label} picker`} className="h-11 w-11 shrink-0" value={typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#d9b26a'} onChange={(event) => set(event.target.value)} /><input className={css.input} id={id} value={typeof value === 'string' ? value : ''} maxLength={7} placeholder="#d9b26a" onChange={(event) => set(event.target.value)} /></div>
            : field.type === 'list' ? <ListField id={id} value={toLines(value)} onChange={set} invalid={!!issue} describedBy={describedBy} />
              : field.type === 'textarea' ? <textarea id={id} className={css.input} maxLength={4000} value={typeof value === 'string' ? value : ''} onChange={(event) => set(event.target.value)} />
                : <input id={id} className={css.input} maxLength={field.key === 'brand' || field.key === 'style_name' ? 80 : 1000} value={typeof value === 'string' ? value : ''} onChange={(event) => set(event.target.value)} aria-required={field.key === 'brand'} />}
      </>
    }
    return <div className={css.field} key={key}>{control}{field.hint && <p className={css.hint}>{field.hint}</p>}{issue && <p id={`${id}-issue`} className={css.error}>{issue}</p>}</div>
  })}</div>
}
