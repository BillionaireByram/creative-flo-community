import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MobileCommentSheet } from '../mobile-comment-sheet'

class VisualViewport extends EventTarget {
  offsetTop = 0
  constructor(public height: number) { super() }
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('review composer keyboard clearance', () => {
  it.each([844, 1180, 820])('keeps the expanded composer above a keyboard in a %ipx viewport', (height) => {
    vi.stubGlobal('innerHeight', height)
    const viewport = new VisualViewport(height)
    vi.stubGlobal('visualViewport', viewport)
    render(<MobileCommentSheet state="full" onStateChange={vi.fn()} onHeightChange={vi.fn()}
      commentCount={0} isPlaying={false} onTogglePlay={vi.fn()} currentTime=""
      lockedToCompose={false} composer={<textarea aria-label="Comment composer" />}>
      <div>Comments</div>
    </MobileCommentSheet>)
    act(() => {
      viewport.height = height - 300
      viewport.offsetTop = 20
      viewport.dispatchEvent(new Event('resize'))
    })
    const sheet = screen.getByTestId('mobile-comment-sheet')
    expect(sheet).toHaveStyle({ bottom: '280px', maxHeight: `${height - 280}px` })
    expect(screen.getByLabelText('Comment composer')).toBeInTheDocument()
    act(() => {
      viewport.height = height
      viewport.offsetTop = 0
      viewport.dispatchEvent(new Event('scroll'))
    })
    expect(sheet).toHaveStyle({ bottom: '0px' })
  })
})
