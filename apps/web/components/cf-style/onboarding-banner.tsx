'use client'

import Link from 'next/link'
import { useSSE } from '@/hooks/use-sse'
import { styleUrl, useBrands } from './use-style'

export function StyleOnboardingBanner({ projectId }: { projectId: string }) {
  const { data, error, mutate } = useBrands()
  const brand = !error && Array.isArray(data) ? data.find((item) => item.project_id === projectId) : undefined
  useSSE(brand?.project_id, { onCfStyleUpdated: (event) => { if (event.brand === brand?.brand) void mutate?.() } })
  if (brand?.style_ready !== false) return null
  return <aside className="shrink-0 border-b border-border bg-accent-muted px-4 py-3 text-sm">
    <Link href={styleUrl(brand.brand)} className="inline-flex min-h-11 items-center rounded text-text-primary underline decoration-accent underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Set up your editing style so Flo edits in your look</Link>
  </aside>
}
