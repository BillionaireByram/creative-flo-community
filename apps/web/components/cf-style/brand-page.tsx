'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BrandSwitcher } from '@/components/cf-dashboard/brand-switcher'
import { usePageTitle } from '@/hooks/use-page-title'
import type { Brand } from './types'
import { styleUrl, useBrands } from './use-style'
import { ErrorState, Loading, actionClass } from './ui'

export function BrandPage({ slug, children, interview = false }: { slug: string; children: (brand: Brand) => ReactNode; interview?: boolean }) {
  const router = useRouter()
  const { data, error, mutate } = useBrands()
  usePageTitle('Style')
  if (error) return <ErrorState retry={() => { void mutate() }}>Could not load your brands.</ErrorState>
  if (!data) return <Loading label="Loading your brand..." />
  const brand = data.find((item) => item.brand === slug)
  if (!brand) return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Brand not found</h1><Link className={actionClass} href="/style">Back to Style</Link></div>
  return <div className="mx-auto w-full max-w-7xl space-y-6 p-4 text-text-primary md:p-6">
    {!interview && <div className="flex flex-wrap items-center justify-between gap-3"><Link className={`${actionClass} text-accent`} href={styleUrl(slug)}>Style Studio</Link>
      {data.length > 1 && <BrandSwitcher brands={data} value={slug} onChange={(next) => router.push(styleUrl(next))} />}</div>}
    {children(brand)}
  </div>
}
