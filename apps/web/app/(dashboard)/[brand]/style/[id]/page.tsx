'use client'

import { BrandPage } from '@/components/cf-style/brand-page'
import { StyleDetail } from '@/components/cf-style/style-detail'

export default function Page({ params }: { params: { brand: string; id: string } }) {
  return <BrandPage slug={params.brand}>{(brand) => <StyleDetail brand={brand} id={params.id} />}</BrandPage>
}
