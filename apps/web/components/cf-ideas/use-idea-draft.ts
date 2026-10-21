'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { Idea, IdeaDraft } from './types'

const fields = ['title', 'hook', 'angle', 'pillar', 'format', 'status', 'script', 'script_text', 'notes'] as const

function toDraft(idea: Idea): IdeaDraft {
  return {
    title: idea.title, hook: idea.hook, angle: idea.angle, pillar: idea.pillar,
    format: idea.format, status: idea.status, script: idea.script,
    script_text: idea.script_text, notes: idea.notes,
  }
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function changesSince(saved: IdeaDraft, draft: IdeaDraft): Partial<IdeaDraft> {
  return Object.fromEntries(fields.filter((key) => !same(saved[key], draft[key])).map((key) => [key, draft[key]]))
}

type SaveState = 'saved' | 'pending' | 'saving' | 'error'

/** One serialized save queue per editor. A server response cannot erase newer typing. */
export function useIdeaDraft(idea: Idea, canEdit: boolean, onSaved: (idea: Idea) => void) {
  const [draft, setDraft] = useState<IdeaDraft>(() => toDraft(idea))
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [error, setError] = useState<string | null>(null)
  const draftRef = useRef(draft)
  const savedRef = useRef(draft)
  const active = useRef(true)
  const editable = useRef(canEdit)
  const savedCallback = useRef(onSaved)
  const inFlight = useRef<Promise<boolean> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  editable.current = canEdit
  savedCallback.current = onSaved

  const cancelTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const flush = useCallback((): Promise<boolean> => {
    cancelTimer()
    if (inFlight.current) return inFlight.current
    if (!editable.current) return Promise.resolve(true)
    if (!Object.keys(changesSince(savedRef.current, draftRef.current)).length) {
      if (active.current) {
        setSaveState('saved')
        setError(null)
      }
      return Promise.resolve(true)
    }

    const save = async (): Promise<boolean> => {
      while (true) {
        const snapshot = draftRef.current
        const patch = changesSince(savedRef.current, snapshot)
        if (!Object.keys(patch).length) {
          if (active.current) {
            setSaveState('saved')
            setError(null)
          }
          return true
        }
        if (!snapshot.title.trim()) {
          if (active.current) {
            setSaveState('error')
            setError('Give this idea a title before saving.')
          }
          return false
        }
        if (active.current) {
          setSaveState('saving')
          setError(null)
        }
        let saved: Idea
        try {
          saved = await api.patch<Idea>(`/cf/ideas/${idea.id}`, patch)
        } catch (cause) {
          if (active.current) {
            setSaveState('error')
            setError(cause instanceof Error ? cause.message : 'Please try saving again.')
          }
          return false
        }
        const canonical = toDraft(saved)
        // Accept normalized server values only for fields unchanged since this
        // request began. New edits remain queued against the new saved baseline.
        const current = draftRef.current
        const merged = Object.fromEntries(fields.map((key) => [key,
          same(current[key], snapshot[key]) ? canonical[key] : current[key],
        ])) as IdeaDraft
        savedRef.current = canonical
        draftRef.current = merged
        if (active.current) setDraft(merged)
        savedCallback.current(saved)
      }
    }

    const promise = save().finally(() => { inFlight.current = null })
    inFlight.current = promise
    return promise
  }, [cancelTimer, idea.id])

  const update = useCallback((patch: Partial<IdeaDraft>) => {
    if (!editable.current) return
    const next = { ...draftRef.current, ...patch }
    draftRef.current = next
    setDraft(next)
    setError(null)
    setSaveState(!inFlight.current && !Object.keys(changesSince(savedRef.current, next)).length ? 'saved' : 'pending')
  }, [])

  useEffect(() => {
    if (canEdit && Object.keys(changesSince(savedRef.current, draft)).length) {
      timer.current = setTimeout(() => { void flush() }, 700)
    }
    return cancelTimer
  }, [canEdit, draft, flush, cancelTimer])

  const flushRef = useRef(flush)
  flushRef.current = flush
  useEffect(() => {
    active.current = true
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (inFlight.current || Object.keys(changesSince(savedRef.current, draftRef.current)).length) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      active.current = false
      window.removeEventListener('beforeunload', beforeUnload)
      // Covers navigation away from the page as well as an explicit close.
      void flushRef.current()
    }
  }, [])

  return { draft, update, flush, saveState, error }
}
