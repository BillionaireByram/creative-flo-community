'use client'

import { useEffect, useRef, useState } from 'react'
import { useUploadStore } from '@/stores/upload-store'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import * as Dialog from '@radix-ui/react-dialog'
import { getInterview, interviewKey, submitInterview } from '../api'
import type { Brand, Interview } from '../types'
import { styleUrl, useRecommendations, useStyleAction, useStyleLive, useTemplates } from '../use-style'
import { useStyleFonts } from '../fonts'
import { StyleCard } from '../style-card'
import { actionClass, ErrorState, Loading } from '../ui'
import { rememberInterview, forgetInterview } from './resume'
import { sectionNoteKey, sections, sectionSamples, templateSampleId } from './sections'
import { emptyAnswers, progress, restoredSection, setAnswer, setNote, toggleRating } from './logic'
import { useInterviewDraft, draftStorageKey } from './use-interview-draft'
import { RatingCard } from './rating-card'
import { LiveSample } from './live-sample'
import { InterviewFields } from './fields'
import { ChoiceRecommendations } from './choice-recommendations'
import { InterviewSummary } from './interview-summary'
import css from './interview.module.css'

export function InterviewPage({ brand, id }: { brand: Brand; id: string }) {
  const result = useSWR(interviewKey(id), () => getInterview(id))
  useStyleLive(brand, [], id)
  useEffect(() => {
    if (result.data?.brand === brand.brand && result.data.status && result.data.status !== 'in_progress') forgetInterview(brand.brand, id)
  }, [result.data?.brand, result.data?.status, brand.brand, id])
  const exitLink = <Link className={actionClass} href={styleUrl(brand.brand)}>Exit</Link>
  if (result.error) return <div className="space-y-4">{exitLink}<ErrorState retry={() => { void result.mutate() }}>Could not load your interview.</ErrorState></div>
  if (!result.data) return <div>{exitLink}<Loading label="Opening your interview..." /></div>
  if (result.data.brand !== brand.brand) return <div className="space-y-4">{exitLink}<p>Interview not found for this brand.</p></div>
  if (brand.role !== 'owner') return <div className="space-y-4">{exitLink}<p>Only the brand owner can take this interview.</p></div>
  if (result.data.status && result.data.status !== 'in_progress') return <div className="space-y-4"><p>This interview has already been submitted.</p><Link className={actionClass} href={styleUrl(brand.brand, result.data.style_id ? encodeURIComponent(result.data.style_id) : '')}>View your style</Link></div>
  return <InterviewFlow key={id} brand={brand} interview={result.data} />
}
export function InterviewFlow({ brand, interview }: { brand: Brand; interview: Interview }) {
  const router = useRouter()
  useStyleFonts()
  const draft = useInterviewDraft(interview.id, interview.answers)
  // The upload belongs to this page visit, so its id is remembered here and only the finished logo is saved to the interview.
  const [logoUploadId, setLogoUploadId] = useState<string>()
  const logoUpload = useUploadStore((state) => state.files.find((file) => file.id === logoUploadId))
  const update = draft.update
  const savedLogoId = draft.answers.answers.logo_asset_id
  useEffect(() => {
    if (logoUpload?.assetId && logoUpload.assetId !== savedLogoId && (logoUpload.status === 'complete' || logoUpload.status === 'processing')) {
      update((current) => setAnswer(current, 'logo_asset_id', logoUpload.assetId))
    }
  }, [logoUpload?.assetId, logoUpload?.status, savedLogoId, update])
  const [index, setIndex] = useState(() => {
    if (draft.answers.progress) return restoredSection(draft.answers)
    try { return restoredSection({ ...emptyAnswers(), progress: JSON.parse(localStorage.getItem(`${draftStorageKey(interview.id)}:progress`) ?? 'null') ?? undefined }) } catch { return 0 }
  })
  const [stepsOpen, setStepsOpen] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const action = useStyleAction()
  const templates = useTemplates(brand.brand)
  const recommendations = useRecommendations(brand.brand)
  const scroll = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const complete = progress(draft.answers)
  const section = sections[index]
  const { ratings, notes } = draft.answers
  const brandAnswer = draft.answers.answers.brand
  const brandName = typeof brandAnswer === 'string' && brandAnswer.trim() ? brandAnswer : 'Your brand'
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    heading.current?.focus()
    return () => { document.body.style.overflow = previous }
  }, [])
  useEffect(() => { rememberInterview(brand.brand, interview.id) }, [brand.brand, interview.id])
  useEffect(() => { scroll.current?.scrollTo?.({ top: 0 }); heading.current?.focus() }, [index])
  const navigate = (next: number) => {
    draft.setSection(next)
    void draft.flush()
    setIndex(next)
    setStepsOpen(false)
    setSubmitError(null)
  }
  const exit = () => { void action.run(async () => { if (!await draft.flush()) throw new Error('Could not save your answers. Please retry before leaving.'); router.push(styleUrl(brand.brand)) }) }
  const submit = () => {
    setSubmitError(null)
    if (typeof brandAnswer !== 'string' || !brandAnswer.trim()) { setSubmitError('Add your brand name before building.'); return }
    void action.run(async () => {
      update((current) => setAnswer(current, 'done', true))
      if (!await draft.flush()) { setSubmitError('Your answers are still saved on this device. Reconnect and try building again.'); return }
      const result = await submitInterview(interview.id)
      forgetInterview(brand.brand, interview.id)
      router.push(styleUrl(brand.brand, encodeURIComponent(result.style_id)))
    })
  }
  return <div className={css.room} ref={root} aria-label="Style interview">
    <header className={css.header}><div className={css.headerRow}><div><p className={css.eyebrow}>Creative Flo · Style Studio</p><p role="status" className={css.status}>{draft.status === 'saved' ? 'Saved' : draft.status === 'error' ? "Couldn't save, retrying" : 'Saving...'}</p></div><button type="button" className={css.button} disabled={action.busy} onClick={exit}>Exit</button></div>
      <div role="progressbar" aria-label="Interview sections answered" aria-valuemin={0} aria-valuemax={13} aria-valuenow={complete.answered} className={css.progress}><span style={{ width: `${complete.percent}%` }} /></div>
    </header>
    <div ref={scroll} className={css.scroll}><div className={css.content}>
      <div><p className={css.eyebrow}>{section ? `Section ${index + 1} of 13` : 'Your style, at a glance'}</p><h1 ref={heading} tabIndex={-1} className={css.heading}>{section?.title ?? 'Ready to build your style?'}</h1><p className={css.description}>{section?.description ?? 'Check your picks below. Only your brand name is required to build. You can leave the rest for Flo to propose.'}</p></div>
      {!section && logoUpload && !['complete', 'processing'].includes(logoUpload.status) && <p className={css.hint}>Your logo has not finished uploading. Wait for it to finish if you want it included in this build.</p>}
      {submitError && <p role="alert" className={css.error}>{submitError}</p>}{action.error && <p role="alert" className={css.error}>{action.error}</p>}
      {section ? <>
        <ChoiceRecommendations section={section.id} answers={draft.answers} templates={templates.data ?? []} recommendations={recommendations.data ?? []} interviewId={interview.id} onApply={draft.update} onUsed={() => { void recommendations.mutate() }} />
        {recommendations.error && <p className={css.hint}>Suggestions could not load. Your choices still save. <button type="button" className={css.button} onClick={() => { void recommendations.mutate() }}>Retry suggestions</button></p>}
        <div className="space-y-2"><h2 className="text-lg font-semibold">Customize</h2>{(section.id === 'templates' || sectionSamples(section).length > 0) && <p className={css.hint}>Love means this feels like you. Maybe means part of it works. No means never. Add a note to tell Flo exactly what you like or want to change.</p>}</div>
        <fieldset disabled={action.busy} className="min-w-0 space-y-7">
          <InterviewFields fields={section.fields} answers={draft.answers} brand={brand} onSet={(key, value) => update((current) => setAnswer(current, key, value))} logo={{ uploadId: logoUploadId, onUpload: setLogoUploadId }} />
          {section.id === 'templates' ? <>{templates.error ? <p role="alert" className={css.error}>Could not load the editing styles. <button className={css.button} onClick={() => { void templates.mutate() }}>Retry templates</button></p> : !templates.data ? <p role="status">Loading editing styles...</p> : !templates.data.length ? <p className={css.hint}>No templates are available yet. You can still choose your look in the next section.</p> : <div className={css.grid}>{templates.data.map((template) => <RatingCard key={template.key} title={template.name} description={template.summary} rating={ratings[templateSampleId(template.key)]} note={notes[templateSampleId(template.key)]} onRate={(value) => update((current) => toggleRating(current, templateSampleId(template.key), value))} onNote={(text) => update((current) => setNote(current, templateSampleId(template.key), text))}><StyleCard name={template.name} preview={template.preview} sampleUrl={template.sample_url} posterUrl={template.poster_url} compact motion /></RatingCard>)}</div>}</>
            : <div className={css.grid}>{sectionSamples(section).map((sample) => <RatingCard key={sample.id} title={sample.title} description={sample.description} rating={ratings[sample.id]} note={notes[sample.id]} onRate={(value) => update((current) => toggleRating(current, sample.id, value))} onNote={(text) => update((current) => setNote(current, sample.id, text))}><LiveSample sample={sample} brand={brandName} /></RatingCard>)}</div>}
          <label className={`${css.field} block`}><span className="mb-3 block text-sm font-semibold">Anything to add about this section?</span><textarea className={css.input} maxLength={4000} value={notes[sectionNoteKey(section.id)] ?? ''} onChange={(event) => update((current) => setNote(current, sectionNoteKey(section.id), event.target.value))} /></label>
        </fieldset>
      </> : <InterviewSummary answers={draft.answers} templates={templates.data ?? []} onEdit={navigate} />}
    </div></div>
    <footer className={css.footer}><div className={css.footerInner}><button type="button" className={css.button} disabled={index === 0 || action.busy} onClick={() => navigate(index - 1)}>Back</button>
      <Dialog.Root open={stepsOpen} onOpenChange={setStepsOpen}><Dialog.Trigger asChild><button className={css.button} aria-label="Jump to a section">{complete.answered}/13 answered</button></Dialog.Trigger><Dialog.Portal container={root.current}>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/80" /><Dialog.Content className={`${css.field} fixed inset-x-4 top-1/2 z-[61] mx-auto max-h-[85dvh] max-w-lg -translate-y-1/2 overflow-y-auto`}>
          <Dialog.Title className="text-xl font-semibold">Your sections</Dialog.Title><Dialog.Description className={css.hint}>Jump to any section. Your answers save as you go.</Dialog.Description>
          {sections.map((item, i) => <button type="button" key={item.id} className={css.button} aria-current={i === index ? 'step' : undefined} onClick={() => navigate(i)}>{i + 1}. {item.title}{complete.bySection[i].answered ? ' ✓' : ''}</button>)}<button className={css.button} onClick={() => navigate(13)}>Review your picks</button><Dialog.Close className={css.button}>Close sections</Dialog.Close>
        </Dialog.Content></Dialog.Portal></Dialog.Root>
      <button type="button" className={`${css.button} ${css.primary}`} disabled={action.busy} onClick={() => section ? navigate(index + 1) : submit()}>{action.busy ? 'Please wait...' : !section ? 'Build my style' : index === 12 ? 'Review picks' : 'Next'}</button>
    </div></footer>
  </div>
}
