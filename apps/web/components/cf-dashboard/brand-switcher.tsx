import { cn } from '@/lib/utils'
import type { Brand } from '@/components/cf-style/types'

export function BrandSwitcher({ brands, value, onChange }: {
  brands: Brand[]; value: string; onChange: (brand: string) => void
}) {
  if (brands.length > 3) return (
    <select aria-label="Brand" value={value} onChange={(event) => onChange(event.target.value)}
      className="focus-ring min-w-0 max-w-full [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary">
      {brands.map((brand) => <option key={brand.brand} value={brand.brand}>{brand.project_name}</option>)}
    </select>
  )
  return (
    <div role="group" aria-label="Brand" className="flex max-w-full flex-wrap gap-1 rounded-lg border border-border bg-bg-secondary p-1">
      {brands.map((brand) => <button key={brand.brand} type="button" aria-pressed={value === brand.brand}
        onClick={() => onChange(brand.brand)} className={cn('focus-ring max-w-full truncate [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 rounded-md px-3 py-2 text-xs transition-colors',
          value === brand.brand ? 'bg-accent-muted text-text-primary' : 'text-text-secondary [@media(hover:hover)]:hover:bg-bg-hover')}>
        {brand.project_name}
      </button>)}
    </div>
  )
}
