import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLeaveGuard } from '../use-leave-guard'

beforeEach(() => { vi.spyOn(window, 'confirm').mockReturnValue(false) })
afterEach(() => { cleanup(); document.body.replaceChildren(); vi.restoreAllMocks() })

function anchor(attributes: Record<string, string> = {}) {
  const link = document.createElement('a')
  link.href = '/projects'
  for (const [name, value] of Object.entries(attributes)) link.setAttribute(name, value)
  document.body.append(link)
  return link
}
// Observe whether capture allowed the event to reach the target, then suppress
// jsdom's unsupported navigation without masking the guard's capture behavior.
function click(target: Node, options: MouseEventInit = {}, prevented = false) {
  const reached = vi.fn((event: Event) => event.preventDefault())
  target.addEventListener('click', reached)
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...options })
  if (prevented) event.preventDefault()
  target.dispatchEvent(event)
  target.removeEventListener('click', reached)
  return { reached, event }
}

describe('leave guard capture exclusions', () => {
  it('finds anchors through text and SVG targets before any target listener', () => {
    renderHook(() => useLeaveGuard(true, 'Leave?'))
    const link = anchor()
    const text = document.createTextNode('Projects')
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    svg.append(path)
    link.append(text, svg)
    for (const target of [text, path]) {
      const { reached, event } = click(target)
      expect(event.defaultPrevented).toBe(true)
      expect(reached).not.toHaveBeenCalled()
    }
    expect(window.confirm).toHaveBeenCalledTimes(2)
  })

  it('lets confirmed navigation through and removes its listeners when inactive', () => {
    const { rerender } = renderHook(({ active }) => useLeaveGuard(active, 'Leave?'), { initialProps: { active: true } })
    vi.mocked(window.confirm).mockReturnValue(true)
    expect(click(anchor()).reached).toHaveBeenCalledTimes(1)
    expect(window.confirm).toHaveBeenCalledTimes(1)
    rerender({ active: false })
    expect(click(anchor()).reached).toHaveBeenCalledTimes(1)
    expect(window.confirm).toHaveBeenCalledTimes(1)
  })

  it('ignores downloads, other contexts, external URLs, same-page URLs and non-navigation clicks', () => {
    renderHook(() => useLeaveGuard(true, 'Leave?'))
    const exclusions: Array<Record<string, string>> = [
      { download: 'take.mp4' }, { target: '_blank' }, { target: 'preview' },
      { href: 'https://other.example/projects' }, { href: window.location.href },
      { href: `${window.location.pathname}${window.location.search}#chapter` },
    ]
    for (const attrs of exclusions) expect(click(anchor(attrs)).reached).toHaveBeenCalledTimes(1)
    for (const options of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      expect(click(anchor(), options).reached).toHaveBeenCalledTimes(1)
    }
    expect(click(anchor(), {}, true).reached).toHaveBeenCalledTimes(1)
    const button = document.createElement('button')
    document.body.append(button)
    expect(click(button).reached).toHaveBeenCalledTimes(1)
    expect(window.confirm).not.toHaveBeenCalled()
  })
})
