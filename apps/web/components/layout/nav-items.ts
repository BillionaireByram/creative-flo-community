import type * as React from 'react'
import { Layers, Lightbulb, Video, Palette } from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: React.ElementType
}

export const navItems: NavItem[] = [
  { href: '/ideas', label: 'Ideas & Scripts', icon: Lightbulb },
  { href: '/shoot', label: 'Shoot', icon: Video },
  { href: '/style', label: 'Style', icon: Palette },
  { href: '/projects', label: 'Projects', icon: Layers },
]

export function isNavActive(pathname: string, href: string): boolean {
  if (href === '/style' && /^\/[^/]+\/style(?:\/|$)/.test(pathname) && !navItems.some((item) => item.href === `/${pathname.split('/')[1]}`)) return true
  return pathname === href || (href !== '/' && pathname.startsWith(`${href}/`))
}
