function takeTitle(title: string | null | undefined): string {
  const normalized = title?.trim().replace(/\s+/g, ' ') || 'Freestyle'
  const characters = Array.from(normalized)
  return characters.length > 80 ? `${characters.slice(0, 79).join('')}…` : normalized
}

function dateParts(at: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return {
    year: String(at.getFullYear()).padStart(4, '0'),
    month: pad(at.getMonth() + 1),
    day: pad(at.getDate()),
    hour: pad(at.getHours()),
    minute: pad(at.getMinutes()),
  }
}

export function takeAssetName(title: string | null | undefined, at: Date): string {
  const { year, month, day, hour, minute } = dateParts(at)
  return `Take · ${takeTitle(title)} · ${year}-${month}-${day} ${hour}:${minute}`
}

export function takeFileName(title: string | null | undefined, at: Date, ext: 'mp4' | 'webm'): string {
  const { year, month, day, hour, minute } = dateParts(at)
  const slug = takeTitle(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'freestyle'
  return `take-${slug}-${year}${month}${day}-${hour}${minute}.${ext}`
}
