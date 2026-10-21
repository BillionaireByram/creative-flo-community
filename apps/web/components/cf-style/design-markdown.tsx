import { Fragment, type ReactNode } from 'react'
import { safeMediaUrl } from './style-card'

export function markdownSections(markdown: string) {
  const sections: { title: string; lines: string[] }[] = []
  let current = { title: 'Overview', lines: [] as string[] }
  let fenced = false
  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) { fenced = !fenced; current.lines.push(line); continue }
    const heading = !fenced && /^#{1,6}\s+(.+)$/.exec(line)
    if (heading) { if (current.lines.length) sections.push(current); current = { title: heading[1], lines: [] } }
    else current.lines.push(line)
  }
  if (current.lines.length) sections.push(current)
  return sections
}
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="rounded bg-bg-tertiary px-1">{part.slice(1, -1)}</code>
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part)
    if (link && safeMediaUrl(link[2])) return <a key={index} className="text-accent underline focus-visible:ring-2 focus-visible:ring-accent" href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>
    return <Fragment key={index}>{part}</Fragment>
  })
}
function Blocks({ lines }: { lines: string[] }) {
  const blocks: ReactNode[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    if (lines[i].startsWith('```')) {
      const code: string[] = []
      const key = i
      while (++i < lines.length && !lines[i].startsWith('```')) code.push(lines[i])
      blocks.push(<pre key={key} className="whitespace-pre-wrap break-words rounded-lg bg-bg-tertiary p-3 text-xs">{code.join('\n')}</pre>)
    } else if (/^\s*([-*+] |\d+\. )/.test(lines[i])) {
      const key = i
      const list: string[] = [lines[i].replace(/^\s*([-*+] |\d+\. )/, '')]
      while (i + 1 < lines.length && /^\s*([-*+] |\d+\. )/.test(lines[i + 1])) list.push(lines[++i].replace(/^\s*([-*+] |\d+\. )/, ''))
      blocks.push(<ul key={key} className="list-disc space-y-1 pl-5">{list.map((line, index) => <li key={index}>{inline(line)}</li>)}</ul>)
    } else blocks.push(<p key={i}>{inline(lines[i].replace(/^>\s?/, ''))}</p>)
  }
  return blocks
}
export function DesignMarkdown({ markdown }: { markdown?: string | null }) {
  if (!markdown?.trim()) return <p className="text-sm text-text-secondary">Your style guide will appear when Flo has built this version.</p>
  return <div className="space-y-2">{markdownSections(markdown).map((section, index) => <details key={`${section.title}-${index}`} open={index === 0} className="rounded-xl border border-border">
    <summary className="min-h-11 cursor-pointer break-words rounded-xl px-4 py-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{section.title}</summary>
    <div className="space-y-3 break-words px-4 pb-4 text-sm leading-relaxed text-text-secondary"><Blocks lines={section.lines} /></div>
  </details>)}</div>
}
