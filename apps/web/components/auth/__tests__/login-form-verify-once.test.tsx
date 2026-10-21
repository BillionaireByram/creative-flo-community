import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace }) }))

const post = vi.fn()
vi.mock('@/lib/api', () => ({
  api: { post: (...args: unknown[]) => post(...args) },
  ApiError: class ApiError extends Error {
    status: number
    detail: string
    constructor(status: number, detail: string) {
      super(detail)
      this.status = status
      this.detail = detail
    }
  },
}))
vi.mock('@/lib/auth', () => ({ setTokens: vi.fn() }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: { getState: () => ({ fetchUser: vi.fn().mockResolvedValue(undefined), user: { id: 'u' } }) },
}))

import { LoginForm } from '../login-form'

async function codeScreen() {
  render(<LoginForm />)
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'b@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: /send magic code/i }))
  await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument())
  return screen.getAllByRole('textbox').filter((el) => el.getAttribute('inputmode') === 'numeric')
}

const verifyCalls = () => post.mock.calls.filter(([path]) => path === '/auth/verify-magic-code')

describe('magic code is verified exactly once (Creative Flo)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    post.mockImplementation(async (path: string) =>
      path === '/auth/verify-magic-code' ? { access_token: 'a', refresh_token: 'r', needs_password: false } : {})
  })

  it('sends the code once when the last digit auto-submits and the form submits too', async () => {
    const boxes = await codeScreen()
    '12345'.split('').forEach((d, i) => fireEvent.change(boxes[i], { target: { value: d } }))
    fireEvent.change(boxes[5], { target: { value: '6' } })
    fireEvent.submit(boxes[5].closest('form')!)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/projects'))
    expect(verifyCalls()).toHaveLength(1)
    expect(screen.queryByText(/invalid or expired/i)).not.toBeInTheDocument()
  })

  it('accepts a whole autofilled code in the first box and submits it once', async () => {
    const boxes = await codeScreen()
    expect(boxes[0]).toHaveAttribute('autocomplete', 'one-time-code')
    fireEvent.change(boxes[0], { target: { value: '654321' } })
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/projects'))
    expect(verifyCalls()).toHaveLength(1)
    expect(verifyCalls()[0][1]).toEqual({ email: 'b@example.com', code: '654321' })
  })
})
