'use client'

import { useRef, useState } from 'react'
import useSWR from 'swr'
import type { Brand } from '@/components/cf-ideas/types'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/shared/toast'
import { api } from '@/lib/api'
import type { FolderTreeNode } from '@/types'

function findFolder(nodes: FolderTreeNode[] | undefined, id: string | null): FolderTreeNode | undefined {
  if (!nodes || !id) return undefined
  for (const node of nodes) {
    if (node.id === id) return node
    const child = findFolder(node.children, id)
    if (child) return child
  }
}

export function FeedbackReviewAll({ projectId, folderId, folderTree }: {
  projectId: string
  folderId: string | null
  folderTree?: FolderTreeNode[]
}) {
  const { data: brands, error } = useSWR<Brand[]>('/cf/brands', api.get)
  const brand = !error && Array.isArray(brands) ? brands.find((item) => item.project_id === projectId) : undefined
  const folder = findFolder(folderTree, folderId)
  const toast = useToast()
  const inFlight = useRef(false)
  const [submitting, setSubmitting] = useState(false)

  async function reviewAll() {
    if (inFlight.current || brand?.role !== 'owner') return
    inFlight.current = true
    setSubmitting(true)
    try {
      const result = await api.post<{ queued: string[]; working: string[]; nothing: number }>(
        `/cf/feedback/run-now?brand=${encodeURIComponent(brand.brand)}`,
      )
      const count = new Set([...result.queued, ...result.working]).size
      toast.info(count ? `Flo is checking ${count} ${count === 1 ? 'video' : 'videos'}` : 'No open comments right now.')
    } catch (err) {
      toast.error((err instanceof Error && err.message) || 'Flo could not check your videos. Try again.')
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  if (brand?.role !== 'owner' || !folder || !/^review$/i.test(folder.name)) return null
  return <Button type="button" variant="secondary" size="sm"
    className="h-auto min-h-11 min-w-11 max-w-full whitespace-normal py-2"
    loading={submitting} aria-busy={submitting} onClick={() => { void reviewAll() }}>
    Review all now
  </Button>
}
