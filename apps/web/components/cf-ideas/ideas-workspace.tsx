'use client'

import { useCallback, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import useSWR from 'swr'
import { Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { IdeasBoard } from './board'
import { IdeaEditor } from './idea-editor'
import { actionClass, fieldClass } from './styles'
import type { BoardStatus, Brand, Idea } from './types'

export function IdeasWorkspace({ brand }: { brand: Brand }) {
  const key = `/cf/ideas?brand=${encodeURIComponent(brand.brand)}`
  const { data: ideas, error: loadError, isLoading, mutate } = useSWR<Idea[]>(key, () => api.get<Idea[]>(key))
  const canEdit = brand.role === 'owner' || brand.role === 'editor'
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const createPending = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Idea | null>(null)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const pendingMoves = useRef(new Set<string>())

  const recordSaved = useCallback((saved: Idea) => {
    // Publish the server receipt immediately; a list refresh failure must not
    // turn a successful write into a save error or trigger duplicate creation.
    void mutate((current) => current?.some((row) => row.id === saved.id)
      ? current.map((row) => row.id === saved.id ? saved : row)
      : [...(current ?? []), saved], { revalidate: false })
      .then(() => mutate()).catch(() => undefined)
  }, [mutate])

  async function createIdea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canEdit || !title.trim() || createPending.current) return
    createPending.current = true
    setCreating(true)
    setError(null)
    try {
      const idea = await api.post<Idea>('/cf/ideas', { brand: brand.brand, title: title.trim() })
      recordSaved(idea)
      setTitle('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add this idea.')
    } finally {
      createPending.current = false
      setCreating(false)
    }
  }

  async function moveIdea(idea: Idea, status: BoardStatus) {
    if (!canEdit || pendingMoves.current.has(idea.id)) return
    pendingMoves.current.add(idea.id)
    setBusyIds(new Set(pendingMoves.current))
    setError(null)
    try {
      recordSaved(await api.patch<Idea>(`/cf/ideas/${idea.id}`, { status }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not move this idea.')
    } finally {
      pendingMoves.current.delete(idea.id)
      setBusyIds(new Set(pendingMoves.current))
    }
  }

  function recordDeleted(id: string) {
    void mutate((current) => current?.filter((row) => row.id !== id), { revalidate: false })
      .then(() => mutate()).catch(() => undefined)
  }

  const archived = (ideas ?? []).filter((idea) => idea.status === 'archived')

  return (
    <div className="space-y-6">
      {canEdit ? <form onSubmit={createIdea} className="flex items-end gap-2">
        <label className="block min-w-0 flex-1 space-y-2 text-sm text-text-secondary">
          <span className="sr-only">New idea title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200}
            disabled={creating} className={fieldClass} placeholder="What is your next story? Add an idea…" />
        </label>
        <button type="submit" className={`${actionClass} bg-accent-muted text-accent`} disabled={creating || !title.trim()} aria-label="Add idea">
          <Plus className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">{creating ? 'Adding…' : 'Add idea'}</span>
        </button>
      </form> : <p className="font-mono text-xs text-text-tertiary">Read only · Your team&apos;s ideas and scripts</p>}
      {error && <p role="alert" className="rounded-lg border border-border bg-bg-secondary p-3 text-sm text-[#FFB869]">{error}</p>}
      {loadError && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-text-secondary">
        <p>Couldn&apos;t load the ideas. Please try again.</p><button type="button" className={actionClass} onClick={() => { void mutate().catch(() => undefined) }}>Retry</button>
      </div>}
      <div id="ideas-board" className="scroll-mt-4">
        {isLoading ? <p role="status" className="py-10 text-sm text-text-tertiary">Loading ideas…</p>
          : ideas && <IdeasBoard ideas={ideas} canEdit={canEdit} onOpen={(idea) => { if (!pendingMoves.current.has(idea.id)) setSelected(idea) }} onMove={(idea, status) => { void moveIdea(idea, status) }} busyIds={busyIds} />}
      </div>
      {archived.length > 0 && <details className="rounded-xl border border-border bg-bg-secondary p-4">
        <summary className="cursor-pointer [@media(pointer:coarse)]:min-h-11 text-sm text-text-secondary">Archived <span className="ml-2 font-mono text-[10px]">{archived.length}</span></summary>
        <ul className="mt-3 space-y-2">
          {archived.map((idea) => <li key={idea.id}><button type="button" className="w-full [@media(pointer:coarse)]:min-h-11 break-words rounded-lg px-3 py-2 text-left text-sm text-text-secondary [@media(hover:hover)]:hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" onClick={() => setSelected(idea)}>{idea.title}</button></li>)}
        </ul>
      </details>}
      {selected && <IdeaEditor key={selected.id} idea={selected} canEdit={canEdit} onClose={() => setSelected(null)} onSaved={recordSaved} onDeleted={recordDeleted} />}
    </div>
  )
}
