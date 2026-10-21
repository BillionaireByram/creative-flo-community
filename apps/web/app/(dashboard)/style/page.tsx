'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { BrandSwitcher } from '@/components/cf-dashboard/brand-switcher'
import { styleUrl, useBrands } from '@/components/cf-style/use-style'
import { ErrorState, Loading, actionClass } from '@/components/cf-style/ui'

function StyleLanding() {
  const router = useRouter()
  const params = useSearchParams()
  const { data, error, mutate } = useBrands()
  const selected = data?.find((brand) => brand.brand === params.get('brand')) ?? data?.[0]
  useEffect(() => { if (selected) router.replace(styleUrl(selected.brand)) }, [router, selected])
  if (error) return <ErrorState retry={() => { void mutate() }}>Could not load your brands.</ErrorState>
  if (!data) return <Loading label="Loading your brands..." />
  if (!selected) return <div className="space-y-3 p-4"><h1 className="text-xl font-semibold">No brands linked yet</h1><p className="text-sm text-text-secondary">Link a project to a brand to build your editing style.</p></div>
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Style Studio</h1>{data.length > 1 && <BrandSwitcher brands={data} value={selected.brand} onChange={(brand) => router.replace(styleUrl(brand))} />}<Link href={styleUrl(selected.brand)} className={actionClass}>Open {selected.project_name} styles</Link></div>
}
export default function StylePage() { return <Suspense fallback={<Loading />}><StyleLanding /></Suspense> }
