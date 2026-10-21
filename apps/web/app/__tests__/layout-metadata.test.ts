import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/branding-server', () => ({ getServerBranding: async () => null }))

import { generateMetadata } from '../layout'

describe('root layout metadata', () => {
  it('names the creator in the author and generator meta tags', async () => {
    const metadata = await generateMetadata()
    expect(metadata.authors).toEqual([{ name: 'Byram Smith Jr. (DigitalFlo)', url: 'https://mydigitalflo.io' }])
    expect(metadata.generator).toBe('Creative Flo, created by Byram Smith Jr. A DigitalFlo product.')
  })
})
