'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { ReviewProvider, useReview } from '@/components/review/review-provider'
import { VideoPlayer } from '@/components/review/video-player'
import { AudioPlayer } from '@/components/review/audio-player'
import { MobileCommentSheet, PEEK_PX, type SheetState } from '@/components/review/mobile-comment-sheet'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useCoarsePointer } from '@/hooks/use-long-press'
import { useKeyboardInset } from '@/hooks/use-keyboard-inset'
import { useMediaTransport } from '@/hooks/use-media-transport'
import { ImageViewer } from '@/components/review/image-viewer'
import { AnnotationCanvas } from '@/components/review/annotation-canvas'
import { AnnotationOverlay } from '@/components/review/annotation-overlay'
import { FeedbackPill } from '@/components/review/feedback-pill'
import { FeedbackRunNow } from '@/components/review/feedback-run-now'
import { CommentPanel } from '@/components/review/comment-panel'
import { CommentInput } from '@/components/review/comment-input'
import { VersionSwitcher } from '@/components/review/version-switcher'
import { ShareDialog } from '@/components/review/share-dialog'
import { StyleOnboardingBanner } from '@/components/cf-style/onboarding-banner'
import { AssetStyleSwitcher } from '@/components/cf-style/asset-style-switcher'
import { CompareOverlay } from '@/components/review/compare/compare-overlay'
import { useReviewStore } from '@/stores/review-store'
import { useAuthStore } from '@/stores/auth-store'
import { useComments } from '@/hooks/use-comments'
import { useSSE } from '@/hooks/use-sse'
import { api } from '@/lib/api'
import { useUploadStore } from '@/stores/upload-store'
import { useBreadcrumbStore } from '@/stores/breadcrumb-store'
import { canCompare } from '@/lib/compare-time'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  Columns2,
  Upload,
  GitCompareArrows,
} from 'lucide-react'
import Link from 'next/link'
import { cn, formatTimecode } from '@/lib/utils'
import { PoweredByBadge } from '@/components/shared/powered-by-badge'
import { usePageTitle } from '@/hooks/use-page-title'
import type { Project, AssetResponse, ProjectMember, FolderTreeNode } from '@/types'

const acceptByType: Record<string, string> = {
  video: 'video/*',
  audio: 'audio/*',
  image: 'image/*',
  image_carousel: 'image/*',
}

function ReviewScreenInner({ projectId }: { projectId: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { asset, versions, isLoading, refetchComments, refetchVersions, refetchAsset } = useReview()
  const { currentVersion, isDrawingMode, focusedCommentId, playheadTime, seekTo, setFocusedCommentId, setActiveAnnotation } = useReviewStore()
  const { user } = useAuthStore()
  const startVersionUpload = useUploadStore((s) => s.startVersionUpload)
  const versionFileInputRef = useRef<HTMLInputElement>(null)
  const setExtraCrumbs = useBreadcrumbStore((s) => s.setExtraCrumbs)
  const setLabel = useBreadcrumbStore((s) => s.setLabel)
  usePageTitle(asset?.name ?? null)
  const [annotationData, setAnnotationData] = useState<Record<string, unknown> | null>(null)
  const [activeTab, setActiveTab] = useState<'comments' | 'fields'>('comments')
  // Open on a desktop-width viewport, closed on a phone. A 360px sidebar on a
  // 390px screen left roughly 30px for the video (#331). The share screen has
  // always done this; the project page never did.
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 768px)').matches,
  )

  // Below `md` the comment panel becomes a bottom sheet so the video stays in
  // view while reading or writing. A landscape phone keeps the side-by-side
  // column instead (#338): there the room is horizontal, and a sheet would eat
  // the little height there is.
  const isWide = useMediaQuery('(min-width: 768px)')
  const isLarge = useMediaQuery('(min-width: 1024px)')
  const coarse = useCoarsePointer()
  const keyboardInset = useKeyboardInset()
  const isLandscape = useMediaQuery('(orientation: landscape)')
  // Preserve the mouse layout at md; an 820px touch tablet needs the full
  // media width, so its comments use the keyboard-aware sheet until lg.
  const useSheet = (!isWide && !isLandscape) || (coarse && isWide && !isLarge)
  const [sheetState, setSheetState] = useState<SheetState>('peek')
  const [sheetHeight, setSheetHeight] = useState(PEEK_PX)
  const { isPlaying, togglePlay } = useMediaTransport()
  const reviewRootRef = useRef<HTMLDivElement>(null)

  // MUST be stable: MobileCommentSheet lists it as an effect dependency, so an
  // unstable reference would re-fire it on every render.
  const handleSheetHeight = useCallback((px: number) => setSheetHeight(px), [])

  // Drawing collapses the sheet to `compose`, which drops the comment list and
  // leaves only the composer and the drawing toolbar. Someone marking up a
  // frame is not reading older comments, and on a wide source the media is
  // short enough that the list was taking room the drawing surface needed.
  // Restored to `peek` on the way out rather than to whatever it was, so the
  // media is never left half covered by a sheet the user did not reopen.
  useEffect(() => {
    if (!useSheet) return
    setSheetState(isDrawingMode ? 'compose' : 'peek')
  }, [isDrawingMode, useSheet])

  // The sheet OVERLAYS the media, so the media has to fit in what is left above
  // it or the picture gets cropped: the stage is sized from the media's own
  // ratio (#344) and therefore has no slack to slide within, which is what made
  // the earlier translate-based version clip the top of the frame while the
  // sheet covered the bottom.
  //
  // Capping instead of shifting means the whole frame stays visible at every
  // sheet state and the picture scales rather than moves. Measure the controls
  // so the larger touch timeline and safe-area padding remain clear as well.
  useEffect(() => {
    const root = reviewRootRef.current
    if (!root) return
    if (!useSheet) {
      root.style.removeProperty('--ff-stage-max')
      return
    }
    const controls = Array.from(root.querySelectorAll('[data-review-timeline], [data-review-transport]'))
    const read = () => {
      const controlsHeight = controls.reduce((px, el) => px + el.getBoundingClientRect().height, 0)
      const fallbackControls = asset?.asset_type === 'video' ? (coarse ? 92 : 60) : 0
      const available = root.clientHeight - sheetHeight - (controlsHeight || fallbackControls)
      root.style.setProperty('--ff-stage-max', `${Math.max(80, available)}px`)
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(read)
    observer.observe(root)
    controls.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [useSheet, sheetHeight, coarse, asset?.id, asset?.asset_type, isLoading, currentVersion?.id, currentVersion?.processing_status])


  const deepLinkApplied = useRef(false)

  // Fetch folder tree to build the folder path for the breadcrumb
  const { data: folderTree } = useSWR<FolderTreeNode[]>(
    asset ? `/projects/${projectId}/folder-tree` : null,
    () => api.get<FolderTreeNode[]>(`/projects/${projectId}/folder-tree`),
  )

  // Set extra crumbs = [folder path..., asset name]
  // Don't register asset UUID as a label — use extraCrumbs for correct ordering
  useEffect(() => {
    if (!asset?.name) return

    function findPath(
      nodes: FolderTreeNode[],
      targetId: string,
      trail: { id: string; name: string }[],
    ): { id: string; name: string }[] | null {
      for (const node of nodes) {
        const next = [...trail, { id: node.id, name: node.name }]
        if (node.id === targetId) return next
        const found = findPath(node.children, targetId, next)
        if (found) return found
      }
      return null
    }

    const folderPath = asset.folder_id && folderTree
      ? (findPath(folderTree, asset.folder_id, []) ?? [])
      : []

    setExtraCrumbs([
      ...folderPath.map((f) => ({ label: f.name, href: `/projects/${projectId}?folder=${f.id}` })),
      { label: asset.name }, // asset name — no href (current page)
    ])
  }, [asset?.id, asset?.name, asset?.folder_id, folderTree, setExtraCrumbs])

  // Fetch project info for breadcrumb + register project name as label
  const { data: project } = useSWR<Project>(
    `/projects/${projectId}`,
    () => api.get<Project>(`/projects/${projectId}`),
  )
  useEffect(() => {
    if (project?.name) setLabel(projectId, project.name)
  }, [project?.name, projectId, setLabel])

  // Role-based permissions
  const { data: members } = useSWR<ProjectMember[]>(
    `/projects/${projectId}/members`,
    () => api.get<ProjectMember[]>(`/projects/${projectId}/members`),
  )
  const currentMember = members?.find((m) => m.user_id === user?.id)
  const currentRole = currentMember?.role ?? 'viewer'
  const canComment = currentRole !== 'viewer'
  const canRunFeedback = currentRole === 'owner' || currentRole === 'editor'

  // Fetch all assets for navigation (1 of N)
  const { data: allAssets } = useSWR<AssetResponse[]>(
    `/projects/${projectId}/assets`,
    () => api.get<AssetResponse[]>(`/projects/${projectId}/assets`),
  )

  const {
    comments,
    createComment,
    resolveComment,
    deleteComment,
    addReaction,
    removeReaction,
    mutate: refetchVisibleComments,
  } = useComments(asset?.id || '', currentVersion?.id || '')

  // Keep the version list live: when a new version transcodes, revalidate so it
  // appears/updates in the switcher without a hard refresh (#118). The review
  // provider's versions are plain state, not SWR, so nothing else refetches them.
  const refetchIfThisAsset = (eventAssetId: string) => {
    if (eventAssetId === asset?.id) refetchVersions()
  }
  useSSE(asset?.project_id, {
    onCfFeedbackUpdated: (d) => {
      if (d.asset_id !== asset?.id) return
      void refetchAsset()
      void refetchVersions()
      void refetchVisibleComments()
    },
    onTranscodeProgress: (d) => refetchIfThisAsset(d.asset_id),
    onTranscodeComplete: (d) => refetchIfThisAsset(d.asset_id),
    onTranscodeFailed: (d) => refetchIfThisAsset(d.asset_id),
  })

  // Transcode events are not the only thing that changes this list. Discarding
  // an upload deletes its version and produces no event at all, so the switcher
  // went on offering a version that was gone -- still labelled "Uploading",
  // which was the one thing it certainly was not.
  //
  // The store says when it has changed versions behind the panel -- a discard,
  // or a cancel, which is sent as one -- and says it after the server has
  // answered, since refetching earlier would race the request that does the
  // deleting and fetch the version back.
  const versionsRevision = useUploadStore((s) => s.versionsRevision)
  const lastVersionsRevision = useRef(versionsRevision)
  // Not gated on `asset` having loaded. The ref moves either way, so a bump
  // arriving while `GET /assets/{id}` was in flight used to be dropped for good,
  // and `refetchVersions` needs only the route's `assetId`.
  useEffect(() => {
    if (lastVersionsRevision.current === versionsRevision) return
    lastVersionsRevision.current = versionsRevision
    refetchVersions()
  }, [versionsRevision, refetchVersions])

  // Feedback completion links use version numbers; the switcher shares this store.
  const linkedVersion = searchParams.get('version')
  const appliedVersionLink = useRef<string | null>(null)
  useEffect(() => {
    if (!linkedVersion) {
      appliedVersionLink.current = null
      return
    }
    const key = `${asset?.id}:${linkedVersion}`
    if (appliedVersionLink.current === key) return
    const version = versions.find((v) => v.version_number === Number(linkedVersion))
    if (version) {
      useReviewStore.getState().setCurrentVersion(version)
      appliedVersionLink.current = key
    }
  }, [asset?.id, linkedVersion, versions])

  // Deep-link to a specific comment from notification (?commentId=...)
  // Runs once after comments are loaded — seeks to timecode, focuses comment, shows annotation
  useEffect(() => {
    const commentId = searchParams.get('commentId')
    if (!commentId || deepLinkApplied.current || comments.length === 0) return
    const target = comments.find((c: any) => c.id === commentId)
    if (!target) return
    deepLinkApplied.current = true
    setFocusedCommentId(commentId)
    setActiveTab('comments')
    if ((target as any).timecode_start !== null && (target as any).timecode_start !== undefined) {
      seekTo((target as any).timecode_start, true)
    }
    if ((target as any).annotation?.drawing_data) {
      setActiveAnnotation((target as any).annotation.drawing_data)
    }
  }, [comments, searchParams, seekTo, setFocusedCommentId, setActiveAnnotation])

  // Version-compare overlay: driven entirely by the ?compare= URL param so it
  // survives refresh/deep-link. closeCompare strips all four compare params.
  const compareOpen = Boolean(searchParams.get('compare'))
  const closeCompare = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString())
    p.delete('compare'); p.delete('mode'); p.delete('offA'); p.delete('offB')
    router.replace(`${pathname}?${p.toString()}`, { scroll: false })
  }, [router, pathname, searchParams])

  // Asset navigation
  const currentIndex = allAssets?.findIndex((a) => a.id === asset?.id) ?? -1
  const totalAssets = allAssets?.length ?? 0
  const prevAsset = currentIndex > 0 ? allAssets?.[currentIndex - 1] : null
  const nextAsset = currentIndex < totalAssets - 1 ? allAssets?.[currentIndex + 1] : null

  const navigateAsset = (assetId: string) => {
    router.push(`/projects/${projectId}/assets/${assetId}`)
  }

  // Keyboard navigation for prev/next asset
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (searchParams.get('compare')) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft' && prevAsset) {
        e.preventDefault()
        navigateAsset(prevAsset.id)
      }
      if (e.key === 'ArrowRight' && nextAsset) {
        e.preventDefault()
        navigateAsset(nextAsset.id)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [prevAsset, nextAsset, searchParams])

  if (isLoading || !asset) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <span className="text-xs text-text-tertiary">Loading asset...</span>
        </div>
      </div>
    )
  }

  const handleSubmitComment = async (
    body: string,
    timecodeStart?: number,
    timecodeEnd?: number,
    annotation?: Record<string, unknown>,
    parentId?: string,
    visibility?: string,
    mentionUserIds?: string[],
  ) => {
    await createComment(
      body,
      timecodeStart,
      timecodeEnd,
      annotation || annotationData || undefined,
      parentId,
      visibility,
      mentionUserIds,
    )
    setAnnotationData(null)
    refetchComments()
  }

  const handleSubmitReply = async (parentId: string, body: string) => {
    await createComment(body, undefined, undefined, undefined, parentId)
    refetchComments()
  }

  const versionReady = currentVersion?.processing_status === 'ready'
  const versionProcessing =
    currentVersion?.processing_status === 'processing' ||
    currentVersion?.processing_status === 'uploading'

  const renderMediaViewer = () => {
    if (!currentVersion || !versionReady) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-center px-6">
            {versionProcessing ? (
              <>
                <div className="h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">Processing asset</p>
                  <p className="text-xs text-text-tertiary mt-1">
                    This may take a few minutes depending on file size.
                  </p>
                </div>
              </>
            ) : currentVersion?.processing_status === 'failed' ? (
              <>
                <div className="h-12 w-12 rounded-full bg-status-error/10 flex items-center justify-center">
                  <Info className="h-6 w-6 text-status-error" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">Processing failed</p>
                  <p className="text-xs text-text-tertiary mt-1">
                    Try uploading a new version of this asset.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="h-12 w-12 rounded-full bg-bg-tertiary flex items-center justify-center">
                  <Info className="h-6 w-6 text-text-tertiary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">Version not ready</p>
                  <p className="text-xs text-text-tertiary mt-1">
                    This version is still being prepared.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )
    }

    switch (asset.asset_type) {
      case 'video':
        return (
          <VideoPlayer
            assetId={asset.id}
            comments={comments}
            className="flex-1 min-h-0"
            overlay={
              <>
                <AnnotationOverlay key={focusedCommentId ?? 'none'} />
                {isDrawingMode && (
                  <AnnotationCanvas
                    onSave={(data) => setAnnotationData(data)}
                  />
                )}
              </>
            }
          />
        )
      case 'audio':
        return (
          <AudioPlayer
            asset={asset}
            version={currentVersion}
            comments={comments}
            className="flex-1"
          />
        )
      case 'image':
      case 'image_carousel':
        return (
          <div className="relative flex-1 flex items-center justify-center p-4 overflow-hidden" style={useSheet ? { maxHeight: 'var(--ff-stage-max)' } : undefined}>
            <ImageViewer
              asset={asset}
              version={currentVersion as any}
              annotationCanvas={
                <>
                  <AnnotationOverlay key={focusedCommentId ?? 'none'} />
                  {isDrawingMode && (
                    <AnnotationCanvas
                      onSave={(data) => setAnnotationData(data)}
                    />
                  )}
                </>
              }
            />
          </div>
        )
      default:
        return null
    }
  }

  // The comment panel's pieces are defined once and rendered by either the
  // desktop sidebar or the mobile sheet, so the two surfaces cannot drift.
  const panelTabs = (
    <>
      {/* Tabs (Frame.io pill style) */}
      <div className="px-4 pt-3 pb-2 shrink-0">
        <div className="flex items-center bg-bg-tertiary rounded-lg p-0.5">
          <button
            onClick={() => setActiveTab('comments')}
            className={cn(
              'relative tap-target flex-1 py-1.5 text-[13px] font-medium rounded-md transition-all [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 shrink-0',
              activeTab === 'comments'
                ? 'bg-bg-hover text-text-primary shadow-sm'
                : 'text-text-tertiary [@media(hover:hover)]:hover:text-text-secondary',
            )}
          >
            Comments
          </button>
          <button
            onClick={() => setActiveTab('fields')}
            className={cn(
              'relative tap-target flex-1 py-1.5 text-[13px] font-medium rounded-md transition-all [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 shrink-0',
              activeTab === 'fields'
                ? 'bg-bg-hover text-text-primary shadow-sm'
                : 'text-text-tertiary [@media(hover:hover)]:hover:text-text-secondary',
            )}
          >
            Fields
          </button>
        </div>
      </div>
    </>
  )

  const commentPanelNode = (
    <CommentPanel
      headerActions={asset.asset_type === 'video' && canRunFeedback ? (
        <FeedbackRunNow key={asset.id} asset={asset} comments={comments}
          onRequested={() => { void refetchAsset() }} />
      ) : null}
      header={<FeedbackPill run={asset.feedback_run} onSelectVersion={(number) => {
        const version = versions.find((v) => v.version_number === number)
        if (version) useReviewStore.getState().setCurrentVersion(version)
      }} versionHref={(number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('version', String(number))
        return `${pathname}?${params}`
      }} />}
      comments={comments as any}
      currentUserId={user?.id}
      onResolve={resolveComment}
      onDelete={deleteComment}
      onAddReaction={addReaction}
      onRemoveReaction={removeReaction}
      onReply={() => {}}
      onSubmitReply={handleSubmitReply}
    />
  )

  const commentInputNode = canComment ? (
    <CommentInput
      assetId={asset.id}
      projectId={asset.project_id}
      assetType={asset.asset_type}
      onSubmit={handleSubmitComment}
      annotationData={annotationData}
      feedbackHint={asset.asset_type === 'video'}
    />
  ) : null

  const fieldsBody = (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-tertiary">Name</span>
          <span className="text-xs text-text-primary font-medium truncate ml-4">{asset.name}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-tertiary">Type</span>
          <span className="text-xs text-text-primary capitalize">{asset.asset_type.replace('_', ' ')}</span>
        </div>
        {currentVersion && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-tertiary">Version</span>
            <span className="text-xs text-text-primary">v{currentVersion.version_number}</span>
          </div>
        )}
        {currentVersion && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-tertiary">Processing</span>
            <span className={cn(
              'text-xs capitalize',
              currentVersion.processing_status === 'ready' && 'text-status-success',
              currentVersion.processing_status === 'processing' && 'text-status-warning',
              currentVersion.processing_status === 'failed' && 'text-status-error',
              currentVersion.processing_status === 'uploading' && 'text-text-tertiary',
            )}>
              {currentVersion.processing_status}
            </span>
          </div>
        )}
      </div>
    </div>
  )


  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden pl-safe pr-safe" style={{ paddingBottom: coarse && !useSheet ? keyboardInset : undefined }}>
      <StyleOnboardingBanner projectId={projectId} />
      {/* ─── Top bar (Frame.io style) ──────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border px-3 h-12 max-lg:h-auto max-lg:min-h-12 max-lg:flex-wrap max-lg:gap-y-2 max-lg:py-2 bg-bg-secondary shrink-0">
        {/* Left: back + breadcrumb */}
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <Link
            href={`/projects/${asset.project_id}`}
            aria-label="Back to project"
            className="relative tap-target flex items-center justify-center h-7 w-7 rounded-md text-text-secondary [@media(hover:hover)]:hover:text-text-primary [@media(hover:hover)]:hover:bg-bg-hover transition-colors shrink-0 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          {/* Asset name only. Truncated, so it needs a title: this is the only
              place the full name is shown, and it is the first thing the bar
              gives up when the window is narrow. */}
          <span
            className="text-[13px] text-text-primary font-medium truncate"
            title={asset.name}
          >
            {asset.name}
          </span>
        </div>

        {/* Center: asset navigation, then the credit.

            One group, not two things each centred on its own. The credit used
            to be absolutely positioned at the middle of the bar, and the
            navigator lands there too -- the blocks either side of it are both
            flex-1 -- so on any asset with a neighbour "Powered by FreeFrame"
            was drawn straight across "5 of 7", and won the hit test on the
            chevron. What is centred now is the group: with a neighbour the
            navigator therefore sits a little left of the bar's centre line,
            which is the cost of the two not overlapping. With no neighbour the
            navigator is not rendered and the credit is centred alone, exactly
            as before.

            The credit is `hidden` below `lg` because in flow it is 147px that
            nothing can reclaim: the middle group does not shrink, and neither
            does the block on the right, so the surplus leaves the bar past its
            right edge, where the page root's `overflow-hidden` clips it and no
            scroll reaches it. That costs the sidebar toggle from about 744px
            down -- an iPad in portrait, or two windows side by side. Out of
            flow below `lg`, the thresholds are the ones this page had before
            the credit joined the bar at all. */}
        <div className="flex items-center gap-3 shrink-0">
          {totalAssets > 1 && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => prevAsset && navigateAsset(prevAsset.id)}
                disabled={!prevAsset}
                className="relative tap-target flex items-center justify-center h-7 w-7 rounded-md text-text-secondary [@media(hover:hover)]:hover:text-text-primary [@media(hover:hover)]:hover:bg-bg-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 shrink-0"
                title="Previous asset (←)"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-text-secondary tabular-nums px-1">
                {currentIndex + 1} of {totalAssets}
              </span>
              <button
                onClick={() => nextAsset && navigateAsset(nextAsset.id)}
                disabled={!nextAsset}
                className="relative tap-target flex items-center justify-center h-7 w-7 rounded-md text-text-secondary [@media(hover:hover)]:hover:text-text-primary [@media(hover:hover)]:hover:bg-bg-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 shrink-0"
                title="Next asset (→)"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
          <PoweredByBadge showIcon className="hidden lg:inline-flex" />
        </div>

        {/* Right: version, share, sidebar toggle */}
        <div className="flex items-center gap-2 shrink-0 flex-1 justify-end max-lg:basis-full max-lg:flex-wrap max-lg:justify-start">
          {/* Hidden file input for new version upload */}
          <input
            ref={versionFileInputRef}
            type="file"
            className="hidden"
            accept={acceptByType[asset.asset_type] ?? '*/*'}
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file || !asset) return
              startVersionUpload(file, asset.id, asset.name, asset.project_id, project?.name)
              e.target.value = ''
              // Surface the newly-created version (starts as "uploading") quickly;
              // SSE transcode events then drive it through processing → ready (#118).
              setTimeout(() => refetchVersions(), 800)
              setTimeout(() => refetchVersions(), 2500)
            }}
          />
          <VersionSwitcher versions={versions} />
          {asset && canCompare(asset.asset_type, versions) && (
            <button
              onClick={() => {
                const readyVersions = versions
                  .filter((v) => v.processing_status === 'ready')
                  .sort((a, b) => a.version_number - b.version_number)
                const cur = currentVersion ?? readyVersions[readyVersions.length - 1]
                const prev = [...readyVersions].reverse().find((v) => v.version_number < cur.version_number)
                  ?? readyVersions.find((v) => v.id !== cur.id)
                if (!prev) return
                const p = new URLSearchParams(searchParams.toString())
                p.set('compare', prev.id)
                router.replace(`${pathname}?${p.toString()}`, { scroll: false })
              }}
              className="relative tap-target inline-flex items-center gap-1.5 rounded-md px-2.5 h-8 text-xs font-medium border border-border text-text-secondary [@media(hover:hover)]:hover:text-text-primary [@media(hover:hover)]:hover:bg-bg-hover transition-colors [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 shrink-0"
              title="Compare versions"
            >
              <GitCompareArrows className="h-3.5 w-3.5" />
              Compare
            </button>
          )}
          <button
            onClick={() => versionFileInputRef.current?.click()}
            className="relative tap-target inline-flex items-center gap-1.5 rounded-md px-2.5 h-8 text-xs font-medium border border-border text-text-secondary [@media(hover:hover)]:hover:text-text-primary [@media(hover:hover)]:hover:bg-bg-hover transition-colors [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 shrink-0"
            title="Upload new version"
          >
            <Upload className="h-3.5 w-3.5" />
            New Version
          </button>
          <AssetStyleSwitcher asset={asset} onChanged={refetchAsset} />
          <ShareDialog assetId={asset.id} assetName={asset.name} projectId={projectId} asset={asset} />
          <button
            // When the sheet is the comment surface, this button drives the
            // sheet. Toggling `sidebarOpen` there would do nothing visible,
            // since the sidebar is suppressed and the sheet never reads it.
            onClick={() =>
              useSheet ? setSheetState((st) => (st === 'peek' ? 'half' : 'peek')) : setSidebarOpen((p) => !p)
            }
            className={cn(
              'relative tap-target flex items-center justify-center h-8 w-8 rounded-md transition-colors [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 shrink-0',
              sidebarOpen
                ? 'bg-bg-hover text-text-primary'
                : 'text-text-tertiary [@media(hover:hover)]:hover:text-text-primary [@media(hover:hover)]:hover:bg-bg-hover',
            )}
            title="Toggle sidebar"
          >
            <Columns2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ─── Main content: viewer + sidebar ────────────────────────────── */}
      {compareOpen && asset && currentVersion && canCompare(asset.asset_type, versions) ? (
        <CompareOverlay asset={asset} versions={versions} rightVersion={currentVersion} onClose={closeCompare} canComment={canComment} />
      ) : (
      <>
      {/* pb-14 (3.5rem = PEEK_PX) reserves the sheet's peek band so the
          player's transport row stays on screen and tappable underneath it.
          Without it the media column runs to the bottom and the sheet, which
          is opaque and present in every state, sits on those controls. */}
      <div
        ref={reviewRootRef}
        className={cn("relative flex flex-1 overflow-hidden min-h-0", useSheet && "pb-14")}
        style={useSheet ? { paddingBottom: 'calc(3.5rem + env(safe-area-inset-bottom))' } : undefined}
      >
        {/* Left: viewer column */}
        <div
          className="flex-1 flex flex-col bg-bg-primary overflow-hidden min-w-0"
        >
          {/* Media viewer */}
          {renderMediaViewer()}
        </div>

        {/* Mouse keeps its md sidebar and landscape phones keep their column.
            Touch tablets below lg use the same keyboard-aware sheet as phones
            so the media keeps its width. */}
        {sidebarOpen && !useSheet && (
          <div className="w-full md:w-[360px] absolute inset-y-0 right-0 z-20 md:static md:inset-auto max-md:landscape:static max-md:landscape:inset-auto max-md:landscape:w-[45%] max-md:landscape:max-w-[360px] flex flex-col border-l-0 md:border-l max-md:landscape:border-l border-border bg-bg-secondary shrink-0 animate-in slide-in-from-right-2 duration-150">
            {panelTabs}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {activeTab === 'comments' ? (
                <>
                  {commentPanelNode}
                  {commentInputNode}
                </>
              ) : (
                fieldsBody
              )}
            </div>
          </div>
        )}
      </div>

      {useSheet && (
        <MobileCommentSheet
          state={sheetState}
          onStateChange={setSheetState}
          onHeightChange={handleSheetHeight}
          commentCount={comments.length}
          isPlaying={isPlaying}
          onTogglePlay={togglePlay}
          // Empty string for anything without a timeline: it suppresses the
          // sheet's mini transport rather than leaving a dead play button.
          currentTime={
            asset.asset_type === 'video' || asset.asset_type === 'audio'
              ? formatTimecode(playheadTime ?? 0)
              : ''
          }
          lockedToCompose={isDrawingMode}
          composer={activeTab === 'comments' ? commentInputNode : undefined}
        >
          {panelTabs}
          {activeTab === 'comments' ? commentPanelNode : fieldsBody}
        </MobileCommentSheet>
      )}
      </>
      )}
    </div>
  )
}

export default function ReviewPage({
  params,
}: {
  params: { id: string; assetId: string }
}) {
  const { id: projectId, assetId } = params

  return (
    <ReviewProvider assetId={assetId}>
      <ReviewScreenInner projectId={projectId} />
    </ReviewProvider>
  )
}
