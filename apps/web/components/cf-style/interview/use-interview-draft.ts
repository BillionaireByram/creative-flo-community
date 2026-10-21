'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { patchInterview } from '../api'
import type { AnswersPatch, InterviewAnswers } from '../types'
import { applyPatch, diffAnswers, hasPatch, normalize, same } from './logic'

export const draftStorageKey = (id: string) => `cf-style-interview:${id}`
function recover(id: string, server: InterviewAnswers): InterviewAnswers {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(draftStorageKey(id)) ?? 'null')
    if (raw && typeof raw === 'object' && 'pending' in raw && raw.pending && typeof raw.pending === 'object' && !Array.isArray(raw.pending)) {
      return applyPatch(server, raw.pending as AnswersPatch)
    }
  } catch { /* Storage can be unavailable in private browsing. */ }
  return server
}

/** Saves are serialized. A late response never replaces a newer local edit. */
export function useInterviewDraft(id: string, serverAnswers: Partial<InterviewAnswers>, editable = true) {
  const initial = useMemo(() => normalize(serverAnswers), [serverAnswers])
  const [answers, setAnswers] = useState(() => editable ? recover(id, initial) : initial)
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const current = useRef(answers)
  const saved = useRef(initial)
  const server = useRef(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flight = useRef<Promise<boolean> | null>(null)
  const active = useRef(true)
  const allowed = useRef(editable)
  const failures = useRef(0)
  allowed.current = editable
  const cancel = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null }, [])
  const persist = useCallback(() => {
    try {
      const pending = diffAnswers(saved.current, current.current)
      if (hasPatch(pending)) localStorage.setItem(draftStorageKey(id), JSON.stringify({ pending }))
      else localStorage.removeItem(draftStorageKey(id))
      if (current.current.progress) localStorage.setItem(`${draftStorageKey(id)}:progress`, JSON.stringify(current.current.progress))
    } catch { /* The in-memory queue still saves when storage is unavailable. */ }
  }, [id])
  const flushRef = useRef<() => Promise<boolean>>(() => Promise.resolve(true))
  const flush = useCallback((): Promise<boolean> => {
    cancel()
    if (flight.current) return flight.current
    if (!allowed.current) return Promise.resolve(true)
    const run = async () => {
      while (true) {
        const snapshot = current.current
        const patch = diffAnswers(saved.current, snapshot)
        if (!hasPatch(patch)) {
          if (active.current) setStatus('saved')
          persist()
          return true
        }
        if (active.current) setStatus('saving')
        try { await patchInterview(id, patch) }
        catch {
          persist()
          if (active.current) {
            setStatus('error')
            const delay = Math.min(1000 * 2 ** failures.current++, 30000)
            timer.current = setTimeout(() => { void flushRef.current() }, delay)
          }
          return false
        }
        saved.current = applyPatch(saved.current, patch)
        failures.current = 0
        persist()
      }
    }
    flight.current = run().finally(() => { flight.current = null })
    return flight.current
  }, [cancel, id, persist])
  flushRef.current = flush
  const replace = useCallback((next: InterviewAnswers) => {
    if (!allowed.current) return
    current.current = next
    setAnswers(next)
    persist()
    setStatus('saving')
    cancel()
    timer.current = setTimeout(() => { void flushRef.current() }, 700)
  }, [cancel, persist])
  /** Changes the answers from the latest local state, so quick edits never overwrite each other. */
  const update = useCallback((change: (answers: InterviewAnswers) => InterviewAnswers) => { replace(change(current.current)) }, [replace])
  const setSection = useCallback((section: number) => {
    replace({ ...current.current, progress: { section, updated: new Date().toISOString() } })
  }, [replace])

  useEffect(() => {
    if (same(server.current, initial)) return
    server.current = initial
    if (flight.current) return
    const pending = diffAnswers(saved.current, current.current)
    saved.current = initial
    const next = applyPatch(initial, pending)
    current.current = next
    setAnswers(next)
    persist()
  }, [initial, persist])
  useEffect(() => {
    active.current = true
    if (editable && hasPatch(diffAnswers(saved.current, current.current))) {
      setStatus('saving')
      timer.current = setTimeout(() => { void flushRef.current() }, 700)
    }
    const hide = () => { persist(); void flushRef.current() }
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (allowed.current && hasPatch(diffAnswers(saved.current, current.current))) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('pagehide', hide)
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      active.current = false
      cancel()
      persist()
      window.removeEventListener('pagehide', hide)
      window.removeEventListener('beforeunload', beforeUnload)
      void flushRef.current()
    }
  }, [cancel, editable, persist])
  return { answers, update, replace, setSection, flush, status }
}
