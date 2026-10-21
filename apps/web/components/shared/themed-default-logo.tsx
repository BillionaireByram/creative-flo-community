import type { ComponentPropsWithoutRef } from 'react'
import { withBasePath } from '@/lib/base-path'
import { cn } from '@/lib/utils'

type LogoVariant = 'icon' | 'full'

type LogoAccessibility =
  | { decorative: true; alt?: never }
  | { decorative?: false; alt: string }

export type ThemedDefaultLogoProps = Omit<
  ComponentPropsWithoutRef<'img'>,
  'src' | 'srcSet' | 'alt' | 'aria-hidden' | 'style'
> & {
  variant: LogoVariant
} & LogoAccessibility

// The mark is the full-colour FreeFrame F, legible on both themes. The lockup's
// wordmark has to flip ink with the theme, so it ships one PNG per theme and CSS shows the right one.
const LOGO_SOURCES: Record<LogoVariant, string> = {
  icon: '/logo-icon-dark.png',
  full: '/logo-full-on-dark.png',
}
const FULL_ON_LIGHT = '/logo-full-on-light.png'

/**
 * The built-in FreeFrame mark, recolored by the root data-theme in globals.css.
 * A single dark-ink asset keeps the markup hydration-safe and avoids fetching a
 * second image that would only be hidden by CSS. `className` is for sizing
 * and layout only; theme/filter styling is owned by this component.
 *
 * `style` and `srcSet` are omitted from the props type and pinned to undefined
 * after the spread, so the ownership above holds at runtime too rather than
 * resting on the caller being typechecked.
 */
export function ThemedDefaultLogo({
  variant,
  decorative = false,
  alt,
  className,
  ...props
}: ThemedDefaultLogoProps) {
  const img = (src: string, themeClass?: string) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      src={withBasePath(src)}
      srcSet={undefined}
      style={undefined}
      alt={decorative ? '' : alt}
      aria-hidden={decorative || undefined}
      className={cn('themed-default-logo', themeClass, className)}
    />
  )
  if (variant === 'icon') return img(LOGO_SOURCES.icon)
  // The hidden copy is display:none, so assistive technology only ever sees one.
  return (
    <>
      {img(LOGO_SOURCES.full, 'themed-logo-on-dark')}
      {img(FULL_ON_LIGHT, 'themed-logo-on-light')}
    </>
  )
}
