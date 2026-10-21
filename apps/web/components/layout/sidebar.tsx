'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Bell,
  Upload,
  Settings,
  LogOut,
  User,
  ChevronsLeft,
} from 'lucide-react'
import { useCoarsePointer } from '@/hooks/use-long-press'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useUploadStore } from '@/stores/upload-store'
import { useNotificationStore } from '@/stores/notification-store'
import { useBranding } from '@/components/shared/branding-provider'
import { useResolvedTheme } from '@/hooks/use-resolved-theme'
import { resolveBrandingLogo } from '@/lib/branding-logo'
import { Avatar } from '@/components/shared/avatar'
import { ThemedDefaultLogo } from '@/components/shared/themed-default-logo'
import { NotificationDrawer } from './notification-drawer'
import useSWR from 'swr'
import { api } from '@/lib/api'
import { StorageUsage, StorageRing } from '@/components/shared/storage-usage'
import type { InstanceSettings } from '@/types'

import { navItems, isNavActive } from './nav-items'
export { navItems }

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()
  const coarse = useCoarsePointer()
  const { user, logout, isSuperAdmin } = useAuthStore()
  const { files: uploadFiles, togglePanel, panelOpen } = useUploadStore()
  const { unreadCount, fetchNotifications } = useNotificationStore()
  const { orgName, orgLogoDark, orgLogoLight } = useBranding()
  // Resolved, not the raw preference: 'system' is neither 'light' nor 'dark',
  // so comparing it directly handed a system-light viewer the dark-background
  // logo on a light page.
  const theme = useResolvedTheme()
  const customLogo = resolveBrandingLogo({
    theme,
    darkUrl: orgLogoDark,
    lightUrl: orgLogoLight,
  })
  const [notifOpen, setNotifOpen] = React.useState(false)
  const activeUploads = uploadFiles.filter((f) => f.status === 'uploading' || f.status === 'pending' || f.status === 'processing').length
  const { data: instance } = useSWR<InstanceSettings>(
    '/instance/settings',
    () => api.get<InstanceSettings>('/instance/settings'),
  )

  React.useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  return (
    <>
      {coarse && !collapsed && (
        <button type="button" aria-label="Close sidebar" onClick={onToggle} className="fixed inset-0 z-[25] hidden md:block" />
      )}
      <aside
        className={cn(
          // Creative Flo: phones get the bottom tab bar (MobileTabBar) instead of the rail.
          'fixed left-0 top-0 z-30 hidden h-dvh pt-safe pb-safe flex-col border-r border-border md:flex',
          'bg-bg-secondary transition-[width] duration-200 overflow-hidden',
          collapsed ? 'w-[52px] [@media(pointer:coarse)]:w-[76px]' : 'w-[220px]',
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            'flex h-12 items-center shrink-0 border-b border-border',
            collapsed ? 'justify-center px-0' : 'px-4 gap-2.5',
          )}
        >
          {customLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={customLogo}
              alt={orgName}
              className="h-7 w-7 shrink-0 object-contain rounded"
            />
          ) : (
            <ThemedDefaultLogo
              variant="icon"
              alt={orgName}
              className="h-7 w-7 shrink-0 object-contain"
            />
          )}
          {!collapsed && (
            <span className="text-sm font-semibold text-text-primary tracking-tight truncate">
              {orgName}
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav aria-label="Main" className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 space-y-0.5">
          {navItems.map((item) => {
            const isActive = isNavActive(pathname, item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => { setNotifOpen(false); if (coarse && !collapsed) onToggle() }}
                className={cn(
                  'group relative flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [@media(pointer:coarse)]:min-h-11 items-center rounded-md transition-colors duration-100',
                  collapsed ? 'justify-center h-9 w-9 mx-auto [@media(pointer:coarse)]:h-14 [@media(pointer:coarse)]:w-full [@media(pointer:coarse)]:flex-col [@media(pointer:coarse)]:gap-1' : 'gap-2.5 px-2.5 h-9',
                  isActive
                    ? 'bg-bg-hover text-text-primary'
                    : 'text-text-secondary [@media(hover:hover)]:hover:bg-bg-hover/60 [@media(hover:hover)]:hover:text-text-primary',
                )}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  className="h-[18px] w-[18px] shrink-0"
                  strokeWidth={isActive ? 2 : 1.5}
                />
                {collapsed && <span className="hidden text-[9px] leading-none [@media(pointer:coarse)]:block">{item.label.replace(' & Scripts', '')}</span>}
                {!collapsed && (
                  <span
                    className={cn('text-[13px]', isActive && 'font-medium')}
                  >
                    {item.label}
                  </span>
                )}
              </Link>
            )
          })}

          {/* Notifications button */}
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className={cn(
              'group relative flex w-full [@media(pointer:coarse)]:min-h-11 items-center rounded-md transition-colors duration-100',
              collapsed ? 'justify-center h-9 w-9 mx-auto [@media(pointer:coarse)]:h-14 [@media(pointer:coarse)]:w-full [@media(pointer:coarse)]:flex-col [@media(pointer:coarse)]:gap-1' : 'gap-2.5 px-2.5 h-9',
              notifOpen
                ? 'bg-bg-hover text-text-primary'
                : 'text-text-secondary [@media(hover:hover)]:hover:bg-bg-hover/60 [@media(hover:hover)]:hover:text-text-primary',
            )}
            aria-label="Notifications"
            title={collapsed ? 'Notifications' : undefined}
          >
            <div className="relative shrink-0">
              <Bell
                className="h-[18px] w-[18px]"
                strokeWidth={notifOpen ? 2 : 1.5}
              />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-status-error px-0.5 text-[9px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </div>
            {collapsed && <span className="hidden text-[9px] leading-none [@media(pointer:coarse)]:block">Notifications</span>}
            {!collapsed && (
              <span className={cn('text-[13px]', notifOpen && 'font-medium')}>
                Notifications
              </span>
            )}
          </button>

          {/* Uploads button */}
          <button
            onClick={() => { setNotifOpen(false); togglePanel() }}
            className={cn(
              'group relative flex w-full [@media(pointer:coarse)]:min-h-11 items-center rounded-md transition-colors duration-100',
              collapsed ? 'justify-center h-9 w-9 mx-auto [@media(pointer:coarse)]:h-14 [@media(pointer:coarse)]:w-full [@media(pointer:coarse)]:flex-col [@media(pointer:coarse)]:gap-1' : 'gap-2.5 px-2.5 h-9',
              panelOpen
                ? 'bg-bg-hover text-text-primary'
                : 'text-text-secondary [@media(hover:hover)]:hover:bg-bg-hover/60 [@media(hover:hover)]:hover:text-text-primary',
            )}
            aria-label="Uploads"
            title={collapsed ? 'Uploads' : undefined}
          >
            <div className="relative shrink-0">
              <Upload className="h-[18px] w-[18px]" strokeWidth={panelOpen ? 2 : 1.5} />
              {activeUploads > 0 && (
                <span className="absolute -top-1 -right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 text-[9px] font-bold text-white">
                  {activeUploads}
                </span>
              )}
            </div>
            {collapsed && <span className="hidden text-[9px] leading-none [@media(pointer:coarse)]:block">Uploads</span>}
            {!collapsed && (
              <span className={cn('text-[13px]', panelOpen && 'font-medium')}>
                Uploads
              </span>
            )}
          </button>
      </nav>

      {/* Bottom section */}
      <div className="border-t border-border p-2 space-y-1 shrink-0">
        {/* Instance storage indicator — ring when collapsed, used/limit bar when expanded */}
        {instance && (
          <div className={cn(collapsed ? 'flex justify-center py-1' : 'px-2.5 py-1.5')}>
            {collapsed ? (
              <StorageRing
                used={instance.storage_used_bytes}
                limit={instance.storage_limit_bytes}
              />
            ) : (
              <StorageUsage
                used={instance.storage_used_bytes}
                limit={instance.storage_limit_bytes}
                variant="sidebar"
              />
            )}
          </div>
        )}

        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                className={cn(
                  'relative tap-target flex w-full [@media(pointer:coarse)]:min-h-11 items-center rounded-md text-text-secondary [@media(hover:hover)]:hover:bg-bg-hover [@media(hover:hover)]:hover:text-text-primary transition-colors',
                  collapsed ? 'justify-center h-9 w-9 mx-auto [@media(pointer:coarse)]:h-14 [@media(pointer:coarse)]:w-full [@media(pointer:coarse)]:flex-col [@media(pointer:coarse)]:gap-1' : 'gap-2.5 px-2 py-1.5',
                )}
                aria-label="Account"
                title={collapsed ? (user?.name ?? 'Account') : undefined}
              >
                <Avatar src={user?.avatar_url} name={user?.name} size="sm" />
                {collapsed && <span className="hidden text-[9px] leading-none [@media(pointer:coarse)]:block">Account</span>}
                {!collapsed && (
                  <div className="flex flex-col items-start overflow-hidden min-w-0">
                    <span className="truncate text-[13px] font-medium text-text-primary leading-tight w-full text-left">
                      {user?.name ?? 'User'}
                    </span>
                    <span className="truncate text-[10px] text-text-tertiary leading-tight w-full text-left">
                      {user?.email ?? ''}
                    </span>
                  </div>
                )}
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                side="top"
                align={collapsed ? 'start' : 'end'}
                sideOffset={8}
                collisionPadding={8}
                className="z-50 min-w-[180px] max-w-[calc(100vw-16px)] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto rounded-lg border border-border bg-bg-elevated p-1 shadow-xl animate-slide-up"
              >
                <DropdownMenu.Item asChild>
                  <Link
                    href="/settings/profile"
                    className="flex [@media(pointer:coarse)]:min-h-11 cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-text-secondary [@media(hover:hover)]:hover:bg-bg-hover [@media(hover:hover)]:hover:text-text-primary focus:outline-none"
                  >
                    <User className="h-4 w-4" />
                    Profile
                  </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Item asChild>
                  <Link
                    href={isSuperAdmin ? '/settings/admin' : '/settings/appearance'}
                    className="flex [@media(pointer:coarse)]:min-h-11 cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-text-secondary [@media(hover:hover)]:hover:bg-bg-hover [@media(hover:hover)]:hover:text-text-primary focus:outline-none"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
                <DropdownMenu.Item
                  onSelect={logout}
                  className="flex [@media(pointer:coarse)]:min-h-11 cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-status-error [@media(hover:hover)]:hover:bg-status-error/10 focus:outline-none"
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          {/* Collapse toggle */}
          <button
            onClick={onToggle}
            className={cn(
              'relative tap-target flex w-full [@media(pointer:coarse)]:min-h-11 items-center rounded-md text-text-tertiary [@media(hover:hover)]:hover:bg-bg-hover [@media(hover:hover)]:hover:text-text-secondary transition-colors',
              collapsed ? 'justify-center h-8 w-8 mx-auto [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11' : 'gap-2 px-2.5 h-8',
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronsLeft
              className={cn(
                'h-4 w-4 transition-transform',
                collapsed && 'rotate-180',
              )}
            />
            {!collapsed && <span className="text-xs">Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Notification Drawer */}
      <NotificationDrawer railCollapsed={collapsed} open={notifOpen} onClose={() => setNotifOpen(false)} />
    </>
  )
}
