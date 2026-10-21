import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { setCoarsePointer, setViewportWidth } from '@/test/setup'
import { Sidebar } from '../sidebar'
import { Header } from '../header'
import { UploadsPanel } from '../uploads-panel'
import { NotificationDrawer } from '../notification-drawer'
import SettingsLayout from '@/app/(dashboard)/settings/layout'

const state = vi.hoisted(() => ({
  pathname: '/projects/11111111-1111-1111-1111-111111111111',
  toggleUploads: vi.fn(), setPanelOpen: vi.fn(), fetch: vi.fn(),
  rename: vi.fn(), cancel: vi.fn(), logout: vi.fn(),
}))
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }))
vi.mock('swr', () => ({ default: () => ({ data: undefined }) }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => ({ user: { name: 'Owner', email: 'owner@example.test' }, logout: state.logout, isSuperAdmin: false }) }))
vi.mock('@/components/shared/branding-provider', () => ({ useBranding: () => ({ orgName: 'Creative Flo' }) }))
vi.mock('@/hooks/use-resolved-theme', () => ({ useResolvedTheme: () => 'dark' }))
vi.mock('@/stores/view-store', () => ({ useViewStore: () => ({ rightPanelOpen: false, toggleRightPanel: vi.fn() }) }))
vi.mock('@/stores/breadcrumb-store', () => ({ useBreadcrumbStore: () => ({ labels: { '11111111-1111-1111-1111-111111111111': 'An extremely long brand and project name' }, extraCrumbs: [] }) }))
vi.mock('@/stores/notification-store', () => ({ useNotificationStore: () => ({ notifications: [], unreadCount: 0, fetchNotifications: state.fetch }) }))
vi.mock('@/stores/upload-store', () => ({
  useUploadStore: (selector?: (value: unknown) => unknown) => {
    const value = {
      files: [{ id: 'upload', status: 'uploading', assetName: 'A take', fileName: 'take.mov', fileSize: 1024, fileType: 'video/quicktime', projectId: 'project', createdAt: Date.now(), progress: 30 }],
      panelOpen: true, togglePanel: state.toggleUploads, setPanelOpen: state.setPanelOpen,
      fetchHistory: state.fetch, renameUpload: state.rename, cancelUpload: state.cancel,
    }
    return selector ? selector(value) : value
  },
}))

beforeEach(() => { vi.clearAllMocks(); setCoarsePointer(true); setViewportWidth(820); state.pathname = '/projects/11111111-1111-1111-1111-111111111111' })
afterEach(() => { cleanup(); setCoarsePointer(false); setViewportWidth(1024) })

function Rail() {
  const [collapsed, setCollapsed] = useState(true)
  return <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
}

describe('touch shell', () => {
  it('highlights Style in the sidebar for a brand template route', () => {
    state.pathname = '/studio/style/templates'
    render(<Rail />)
    expect(screen.getByRole('link', { name: 'Style' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Projects' })).not.toHaveAttribute('aria-current')
  })

  it.each([820, 1180])('labels the rail and dismisses its expansion at %ipx', (width) => {
    setViewportWidth(width)
    render(<Rail />)
    const ideas = screen.getByRole('link', { name: 'Ideas & Scripts' })
    expect(ideas).toHaveClass('[@media(pointer:coarse)]:h-14')
    expect(ideas.querySelector('span')).toHaveClass('[@media(pointer:coarse)]:block')
    for (const name of ['Notifications', 'Uploads', 'Account']) {
      expect(screen.getByRole('button', { name })).toHaveClass('[@media(pointer:coarse)]:h-14')
    }
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }))
    expect(screen.queryByRole('button', { name: 'Close sidebar' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    fireEvent.click(screen.getByRole('link', { name: 'Ideas & Scripts' }))
    expect(screen.queryByRole('button', { name: 'Close sidebar' })).not.toBeInTheDocument()
  })

  it('preserves mouse rail density and expanded state on navigation', () => {
    setCoarsePointer(false)
    render(<Rail />)
    expect(screen.getByRole('link', { name: 'Ideas & Scripts' })).toHaveClass('h-9', 'w-9')
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    fireEvent.click(screen.getByRole('link', { name: 'Ideas & Scripts' }))
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close sidebar' })).not.toBeInTheDocument()
  })

  it.each([390, 820, 1180])('keeps breadcrumbs and header controls tappable at %ipx', (width) => {
    setViewportWidth(width)
    render(<Header onSearchOpen={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveClass('[@media(pointer:coarse)]:min-h-11', 'min-w-0')
    expect(screen.getByText('An extremely long brand and project name')).toHaveClass('truncate')
    expect(screen.getByRole('button', { name: 'Search' })).toHaveClass('[@media(pointer:coarse)]:min-h-11', '[@media(pointer:coarse)]:min-w-11')
    expect(screen.getByRole('button', { name: 'Show panel' })).toHaveClass('[@media(pointer:coarse)]:h-11', '[@media(pointer:coarse)]:w-11')
    expect(screen.getByRole('button', { name: 'Account and activity' })).toHaveClass('h-11', 'w-11', 'md:hidden')
  })

  it('offers settings, activity, uploads and logout from the phone menu', () => {
    setViewportWidth(390)
    render(<Header onSearchOpen={vi.fn()} />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Account and activity' }), { key: 'Enter' })
    const menu = screen.getByRole('menu')
    expect(menu).toHaveClass('max-w-[calc(100vw-16px)]', 'max-h-[var(--radix-dropdown-menu-content-available-height)]', 'overflow-y-auto')
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveAttribute('href', '/settings/profile')
    expect(screen.getByRole('menuitem', { name: 'Activity' })).toHaveAttribute('href', '/notifications')
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toHaveClass('min-h-11')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Uploads' }))
    expect(state.toggleUploads).toHaveBeenCalledOnce()
  })

  it('keeps the Settings crumb and phone sub-nav at least 44px tall', () => {
    state.pathname = '/settings/profile'
    setViewportWidth(390)
    render(<><Header onSearchOpen={vi.fn()} /><SettingsLayout><p>Profile form</p></SettingsLayout></>)
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveClass('[@media(pointer:coarse)]:min-h-11')
    for (const name of ['Profile', 'Appearance', 'Notifications']) {
      expect(screen.getByRole('link', { name })).toHaveClass('[@media(pointer:coarse)]:min-h-11', 'shrink-0')
    }
    expect(screen.getByRole('link', { name: 'Profile' }).parentElement).toHaveClass('overflow-x-auto')
  })

  it('exposes upload rename and cancel without hover and closes the phone panel', () => {
    setViewportWidth(390)
    render(<UploadsPanel />)
    const pencil = screen.getByRole('button', { name: 'Rename A take' })
    expect(pencil).toHaveClass('opacity-100', '[@media(hover:hover)]:opacity-0', '[@media(hover:hover)]:group-hover:opacity-100')
    expect(pencil).not.toHaveClass('opacity-0')
    const cancel = screen.getByRole('button', { name: 'Cancel upload' })
    expect(cancel.parentElement).toHaveClass('opacity-100', '[@media(hover:hover)]:opacity-0')
    expect(cancel).toHaveClass('[@media(pointer:coarse)]:h-11', '[@media(pointer:coarse)]:w-11')
    const close = screen.getByRole('button', { name: 'Close uploads' })
    const panel = screen.getByRole('heading', { name: /Uploads/ }).parentElement?.parentElement
    expect(panel).toHaveClass('[@media(max-width:767px)]:[--ff-left:0px]', '[--ff-left:52px]', 'bottom-[calc(4rem+env(safe-area-inset-bottom))]', 'pb-safe')
    fireEvent.click(close)
    expect(state.setPanelOpen).toHaveBeenCalledWith(false)
  })

  it('fits the notification drawer to the remaining viewport and closes it', () => {
    const close = vi.fn()
    render(<NotificationDrawer open railCollapsed={false} onClose={close} />)
    const button = screen.getByRole('button', { name: 'Close notifications' })
    expect(button).toHaveClass('[@media(pointer:coarse)]:h-11', '[@media(pointer:coarse)]:w-11')
    expect(button.closest('.fixed')).toHaveClass('[@media(max-width:767px)]:[--ff-left:0px]', 'md:[--ff-left:220px]', 'max-w-[calc(100vw-var(--ff-left)-env(safe-area-inset-left)-env(safe-area-inset-right))]', 'pb-safe')
    fireEvent.click(button)
    expect(close).toHaveBeenCalledOnce()
  })
})
