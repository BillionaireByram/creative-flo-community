import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FeedbackPill } from '@/components/review/feedback-pill'

describe('FeedbackPill', () => {
  it('renders an accessible link to the completed version', () => {
    render(<FeedbackPill run={{ id: 'r', status: 'done', progress: null, attempt: 1, new_version_number: 4 }}
      versionHref={(n) => `/projects/p/assets/a?version=${n}`} />)
    expect(screen.getByRole('link', { name: 'Fixed in v4' })).toHaveAttribute('href', '/projects/p/assets/a?version=4')
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
  })
})
