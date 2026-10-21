'use client'

import { BrandPage } from '@/components/cf-style/brand-page'
import { InterviewPage } from '@/components/cf-style/interview/interview'

export default function Page({ params }: { params: { brand: string; id: string } }) {
  return <BrandPage slug={params.brand} interview>{(brand) => <InterviewPage brand={brand} id={params.id} />}</BrandPage>
}
