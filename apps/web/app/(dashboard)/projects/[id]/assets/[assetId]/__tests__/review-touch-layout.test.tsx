import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'

const asset = {
  id: 'a2',
  name: 'Episode 4 — rough cut.mov',
  project_id: 'p1',
  asset_type: 'video',
  latest_version: { id: 'v1', version_number: 1, processing_status: 'ready' },
}
const allAssets = [{ id: 'a1' }, asset, { id: 'a3' }]

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/projects/p1/assets/a2',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('swr', () => ({
  default: (key: string) => ({
    data: typeof key !== 'string' ? undefined
      : key.endsWith('/assets') ? allAssets
      // An editor, so the page renders its composer.
      : key.endsWith('/members') ? [{ user_id: 'u1', role: 'editor' }]
      : undefined,
  }),
}))
vi.mock('@/components/review/review-provider', () => ({
  ReviewProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReview: () => ({
    asset,
    versions: [asset.latest_version],
    isLoading: false,
    refetchComments: vi.fn(),
    refetchVersions: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-comments', () => ({
  useComments: () => ({
    comments: [],
    createComment: vi.fn(),
    resolveComment: vi.fn(),
    deleteComment: vi.fn(),
    updateComment: vi.fn(),
    refetch: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-sse', () => ({ useSSE: () => undefined }))
vi.mock('@/hooks/use-page-title', () => ({ usePageTitle: () => undefined }))
vi.mock('@/hooks/use-media-transport', () => ({
  useMediaTransport: () => ({ currentTime: 0, duration: 0, isPlaying: false }),
}))
/** These stores are read both bare and through a selector, so the mock has to
 *  answer either shape. Hoisted, because vi.mock's factories are. */
const { storeHook } = vi.hoisted(() => ({
  storeHook: (state: Record<string, unknown>) =>
    (selector?: (s: Record<string, unknown>) => unknown) =>
      (typeof selector === 'function' ? selector(state) : state),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: storeHook({ user: { id: 'u1', name: 'Reviewer' } }),
}))
vi.mock('@/stores/review-store', () => ({
  useReviewStore: storeHook({
    currentVersion: { id: 'v1', version_number: 1, processing_status: 'ready' },
    isDrawingMode: false,
    focusedCommentId: null,
    playheadTime: 0,
    seekTo: vi.fn(),
    setFocusedCommentId: vi.fn(),
    setActiveAnnotation: vi.fn(),
  }),
}))
vi.mock('@/stores/upload-store', () => ({
  useUploadStore: storeHook({ startVersionUpload: vi.fn() }),
}))
vi.mock('@/stores/breadcrumb-store', () => ({
  useBreadcrumbStore: storeHook({ setExtraCrumbs: vi.fn(), setLabel: vi.fn() }),
}))
vi.mock('@/lib/api', () => ({ api: { get: vi.fn().mockResolvedValue([]), post: vi.fn() } }))
vi.mock('@/components/review/video-player', () => ({ VideoPlayer: () => null }))
vi.mock('@/components/review/audio-player', () => ({ AudioPlayer: () => null }))
vi.mock('@/components/review/image-viewer', () => ({ ImageViewer: () => null }))
vi.mock('@/components/review/annotation-canvas', () => ({ AnnotationCanvas: () => null }))
vi.mock('@/components/review/annotation-overlay', () => ({ AnnotationOverlay: () => null }))
vi.mock('@/components/review/comment-panel', () => ({ CommentPanel: () => <div data-testid="inline-comments" /> }))
vi.mock('@/components/review/comment-input', () => ({ CommentInput: () => null }))
/** useMediaQuery is false here, so the page hands its composer to the sheet. */
const { sheetComposers } = vi.hoisted(() => ({
  sheetComposers: [] as Array<{ props: Record<string, unknown> } | undefined>,
}))
vi.mock('@/components/review/mobile-comment-sheet', () => ({
  MobileCommentSheet: ({ composer }: { composer?: { props: Record<string, unknown> } }) => {
    sheetComposers.push(composer)
    return <div data-testid="touch-sheet" />
  },
  PEEK_PX: 56,
}))
vi.mock('@/components/review/version-switcher', () => ({ VersionSwitcher: () => null }))
vi.mock('@/components/review/share-dialog', () => ({ ShareDialog: () => null }))
vi.mock('@/components/review/compare/compare-overlay', () => ({ CompareOverlay: () => null }))


import ReviewPage from '../page'
import { setCoarsePointer, setViewportWidth } from '@/test/setup'

afterEach(() => {
  cleanup()
  setCoarsePointer(false)
  setViewportWidth(1024)
})

function mount(width: number, touch: boolean) {
  setViewportWidth(width)
  setCoarsePointer(touch)
  return render(<ReviewPage params={{ id: 'p1', assetId: 'a2' }} />)
}

describe('asset review touch layout', () => {
  it.each([390, 820])('uses the keyboard-aware sheet at %ipx on touch', (width) => {
    mount(width, true)
    expect(screen.getByTestId('touch-sheet')).toBeInTheDocument()
    expect(screen.queryByTestId('inline-comments')).toBeNull()
  })

  it('keeps the inline column on a landscape iPad at 1180px', () => {
    mount(1180, true)
    expect(screen.queryByTestId('touch-sheet')).toBeNull()
    expect(screen.getByTestId('inline-comments')).toBeInTheDocument()
  })

  it('preserves the md inline column for a mouse at 820px', () => {
    mount(820, false)
    expect(screen.queryByTestId('touch-sheet')).toBeNull()
    expect(screen.getByTestId('inline-comments')).toBeInTheDocument()
  })

  it('changes comment surface reactively when the iPad rotates', () => {
    mount(820, true)
    act(() => setViewportWidth(1180))
    expect(screen.queryByTestId('touch-sheet')).toBeNull()
    expect(screen.getByTestId('inline-comments')).toBeInTheDocument()
  })

  it('wraps the phone header while preserving a truncating title and touch back target', () => {
    mount(390, true)
    const title = screen.getByTitle(asset.name)
    expect(title.className).toContain('truncate')
    const back = screen.getByRole('link', { name: 'Back to project' })
    expect(back.className).toContain('tap-target')
    expect(back.className).toContain('[@media(pointer:coarse)]:min-h-11')
    expect(back.parentElement?.parentElement?.className).toContain('max-lg:flex-wrap')
    const toggle = screen.getByTitle('Toggle sidebar')
    expect(toggle.parentElement?.className).toContain('max-lg:flex-wrap')
  })

  it('caps the image annotation stage above the comment sheet as well as the video stage', () => {
    asset.asset_type = 'image'
    try {
      const { container } = mount(390, true)
      expect(container.querySelector('[style*="max-height"]')).toHaveStyle({ maxHeight: 'var(--ff-stage-max)' })
    } finally {
      asset.asset_type = 'video'
    }
  })
})
