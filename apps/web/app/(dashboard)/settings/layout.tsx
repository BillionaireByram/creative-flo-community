'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { User, Bell, Shield, Palette } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { CreatorCredit } from '@/components/shared/creator-credit'

interface SettingsNavItem {
  href: string
  label: string
  icon: React.ElementType
  adminOnly?: boolean
}

const settingsNavItems: SettingsNavItem[] = [
  { href: '/settings/profile', label: 'Profile', icon: User },
  { href: '/settings/appearance', label: 'Appearance', icon: Palette },
  { href: '/settings/notifications', label: 'Notifications', icon: Bell },
  { href: '/settings/admin', label: 'Admin', icon: Shield, adminOnly: true },
]

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { user, isSuperAdmin } = useAuthStore()

  return (
    <div className="flex min-h-full flex-col md:h-full md:min-h-0 md:flex-row">
      {/* Settings Sidebar */}
      <aside className="w-full border-b border-border bg-bg-secondary shrink-0 md:w-44 lg:w-56 md:border-b-0 md:border-r">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">Settings</h2>
          <p className="truncate text-xs text-text-tertiary mt-0.5">
            {user?.name ?? 'User'}
          </p>
        </div>

        <nav className="flex overflow-x-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:block md:space-y-0.5">
          {settingsNavItems.map((item) => {
            // Hide admin-only items from non-admins
            if (item.adminOnly && !isSuperAdmin) return null

            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex shrink-0 [@media(pointer:coarse)]:min-h-11 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-bg-hover text-text-primary font-medium'
                    : 'text-text-secondary hover:bg-bg-hover/70 hover:text-text-primary',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* About: the creator credit, always shown, independent of the white-label badge */}
        <div className="border-t border-border px-4 py-3">
          <CreatorCredit />
        </div>
      </aside>

      {/* Settings Content */}
      <main className="min-h-0 min-w-0 flex-1 md:overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
