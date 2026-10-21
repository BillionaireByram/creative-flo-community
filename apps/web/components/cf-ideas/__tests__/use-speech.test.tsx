import { useState } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isSpeechSupported, useDictation, useSpeech } from '../use-speech'

interface FakeResult {
  isFinal: boolean
  0: { transcript: string }
}

class FakeRecognition {
  static instances: FakeRecognition[] = []
  continuous = false
  interimResults = false
  lang = ''
  onresult: ((event: { results: FakeResult[] }) => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()
  abort = vi.fn()

  constructor() { FakeRecognition.instances.push(this) }

  result(...parts: Array<[string, boolean]>) {
    this.onresult?.({ results: parts.map(([transcript, isFinal]) => ({ 0: { transcript }, isFinal })) })
  }
}

type TestSpeechWindow = Window & {
  SpeechRecognition?: typeof FakeRecognition
  webkitSpeechRecognition?: typeof FakeRecognition
}

const speechWindow = window as TestSpeechWindow
const latest = () => FakeRecognition.instances[FakeRecognition.instances.length - 1]

beforeEach(() => {
  FakeRecognition.instances = []
  speechWindow.SpeechRecognition = FakeRecognition
})

afterEach(() => {
  cleanup()
  delete speechWindow.SpeechRecognition
  delete speechWindow.webkitSpeechRecognition
  vi.restoreAllMocks()
})

describe('useSpeech', () => {
  it('starts unsupported for SSR, then detects the standard constructor', () => {
    const renders: boolean[] = []
    const { result } = renderHook(() => {
      const speech = useSpeech({ onTranscript: vi.fn() })
      renders.push(speech.supported)
      return speech
    })
    expect(renders[0]).toBe(false)
    expect(result.current.supported).toBe(true)
    expect(isSpeechSupported()).toBe(true)
  })

  it('supports browsers that only expose webkitSpeechRecognition', () => {
    delete speechWindow.SpeechRecognition
    speechWindow.webkitSpeechRecognition = FakeRecognition
    const { result } = renderHook(() => useSpeech({ onTranscript: vi.fn() }))
    expect(isSpeechSupported()).toBe(true)
    expect(result.current.supported).toBe(true)
    act(() => result.current.start())
    expect(latest().start).toHaveBeenCalledOnce()
  })

  it('remains unsupported and safely ignores start when neither exists', () => {
    delete speechWindow.SpeechRecognition
    const { result } = renderHook(() => useSpeech({ onTranscript: vi.fn() }))
    expect(result.current.supported).toBe(false)
    expect(isSpeechSupported()).toBe(false)
    act(() => result.current.toggle())
    expect(result.current.listening).toBe(false)
    expect(FakeRecognition.instances).toHaveLength(0)
  })

  it('enables continuous interim input and guards repeated starts before onstart', () => {
    const { result } = renderHook(() => useSpeech({ onTranscript: vi.fn() }))
    act(() => { result.current.start(); result.current.start() })
    expect(FakeRecognition.instances).toHaveLength(1)
    expect(latest().continuous).toBe(true)
    expect(latest().interimResults).toBe(true)
    expect(latest().lang).toBe(navigator.language || 'en-US')
    expect(latest().start).toHaveBeenCalledOnce()
    expect(result.current.listening).toBe(true)
    act(() => latest().onstart?.())
    expect(result.current.listening).toBe(true)
  })

  it('uses the requested language and falls back to en-US for an empty browser language', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('')
    const { result, rerender } = renderHook(({ lang }: { lang?: string }) => useSpeech({ onTranscript: vi.fn(), lang }), {
      initialProps: { lang: undefined as string | undefined },
    })
    act(() => result.current.start())
    expect(latest().lang).toBe('en-US')
    act(() => latest().onend?.())
    rerender({ lang: 'es-CO' })
    act(() => result.current.start())
    expect(latest().lang).toBe('es-CO')
  })

  it('replaces interim words, retains session finals, and uses the latest callback', () => {
    const first = vi.fn()
    const next = vi.fn()
    const { result, rerender } = renderHook(({ onTranscript }) => useSpeech({ onTranscript }), {
      initialProps: { onTranscript: first },
    })
    act(() => result.current.start())
    act(() => latest().result(['  First guess ', false]))
    expect(first).toHaveBeenLastCalledWith('First guess', false)
    rerender({ onTranscript: next })
    act(() => latest().result([' First thought ', true], [' Next ', false]))
    expect(next).toHaveBeenLastCalledWith('First thought Next', false)
    act(() => latest().result([' First thought ', true], [' Next thought ', true]))
    expect(next).toHaveBeenLastCalledWith('First thought Next thought', true)
    expect(first).toHaveBeenCalledOnce()
    act(() => latest().onend?.())
    act(() => result.current.start())
    act(() => latest().result(['New session', true]))
    expect(next).toHaveBeenLastCalledWith('New session', true)
  })

  it('toggles stop and clears listening on end', () => {
    const { result } = renderHook(() => useSpeech({ onTranscript: vi.fn() }))
    act(() => result.current.toggle())
    act(() => result.current.toggle())
    expect(latest().stop).toHaveBeenCalledOnce()
    act(() => latest().onend?.())
    expect(result.current.listening).toBe(false)
  })

  it.each([
    ['not-allowed', 'Microphone access is blocked. Allow it in your browser settings.'],
    ['service-not-allowed', 'Microphone access is blocked. Allow it in your browser settings.'],
    ['no-speech', "I didn't catch that. Try again."],
    ['audio-capture', 'No microphone found.'],
    ['network', 'Voice input stopped. Try again.'],
    ['aborted', null],
  ] as const)('handles %s and stops listening', (code, message) => {
    const { result } = renderHook(() => useSpeech({ onTranscript: vi.fn() }))
    act(() => result.current.start())
    act(() => latest().onerror?.({ error: code }))
    expect(result.current.error).toBe(message)
    expect(result.current.listening).toBe(false)
    act(() => result.current.start())
    expect(result.current.error).toBeNull()
  })

  it('handles a throwing native start without leaving the microphone busy', () => {
    class ThrowingRecognition extends FakeRecognition {
      start = vi.fn(() => { throw new Error('Native start failed') })
    }
    speechWindow.SpeechRecognition = ThrowingRecognition
    const { result } = renderHook(() => useSpeech({ onTranscript: vi.fn() }))
    act(() => result.current.start())
    expect(result.current.listening).toBe(false)
    expect(result.current.error).toBe('Voice input stopped. Try again.')
  })

  it('detaches all handlers and aborts on unmount', () => {
    const onTranscript = vi.fn()
    const { result, unmount } = renderHook(() => useSpeech({ onTranscript }))
    act(() => result.current.start())
    const recognition = latest()
    unmount()
    expect(recognition.abort).toHaveBeenCalledOnce()
    expect(recognition.onresult).toBeNull()
    expect(recognition.onerror).toBeNull()
    expect(recognition.onend).toBeNull()
    expect(recognition.onstart).toBeNull()
    recognition.result(['Late words', true])
    expect(onTranscript).not.toHaveBeenCalled()
  })
})

describe('useDictation', () => {
  it('appends to the captured base without duplicating interim text, and recaptures on restart', () => {
    const { result } = renderHook(() => {
      const [value, setValue] = useState('  My story  ')
      const speech = useDictation(value, setValue, { lang: 'en-GB' })
      return { value, speech }
    })
    act(() => result.current.speech.start())
    expect(latest().lang).toBe('en-GB')
    act(() => latest().result(['a first', false]))
    expect(result.current.value).toBe('  My story a first')
    act(() => result.current.speech.start())
    act(() => latest().result(['a final thought', true]))
    expect(result.current.value).toBe('  My story a final thought')
    act(() => result.current.speech.toggle())
    expect(latest().stop).toHaveBeenCalledOnce()
    act(() => latest().onend?.())
    act(() => result.current.speech.toggle())
    act(() => latest().result(['and another', true]))
    expect(result.current.value).toBe('  My story a final thought and another')
  })

  it('replaces a blank base and calls the latest onChange', () => {
    const first = vi.fn()
    const next = vi.fn()
    const { result, rerender } = renderHook(({ onChange }) => useDictation('   ', onChange), {
      initialProps: { onChange: first },
    })
    act(() => result.current.start())
    rerender({ onChange: next })
    act(() => latest().result(['Hello', true]))
    expect(first).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith('Hello')
  })
})
