'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { navItems, isNavActive } from './nav-items'

/** Creative Flo on a phone: the main sections as a bottom tab bar (the rail is desktop-only). */
export function MobileTabBar() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg-secondary/95 pb-safe pl-safe pr-safe backdrop-blur-md md:hidden"
    >
      <ul className="mx-auto flex h-16 max-w-lg items-stretch justify-around">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = isNavActive(pathname, href)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent text-[10px] font-medium transition-colors',
                  active ? 'text-accent' : 'text-text-tertiary [@media(hover:hover)]:hover:text-text-secondary',
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span className="leading-none">{label.replace(' & Scripts', '')}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
