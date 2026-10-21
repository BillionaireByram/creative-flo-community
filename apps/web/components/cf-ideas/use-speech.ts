'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface RecognitionResult {
  isFinal: boolean
  [index: number]: { transcript: string }
}

interface RecognitionEvent {
  results: ArrayLike<RecognitionResult>
}

interface Recognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition
  webkitSpeechRecognition?: new () => Recognition
}

function recognitionConstructor() {
  if (typeof window === 'undefined') return undefined
  const speechWindow = window as SpeechWindow
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
}

export function isSpeechSupported(): boolean {
  return !!recognitionConstructor()
}

export interface SpeechControls {
  supported: boolean
  listening: boolean
  error: string | null
  start(): void
  stop(): void
  toggle(): void
}

function detach(recognition: Recognition) {
  recognition.onresult = null
  recognition.onerror = null
  recognition.onend = null
  recognition.onstart = null
}

function speechError(code: string): string | null {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access is blocked. Allow it in your browser settings.'
    case 'no-speech': return "I didn't catch that. Try again."
    case 'audio-capture': return 'No microphone found.'
    case 'aborted': return null
    default: return 'Voice input stopped. Try again.'
  }
}

export function useSpeech(options: {
  onTranscript: (text: string, isFinal: boolean) => void
  lang?: string
}): SpeechControls {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<Recognition | null>(null)
  const listeningRef = useRef(false)
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    setSupported(isSpeechSupported())
    return () => {
      listeningRef.current = false
      const recognition = recognitionRef.current
      recognitionRef.current = null
      if (recognition) {
        detach(recognition)
        recognition.abort()
      }
    }
  }, [])

  const start = useCallback(() => {
    if (listeningRef.current) return
    const Constructor = recognitionConstructor()
    if (!Constructor) return
    setError(null)
    try {
      // A new instance gives each start a fresh result list. Late events from
      // the previous session must not end or rewrite the current dictation.
      if (recognitionRef.current) {
        detach(recognitionRef.current)
        recognitionRef.current.abort()
      }
      const recognition = new Constructor()
      recognitionRef.current = recognition
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = optionsRef.current.lang || navigator.language || 'en-US'
      recognition.onresult = ({ results }) => {
        if (!results.length) return
        // The browser's list contains all final results in this session and
        // the current interim results. Rebuild it so revisions do not repeat.
        const text = Array.from(results, (result) => result[0].transcript.trim())
          .filter(Boolean).join(' ').trim()
        optionsRef.current.onTranscript(text, results[results.length - 1].isFinal)
      }
      recognition.onstart = () => {
        listeningRef.current = true
        setListening(true)
      }
      recognition.onend = () => {
        listeningRef.current = false
        setListening(false)
      }
      recognition.onerror = (event) => {
        listeningRef.current = false
        setListening(false)
        setError(speechError(event.error))
      }
      // Lock synchronously, including the interval before native onstart.
      listeningRef.current = true
      setListening(true)
      recognition.start()
    } catch {
      if (recognitionRef.current) detach(recognitionRef.current)
      listeningRef.current = false
      setListening(false)
      setError('Voice input stopped. Try again.')
    }
  }, [])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const toggle = useCallback(() => {
    if (listeningRef.current) stop()
    else start()
  }, [start, stop])

  return { supported, listening, error, start, stop, toggle }
}

export function useDictation(
  value: string,
  onChange: (next: string) => void,
  options?: { lang?: string },
): SpeechControls {
  const base = useRef(value)
  const speech = useSpeech({
    lang: options?.lang,
    onTranscript: (text) => onChange(base.current.trim() ? `${base.current.trimEnd()} ${text}` : text),
  })
  const { listening, start: startSpeech, stop } = speech
  const start = useCallback(() => {
    if (listening) return
    base.current = value
    startSpeech()
  }, [listening, value, startSpeech])
  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  return { ...speech, start, toggle }
}
