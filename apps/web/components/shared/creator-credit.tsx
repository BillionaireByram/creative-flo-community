import { cn } from '@/lib/utils'

export const CREATOR_CREDIT = 'Creative Flo by Byram Smith Jr. · DigitalFlo'
export const CREATOR_URL = 'https://mydigitalflo.io'

// The creator credit is part of the license attribution (see NOTICE). Unlike
// PoweredByBadge it does not read the white-label branding flag, so it stays
// visible when an admin switches the "Powered by" badge off.
export function CreatorCredit({ className }: { className?: string }) {
  return (
    <p className={cn('text-xs text-text-tertiary', className)}>
      <a
        href={CREATOR_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="transition-colors hover:text-text-secondary"
      >
        {CREATOR_CREDIT}
      </a>
    </p>
  )
}
