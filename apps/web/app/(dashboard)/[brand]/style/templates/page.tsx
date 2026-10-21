'use client'

import { BrandPage } from '@/components/cf-style/brand-page'
import { TemplatesGallery } from '@/components/cf-style/templates-gallery'

export default function Page({ params }: { params: { brand: string } }) {
  return <BrandPage slug={params.brand}>{(brand) => <TemplatesGallery brand={brand} />}</BrandPage>
}
