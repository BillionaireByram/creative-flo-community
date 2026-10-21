'use client'

import useSWR from 'swr'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createInterview, getStyle, styleKey } from './api'
import type { Brand, Style } from './types'
import { detailRefreshInterval, currentVersion, isBuilding, styleUrl, useStyleAction, useStyleLive, useStyles } from './use-style'
import { StyleCard } from './style-card'
import { rememberInterview, rememberedInterview } from './interview/resume'
import { Recommendations } from './recommendations'
import { ErrorState, Loading, StudioDialog, actionClass, panelClass, primaryClass } from './ui'

export function StyleStatus({ style }: { style: Style }) {
  if (isBuilding(style)) return <span role="status" className="rounded-full bg-accent-muted px-3 py-1 text-xs text-accent">Flo is building...</span>
  if (style.open_proposals > 0) return <span className="rounded-full bg-accent-muted px-3 py-1 text-xs text-accent">New version to review</span>
  return null
}
export function StyleHome({ brand }: { brand: Brand }) {
  const { data, error, mutate } = useStyles(brand.brand)
  const refresh = useStyleLive(brand, data?.map((style) => style.id))
  const router = useRouter()
  const action = useStyleAction(refresh)
  const [newOpen, setNewOpen] = useState(false)
  const [resumeId, setResumeId] = useState<string | null>(null)
  useEffect(() => { setResumeId(rememberedInterview(brand.brand)) }, [brand.brand])
  const canEdit = brand.role === 'owner'
  const start = () => action.run(async () => {
    const interview = await createInterview({ brand: brand.brand, mode: 'new' })
    rememberInterview(brand.brand, interview.id)
    router.push(styleUrl(brand.brand, `interview/${encodeURIComponent(interview.id)}`))
  })
  if (error) return <ErrorState retry={() => { void mutate() }}>Could not load your styles.</ErrorState>
  if (!data) return <Loading />
  const styles = data
  const ready = styles.some((style) => !!currentVersion(style))
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">Your editing styles</h1><p className="mt-2 text-sm text-text-secondary">A look that stays yours, from the first frame to the last.</p></div>
      <div className="flex flex-wrap gap-2">{canEdit && <button type="button" className={primaryClass} onClick={() => setNewOpen(true)}>New style</button>}<Link className={actionClass} href={styleUrl(brand.brand, 'templates')}>Templates</Link></div></header>
    {canEdit && resumeId && <aside className={`${panelClass} flex flex-wrap items-center justify-between gap-3`}><p className="text-sm text-text-secondary">Your interview is saved. Pick up where you left off.</p><Link className={primaryClass} href={styleUrl(brand.brand, `interview/${encodeURIComponent(resumeId)}`)}>Resume your interview</Link></aside>}
    {!ready && <section className={`${panelClass} space-y-4 bg-gradient-to-br from-accent-muted to-bg-secondary`}><p className="text-xs uppercase tracking-widest text-accent">Your first style</p><h2 className="text-3xl font-semibold">Let&apos;s build your style</h2><p className="max-w-xl text-sm leading-relaxed text-text-secondary">About 10 minutes. Tell us about your brand and rate live samples. Flo will build an editing style for you to review.</p>
      {canEdit ? <div className="flex flex-wrap gap-3"><button type="button" className={primaryClass} disabled={action.busy} onClick={() => { void start() }}>Start the interview</button><Link className={actionClass} href={styleUrl(brand.brand, 'templates')}>Start from a template</Link></div> : <p className="text-sm text-text-secondary">Your brand owner can start the interview.</p>}
    </section>}
    {action.error && <ErrorState>{action.error}</ErrorState>}
    <div className="grid min-w-0 gap-5 md:grid-cols-2 xl:grid-cols-3">{styles.map((style) => <HomeStyleTile key={style.id} brand={brand.brand} style={style} />)}</div>
    <Recommendations brand={brand.brand} canEdit={canEdit} onChange={refresh} />
    <StudioDialog open={newOpen} onOpenChange={setNewOpen} title="Start a new style" description="Explore your look from scratch or customize a starting point."><div className="grid gap-3"><button type="button" className={primaryClass} disabled={action.busy} onClick={() => { void start() }}>Take the interview</button><Link className={actionClass} href={styleUrl(brand.brand, 'templates')}>Start from a template</Link>{action.error && <ErrorState>{action.error}</ErrorState>}</div></StudioDialog>
  </div>
}

function HomeStyleTile({ style, brand }: { style: Style; brand: string }) {
  // A style whose first version is still being built or reviewed has no approved version yet, so load its history to show the draft.
  const detail = useSWR(style.current_version ? null : styleKey(style.id), () => getStyle(style.id), { refreshInterval: detailRefreshInterval })
  const draft = detail.data?.brand === brand ? detail.data.versions[0] : undefined
  const version = currentVersion(style) ?? draft
  return <article className={`${panelClass} space-y-4`}><div className="flex flex-wrap items-center gap-2"><h2 className="min-w-0 flex-1 break-words text-lg font-semibold"><Link className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" href={styleUrl(brand, encodeURIComponent(style.id))}>{style.name || 'My style'}</Link></h2>{style.is_default && <span className="rounded-full bg-accent-muted px-2 py-1 text-xs text-accent">Default</span>}</div>
    <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-text-secondary">{version ? `Version ${version.version}` : 'Draft'}</span><StyleStatus style={style} /></div>
    {detail.error && <ErrorState retry={() => { void detail.mutate() }}>Could not load the version status.</ErrorState>}
    <StyleCard name={style.name} version={version} /><Link className={`${actionClass} w-full`} href={styleUrl(brand, encodeURIComponent(style.id))}>View style</Link>
  </article>
}
