'use client'

import * as React from 'react'
import { ShootApp } from '@/components/cf-shoot/shoot-app'
import { usePageTitle } from '@/hooks/use-page-title'

export default function ShootPage() {
  usePageTitle('Shoot')

  return (
    <React.Suspense
      fallback={
        <div className="p-4 font-sans sm:p-6" role="status">
          <p className="text-sm text-text-secondary">Getting Shoot ready…</p>
        </div>
      }
    >
      <ShootApp />
    </React.Suspense>
  )
}
