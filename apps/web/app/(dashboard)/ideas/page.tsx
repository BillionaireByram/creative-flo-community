'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { Lightbulb } from 'lucide-react'
import { api } from '@/lib/api'
import { usePageTitle } from '@/hooks/use-page-title'
import { IdeasWorkspace } from '@/components/cf-ideas/ideas-workspace'
import { actionClass, fieldClass } from '@/components/cf-ideas/styles'
import type { Brand } from '@/components/cf-ideas/types'

function IdeasPageContent() {
  usePageTitle('Ideas & Scripts')
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: brands, error, isLoading, mutate } = useSWR<Brand[]>('/cf/brands', () => api.get<Brand[]>('/cf/brands'))
  const requested = searchParams.get('brand')
  const selected = brands?.find((brand) => brand.brand === requested) ?? brands?.[0]
  const brandSlug = selected?.brand

  useEffect(() => {
    if (brandSlug && requested !== brandSlug) {
      const params = new URLSearchParams(searchParams.toString())
      params.set('brand', brandSlug)
      router.replace(`/ideas?${params.toString()}`, { scroll: false })
    }
  }, [brandSlug, requested, router, searchParams])

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Ideas &amp; Scripts</h1>
          <p className="mt-1 text-sm text-text-tertiary">Catch the idea. Find the story. Get ready to shoot.</p>
        </div>
        {selected && <label className="flex items-center gap-3 text-sm text-text-secondary">
          <span className="font-mono text-[10px]">Brand</span>
          <select className={fieldClass} value={selected.brand} onChange={(event) => {
            const params = new URLSearchParams(searchParams.toString())
            params.set('brand', event.target.value)
            router.replace(`/ideas?${params.toString()}`, { scroll: false })
          }}>
            {brands?.map((brand) => <option key={brand.brand} value={brand.brand}>{brand.brand === 'demo' ? 'Sample Creator' : brand.project_name}</option>)}
          </select>
        </label>}
      </header>
      {isLoading && <p role="status" className="py-10 text-sm text-text-tertiary">Loading brands…</p>}
      {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-text-secondary">
        <p>Couldn&apos;t load your brands.</p><button type="button" className={actionClass} onClick={() => { void mutate().catch(() => undefined) }}>Retry</button>
      </div>}
      {brands?.length === 0 && <div className="space-y-3 rounded-xl border border-border bg-bg-secondary p-8 text-center">
        <Lightbulb className="mx-auto h-8 w-8 text-accent" aria-hidden="true" />
        <h2 className="text-base font-medium text-text-primary">A place for your next story</h2>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-text-secondary">Link a project to a brand to start collecting ideas and writing scripts. Your project owner can set this up.</p>
      </div>}
      {selected && <IdeasWorkspace key={selected.brand} brand={selected} />}
    </div>
  )
}

export default function IdeasPage() {
  return <Suspense fallback={<p role="status" className="p-4 text-sm text-text-tertiary md:p-6">Loading ideas…</p>}><IdeasPageContent /></Suspense>
}
