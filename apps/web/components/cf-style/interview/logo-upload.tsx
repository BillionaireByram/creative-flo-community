'use client'

import { useState } from 'react'
import { useUploadStore } from '@/stores/upload-store'
import type { Brand } from '../types'
import css from './interview.module.css'

export function LogoUpload({ brand, value, uploadId, onUpload }: { brand: Brand; value?: string; uploadId?: string; onUpload: (id: string) => void }) {
  const [error, setError] = useState<string | null>(null)
  const upload = useUploadStore((state) => state.files.find((file) => file.id === uploadId))
  const startUpload = useUploadStore((state) => state.startUpload)
  return <div className={css.field}><label htmlFor="style-logo">Logo upload</label><p className={css.hint}>A PNG with a transparent background works best. Your logo is saved in this brand&apos;s project.</p>
    <input id="style-logo" className={css.input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => {
      const file = event.target.files?.[0]
      if (!file) return
      setError(null)
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) { setError('Choose a PNG, JPEG, WebP or SVG image.'); return }
      onUpload(startUpload(file, brand.project_id, `${brand.project_name} logo`, brand.project_name))
      event.target.value = ''
    }} />
    {upload && <p role="status" className={css.hint}>{upload.status === 'complete' || upload.status === 'processing' ? 'Logo uploaded' : upload.status === 'failed' ? 'Logo upload failed. Choose the file again to retry.' : `Uploading logo: ${Math.round(upload.progress)}%`}</p>}
    {!upload && value && <p className={css.hint}>Logo saved in your brand project.</p>}{error && <p role="alert" className={css.error}>{error}</p>}
  </div>
}
