'use client'

import { BrandPage } from '@/components/cf-style/brand-page'
import { StyleHome } from '@/components/cf-style/style-home'

export default function Page({ params }: { params: { brand: string } }) {
  return <BrandPage slug={params.brand}>{(brand) => <StyleHome brand={brand} />}</BrandPage>
}
