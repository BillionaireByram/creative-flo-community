'use client'

import * as React from 'react'
import { useBranding } from '@/components/shared/branding-provider'
import { cn } from '@/lib/utils'
import { ThemedDefaultLogo } from '@/components/shared/themed-default-logo'

interface PoweredByBadgeProps {
  className?: string
  showOrgName?: boolean
  showIcon?: boolean
}

const POWERED_BY_NAME = 'FreeFrame'
const POWERED_BY_URL = 'https://github.com/Techiebutler/freeframe'

export function PoweredByBadge({
  className,
  showOrgName,
  showIcon = true,
}: PoweredByBadgeProps) {
  const { poweredByFreeframe, orgName } = useBranding()

  if (!poweredByFreeframe) return null

  const classes = cn(
    'inline-flex items-center gap-1.5 text-xs text-text-tertiary',
    className,
  )
  const content = (
    <>
      {showIcon && (
        <ThemedDefaultLogo
          variant="icon"
          decorative
          className="h-3.5 w-3.5 shrink-0 object-contain"
        />
      )}
      <span>
        Powered by {showOrgName ? orgName || POWERED_BY_NAME : POWERED_BY_NAME}
      </span>
    </>
  )

  // Only the FreeFrame credit links out. With showOrgName the line reads
  // "Powered by <the org>", and pointing that at FreeFrame's site would
  // send people somewhere the text never promised.
  if (showOrgName) {
    return <p className={classes}>{content}</p>
  }

  return (
    <a
      href={POWERED_BY_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="FreeFrame"
      className={cn(classes, 'transition-colors hover:text-text-secondary')}
    >
      {content}
    </a>
  )
}
