'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Archive, Plus, Trash2, Video, X } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { addBeat, moveBeat, nextStatus, prevStatus, readSeconds, removeBeat, statusLabel, teleprompterText, updateBeat, wordCount } from './script'
import { actionClass, fieldClass, shootClass } from './styles'
import { useIdeaDraft } from './use-idea-draft'
import type { Idea, IdeaDraft } from './types'

interface IdeaEditorProps {
  idea: Idea
  canEdit: boolean
  onClose: () => void
  onSaved: (idea: Idea) => void
  onDeleted: (id: string) => void
}

export function IdeaEditor({ idea, canEdit, onClose, onSaved, onDeleted }: IdeaEditorProps) {
  const { draft, update, flush, saveState, error } = useIdeaDraft(idea, canEdit, onSaved)
  const [closing, setClosing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const router = useRouter()
  const id = useId()
  const text = teleprompterText(draft.hook, draft.script, draft.script_text)
  const derivedText = teleprompterText(draft.hook, draft.script)
  const previous = prevStatus(draft.status)
  const next = nextStatus(draft.status)
  const disabled = !canEdit || closing || deleting
  const setBeats = (beats: IdeaDraft['script']['beats']) => update({ script: { ...draft.script, beats } })

  async function close() {
    if (closing || deleting || confirmDelete) return
    setClosing(true)
    if (await flush()) onClose()
    else setClosing(false)
  }

  async function deleteIdea() {
    setDeleting(true)
    setDeleteError(null)
    try {
      if (!await flush()) throw new Error('Save your changes before deleting this idea.')
      await api.delete(`/cf/ideas/${idea.id}`)
      onDeleted(idea.id)
      onClose()
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : 'Could not delete this idea.')
      throw cause
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) void close() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-bg-primary/80 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-4 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col overflow-y-auto bg-bg-primary text-text-primary md:inset-auto md:left-1/2 md:top-1/2 md:h-auto md:max-h-[calc(100dvh-2rem)] md:w-[calc(100vw-2rem)] md:max-w-4xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:border md:border-border">
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border p-4 md:px-6">
            <div className="min-w-0 space-y-1">
              <Dialog.Title className="text-lg font-semibold">Ideas &amp; Scripts</Dialog.Title>
              <Dialog.Description className="text-sm text-text-secondary">
                {canEdit ? 'Shape the story, then make it yours on camera.' : 'Read the story and script for this idea.'}
              </Dialog.Description>
              <p role="status" aria-live="polite" className="font-mono text-[10px] text-text-tertiary">
                {canEdit ? saveState === 'error' ? "Couldn't save" : saveState === 'saved' ? 'Saved' : 'Saving…' : 'Read only'}
              </p>
            </div>
            <button type="button" aria-label="Close editor" className={actionClass} onClick={() => void close()} disabled={closing || deleting}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 pb-safe [--ff-pb:2rem] md:p-6">
            {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-bg-secondary p-3 text-sm text-[#FFB869]">
              <p>{error}</p>
              <button type="button" className={actionClass} onClick={() => void flush()}>Retry save</button>
            </div>}
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('rounded-lg bg-bg-secondary px-3 py-2 font-mono text-xs', draft.status === 'ready' ? 'text-[#FFB869]' : 'text-text-secondary')}>
                {statusLabel(draft.status)}
              </span>
              {canEdit && <>
                {previous && <button type="button" disabled={disabled} className={actionClass} onClick={() => update({ status: previous })}>
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />{statusLabel(previous)}
                </button>}
                {next && <button type="button" disabled={disabled} className={actionClass} onClick={() => update({ status: next })}>
                  {statusLabel(next)}<ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>}
                {draft.status !== 'archived' && <button type="button" disabled={disabled} className={actionClass} onClick={() => update({ status: 'archived' })}>
                  <Archive className="h-4 w-4" aria-hidden="true" />Archive
                </button>}
              </>}
              {draft.status === 'ready' && <Link href={`/shoot?idea=${idea.id}`} className={shootClass}
                onClick={(event) => {
                  event.preventDefault()
                  if (closing || deleting) return
                  setClosing(true)
                  void flush().then((saved) => {
                    if (saved) router.push(`/shoot?idea=${idea.id}`)
                    else setClosing(false)
                  })
                }}>
                <Video className="h-4 w-4" aria-hidden="true" />Shoot this
              </Link>}
            </div>
            <fieldset disabled={disabled} className="min-w-0 space-y-6">
              <label className="block space-y-2 text-sm text-text-secondary">
                <span>Title</span>
                <input className={fieldClass} value={draft.title} required maxLength={200} onChange={(event) => update({ title: event.target.value })} />
              </label>
              <label className="block space-y-2 text-sm text-text-secondary">
                <span>Hook <span className="ml-2 font-mono text-[10px] text-text-tertiary">First 3 seconds</span></span>
                <textarea className={fieldClass} rows={2} maxLength={500} value={draft.hook ?? ''} placeholder="What makes someone stop and listen?" onChange={(event) => update({ hook: event.target.value })} />
              </label>
              <label className="block space-y-2 text-sm text-text-secondary">
                <span>Angle</span>
                <textarea className={fieldClass} rows={3} maxLength={20000} value={draft.angle ?? ''} placeholder="The experience, lesson, or point of view behind this story." onChange={(event) => update({ angle: event.target.value })} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-2 text-sm text-text-secondary">
                  <span>Pillar</span>
                  <input className={fieldClass} list={`${id}-pillars`} maxLength={64} value={draft.pillar ?? ''} onChange={(event) => update({ pillar: event.target.value })} />
                </label>
                <datalist id={`${id}-pillars`}><option value="Marketing" /><option value="Sales" /><option value="Fulfillment" /></datalist>
                <label className="block space-y-2 text-sm text-text-secondary">
                  <span>Format</span>
                  <input className={fieldClass} list={`${id}-formats`} maxLength={64} value={draft.format ?? ''} onChange={(event) => update({ format: event.target.value })} />
                </label>
                <datalist id={`${id}-formats`}><option value="Talking head + B-roll" /><option value="Talking head" /><option value="Voiceover + B-roll" /></datalist>
              </div>
              <section aria-labelledby={`${id}-beats`} className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div><h2 id={`${id}-beats`} className="text-sm font-medium">Story beats</h2><p className="mt-1 text-xs text-text-tertiary">One thought at a time. Write it how you would say it.</p></div>
                  <span className="font-mono text-[10px] text-text-tertiary">{draft.script.beats.length}/200</span>
                </div>
                <ol className="space-y-4">
                  {draft.script.beats.map((beat, index) => (
                    <li key={beat.id} className="space-y-3 rounded-xl border border-border bg-bg-secondary p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-text-tertiary">Beat {index + 1}</span>
                        {canEdit && <div className="flex gap-1">
                          <button type="button" className={actionClass} aria-label={`Move beat ${index + 1} up`} disabled={index === 0} onClick={() => setBeats(moveBeat(draft.script.beats, index, -1))}><ArrowUp className="h-4 w-4" aria-hidden="true" /></button>
                          <button type="button" className={actionClass} aria-label={`Move beat ${index + 1} down`} disabled={index === draft.script.beats.length - 1} onClick={() => setBeats(moveBeat(draft.script.beats, index, 1))}><ArrowDown className="h-4 w-4" aria-hidden="true" /></button>
                          <button type="button" className={actionClass} aria-label={`Delete beat ${index + 1}`} onClick={() => setBeats(removeBeat(draft.script.beats, index))}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                        </div>}
                      </div>
                      <label className="block space-y-2 text-sm text-text-secondary">
                        <span className="sr-only">Beat {index + 1} text</span>
                        <textarea className={fieldClass} rows={3} maxLength={5000} value={beat.text} placeholder="Tell this part of the story…" onChange={(event) => setBeats(updateBeat(draft.script.beats, index, { text: event.target.value }))} />
                      </label>
                      <label className="block space-y-2 text-sm text-text-secondary">
                        <span className="font-mono text-[10px]">B-roll note (optional)</span>
                        <textarea className={fieldClass} rows={2} maxLength={1000} value={beat.broll ?? ''} placeholder="What could we show here?" onChange={(event) => setBeats(updateBeat(draft.script.beats, index, { broll: event.target.value || null }))} />
                      </label>
                    </li>
                  ))}
                </ol>
                {!draft.script.beats.length && <p className="text-sm text-text-tertiary">No beats yet.</p>}
                {canEdit && <button type="button" className={actionClass} disabled={draft.script.beats.length >= 200} onClick={() => setBeats(addBeat(draft.script.beats))}><Plus className="h-4 w-4" aria-hidden="true" />Add beat</button>}
              </section>
              <label className="block space-y-2 text-sm text-text-secondary">
                <span>Call to action</span>
                <textarea className={fieldClass} rows={2} maxLength={2000} value={draft.script.cta} placeholder="What should someone do next?" onChange={(event) => update({ script: { ...draft.script, cta: event.target.value } })} />
              </label>
              <section className="space-y-3" aria-labelledby={`${id}-full-script`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label id={`${id}-full-script`} htmlFor={`${id}-script`} className="text-sm font-medium">Full script</label>
                  {canEdit && <button type="button" className={actionClass} disabled={derivedText.length > 100000} onClick={() => update({ script_text: derivedText })}>Rebuild from beats</button>}
                </div>
                <p className="text-xs leading-relaxed text-text-tertiary">Leave blank to read the hook, beats, and CTA. A full script takes their place on the teleprompter.</p>
                {derivedText.length > 100000 && <p className="text-xs text-text-secondary">Shorten the beats to rebuild a full script under 100,000 characters.</p>}
                <textarea id={`${id}-script`} className={cn(fieldClass, 'leading-relaxed')} rows={10} maxLength={100000} value={draft.script_text ?? ''} placeholder={teleprompterText(draft.hook, draft.script) || 'Your full spoken script…'} onChange={(event) => update({ script_text: event.target.value })} />
                <p className="font-mono text-[10px] text-text-tertiary">{wordCount(text)} words · Est. {readSeconds(text)} sec at 150 wpm</p>
              </section>
              <label className="block space-y-2 text-sm text-text-secondary">
                <span>Notes</span>
                <textarea className={fieldClass} rows={3} maxLength={20000} value={draft.notes ?? ''} placeholder="References, reminders, or anything for the shoot." onChange={(event) => update({ notes: event.target.value })} />
              </label>
            </fieldset>
            {canEdit && <div className="border-t border-border pt-5">
              <button type="button" className={actionClass} disabled={closing || deleting} onClick={() => { setDeleteError(null); setConfirmDelete(true) }}><Trash2 className="h-4 w-4" aria-hidden="true" />Delete idea</button>
            </div>}
          </div>
          <ConfirmDialog open={confirmDelete} onOpenChange={(open) => { if (!deleting) setConfirmDelete(open) }} title="Delete this idea?"
            description="This removes the idea and script from your prep board." confirmLabel="Delete idea" error={deleteError} loading={deleting} onConfirm={deleteIdea} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
