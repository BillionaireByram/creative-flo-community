'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { Search, ChevronRight, PanelRightClose, PanelRightOpen, Menu } from 'lucide-react'
import Link from 'next/link'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useUploadStore } from '@/stores/upload-store'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { useViewStore } from '@/stores/view-store'
import { useBreadcrumbStore } from '@/stores/breadcrumb-store'

interface HeaderProps {
  onSearchOpen: () => void
}

const LABEL_MAP: Record<string, string> = {
  projects: 'Projects',
  notifications: 'Notifications',
  settings: 'Settings',
  new: 'New',
  upload: 'Upload',
}

/** Looks like a UUID (8-4-4-4-12 hex) */
function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

/**
 * Route path segments that are structural only and should not appear in the breadcrumb.
 * e.g. /projects/{id}/assets/{assetId} — "assets" is just a route prefix, not a meaningful label.
 */
const SKIP_SEGMENTS = new Set(['assets', 'collections'])

function buildBreadcrumbs(pathname: string, dynamicLabels: Record<string, string>): { label: string; href: string }[] {
  const segments = pathname.split('/').filter(Boolean)
  const crumbs: { label: string; href: string }[] = []

  let path = ''
  for (const segment of segments) {
    path += `/${segment}`
    // Skip structural route segments
    if (SKIP_SEGMENTS.has(segment)) continue
    // Skip UUID segments that don't have a label registered
    if (isUuid(segment) && !dynamicLabels[segment]) continue
    const label =
      dynamicLabels[segment] ??
      LABEL_MAP[segment] ??
      segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ')
    crumbs.push({ label, href: path })
  }

  return crumbs
}

export function Header({ onSearchOpen }: HeaderProps) {
  const pathname = usePathname()
  const toggleUploads = useUploadStore((state) => state.togglePanel)
  const { logout, isSuperAdmin } = useAuthStore()
  const { rightPanelOpen, toggleRightPanel } = useViewStore()
  const { labels, extraCrumbs } = useBreadcrumbStore()
  const urlCrumbs = buildBreadcrumbs(pathname, labels)
  const breadcrumbs = [...urlCrumbs, ...extraCrumbs.map((c) => ({ label: c.label, href: c.href ?? '' }))]

  return (
    <header className="sticky top-0 z-20 flex h-11 items-center justify-between border-b border-border bg-bg-primary/90 backdrop-blur-sm px-4 pt-safe [@media(pointer:coarse)]:h-[calc(3.5rem+env(safe-area-inset-top))]">
      {/* Breadcrumbs */}
      <nav className="flex min-w-0 flex-1 items-center gap-1 text-[13px]">
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1
          return (
            <React.Fragment key={`${crumb.href}-${index}`}>
              {index > 0 && (
                <ChevronRight className="h-3 w-3 shrink-0 text-text-tertiary" />
              )}
              {isLast ? (
                <span className="min-w-0 truncate font-medium text-text-primary">{crumb.label}</span>
              ) : crumb.href ? (
                <Link
                  href={crumb.href}
                  className="inline-flex min-w-0 items-center text-text-tertiary [@media(hover:hover)]:hover:text-text-secondary transition-colors [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
                >
                  <span className="truncate">{crumb.label}</span>
                </Link>
              ) : (
                <span className="min-w-0 truncate text-text-tertiary">{crumb.label}</span>
              )}
            </React.Fragment>
          )
        })}
      </nav>

      {/* Right side actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" aria-label="Account and activity" className="flex h-11 w-11 items-center justify-center rounded-md text-text-tertiary md:hidden">
              <Menu className="h-4 w-4" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={8} collisionPadding={8} className="z-50 min-w-[180px] max-w-[calc(100vw-16px)] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto rounded-lg border border-border bg-bg-elevated p-1 shadow-xl">
              {['Profile', 'Appearance', 'Notifications'].map((label) => (
                <DropdownMenu.Item key={label} asChild>
                  <Link href={`/settings/${label.toLowerCase()}`} className="flex min-h-11 items-center rounded-md px-3 text-sm text-text-secondary focus:bg-bg-hover focus:outline-none">{label}</Link>
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Item asChild>
                <Link href="/notifications" className="flex min-h-11 items-center rounded-md px-3 text-sm text-text-secondary focus:bg-bg-hover focus:outline-none">Activity</Link>
              </DropdownMenu.Item>
              {isSuperAdmin && <DropdownMenu.Item asChild>
                <Link href="/settings/admin" className="flex min-h-11 items-center rounded-md px-3 text-sm text-text-secondary focus:bg-bg-hover focus:outline-none">Admin</Link>
              </DropdownMenu.Item>}
              <DropdownMenu.Item onSelect={logout} className="flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm text-status-error focus:bg-bg-hover focus:outline-none">Log out</DropdownMenu.Item>
              <DropdownMenu.Item onSelect={toggleUploads} className="flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm text-text-secondary focus:bg-bg-hover focus:outline-none">Uploads</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        {/* Search trigger */}
        <button
          onClick={onSearchOpen}
          aria-label="Search"
          className="flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 items-center justify-center gap-1.5 rounded-md border border-border bg-bg-secondary/60 px-2.5 py-1 text-xs text-text-tertiary [@media(hover:hover)]:hover:border-border-focus [@media(hover:hover)]:hover:text-text-secondary transition-colors"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-bg-tertiary/50 px-1 py-0.5 font-mono text-[10px] text-text-tertiary">
            <span>⌘</span>K
          </kbd>
        </button>

        {/* Panel toggle — only on project detail pages, not the listing */}
        {pathname !== '/projects' && (
          <button
            onClick={toggleRightPanel}
            className={cn(
              'flex h-7 w-7 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 items-center justify-center rounded-md transition-colors',
              rightPanelOpen
                ? 'text-text-primary bg-accent-muted'
                : 'text-text-tertiary [@media(hover:hover)]:hover:bg-bg-hover [@media(hover:hover)]:hover:text-text-primary',
            )}
            title={rightPanelOpen ? 'Hide panel' : 'Show panel'}
          >
            {rightPanelOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
    </header>
  )
}
