'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Brand, StyleDetail as StyleDetailData } from './types'
import { archiveStyle, createInterview, createStyle, improveStyle, makeDefault, patchStyle } from './api'
import { currentVersion, isBuilding, styleUrl, useStyle, useStyleAction, useStyleLive } from './use-style'
import { StyleCard } from './style-card'
import { Recommendations } from './recommendations'
import { DesignMarkdown } from './design-markdown'
import { VersionHistory } from './version-history'
import { ErrorState, Loading, StudioDialog, actionClass, fieldClass, panelClass, primaryClass } from './ui'

export function StyleDetail({ brand, id }: { brand: Brand; id: string }) {
  const result = useStyle(id)
  const refresh = useStyleLive(brand, [id])
  if (result.error) return <ErrorState retry={() => { void result.mutate() }}>Could not load this style.</ErrorState>
  if (!result.data) return <Loading />
  if (result.data.brand !== brand.brand) return <p>Style not found for this brand.</p>
  return <StyleDetailContent key={id} brand={brand} style={result.data} refresh={refresh} />
}
export function StyleDetailContent({ brand, style, refresh }: { brand: Brand; style: StyleDetailData; refresh: () => void }) {
  const router = useRouter()
  const action = useStyleAction(refresh)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [request, setRequest] = useState('')
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(style.name)
  const [description, setDescription] = useState(style.description ?? '')
  const [dialog, setDialog] = useState<'duplicate' | 'archive' | null>(null)
  const [copyName, setCopyName] = useState(`${style.name} copy`.slice(0, 80))
  const canEdit = brand.role === 'owner'
  const current = currentVersion(style)
  const versions = [...style.versions].sort((a, b) => b.version - a.version)
  const selected = versions.find((version) => version.id === selectedId) ?? current ?? versions[0]
  // A proposal older than the approved version can no longer replace it, so only a newer one is compared.
  const proposed = versions.find((version) => version.status === 'proposed' && (!current || version.version > current.version))
  return <div className="space-y-6">
    <header className="space-y-3"><div className="flex flex-wrap items-center gap-3"><h1 className="break-words text-3xl font-semibold">{style.name}</h1>{style.is_default && <span className="rounded-full bg-accent-muted px-3 py-1 text-xs text-accent">Default</span>}</div>
      {style.description && <p className="break-words text-sm text-text-secondary">{style.description}</p>}
      {canEdit && <div className="flex flex-wrap gap-2"><button className={actionClass} disabled={action.busy || style.is_default || !current} onClick={() => { void action.run(() => makeDefault(style.id)) }}>Make default</button><button className={actionClass} onClick={() => { setName(style.name); setDescription(style.description ?? ''); setEditing(!editing) }}>Rename</button><button className={actionClass} onClick={() => setDialog('duplicate')}>Duplicate</button><button className={actionClass} disabled={style.is_default} title={style.is_default ? 'Choose another default before archiving this style.' : undefined} onClick={() => setDialog('archive')}>Archive</button></div>}
    </header>
    {editing && canEdit && <form className={`${panelClass} space-y-3`} onSubmit={(event) => { event.preventDefault(); void action.run(async () => { await patchStyle(style.id, { name: name.trim(), description: description.trim() }); setEditing(false) }) }}>
      <label className="block text-sm">Name<input className={fieldClass} value={name} required maxLength={80} onChange={(event) => setName(event.target.value)} /></label><label className="block text-sm">Description<textarea className={fieldClass} value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} /></label><button className={primaryClass} disabled={action.busy || !name.trim()}>Save name and description</button>
    </form>}
    {action.error && <ErrorState>{action.error}</ErrorState>}
    {isBuilding(style) && <p role="status" className={`${panelClass} text-sm text-text-secondary`}>Flo is building your style. This usually takes about 15 minutes. You will get a text when it is ready.</p>}
    <div className="grid min-w-0 items-start gap-6 lg:grid-cols-2"><section className={`${panelClass} space-y-4`}><h2 className="font-semibold">{selected ? `Version ${selected.version}` : 'Your style draft'}</h2><StyleCard name={style.name} version={selected} /></section><section className="min-w-0 space-y-4"><h2 className="text-xl font-semibold">Style guide</h2><DesignMarkdown markdown={selected?.design_md} /></section></div>
    {current && proposed && <section className="space-y-4" aria-label="Compare versions"><h2 className="text-xl font-semibold">Compare the change</h2><div className="grid min-w-0 gap-4 md:grid-cols-2"><div className={`${panelClass} space-y-3`}><h3>Current approved · v{current.version}</h3><StyleCard name={`${style.name} current`} version={current} /></div><div className={`${panelClass} space-y-3`}><h3>Proposed · v{proposed.version}</h3><StyleCard name={`${style.name} proposed`} version={proposed} /></div></div></section>}
    {canEdit ? <section className={`${panelClass} space-y-4`}><h2 className="text-xl font-semibold">Improve your style</h2>{current ? <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void action.run(async () => { await improveStyle(style.id, request.trim()); setRequest('') }) }}><label className="block space-y-2 text-sm">What should change?<textarea className={`${fieldClass} min-h-28`} maxLength={4000} value={request} onChange={(event) => setRequest(event.target.value)} required /></label><p className="text-xs text-text-secondary">{request.length}/4000</p><button className={primaryClass} disabled={action.busy || !request.trim()}>Send</button></form> : <p className="text-sm text-text-secondary">Approve a version first. Then you can ask for changes in your own words.</p>}<button className={actionClass} disabled={action.busy} onClick={() => { void action.run(async () => { const interview = await createInterview({ brand: brand.brand, style_id: style.id, mode: 'improve' }); router.push(styleUrl(brand.brand, `interview/${encodeURIComponent(interview.id)}`)) }) }}>Retake the interview</button></section> : <p className="text-sm text-text-secondary">Only the brand owner can change or approve styles.</p>}
    <Recommendations brand={brand.brand} styleId={style.id} onChange={refresh} canEdit={!!canEdit} />
    <VersionHistory versions={versions} currentId={current?.id ?? style.current_version_id} selectedId={selected?.id} onSelect={setSelectedId} canEdit={!!canEdit} busy={action.busy} run={action.run} />
    <StudioDialog open={dialog !== null} onOpenChange={(open) => { if (!open && !action.busy) setDialog(null) }} title={dialog === 'archive' ? 'Archive this style?' : 'Duplicate this style'} description={dialog === 'archive' ? 'This style will leave your active collection. Existing videos keep their recorded style version.' : 'Give the copy a name. It will belong to this brand.'}>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void action.run(async () => {
        if (dialog === 'archive') { if (style.is_default) return; await archiveStyle(style.id); router.push(styleUrl(brand.brand)) }
        else { const copy = await createStyle({ brand: brand.brand, name: copyName.trim(), copy_of: style.id }); router.push(styleUrl(brand.brand, encodeURIComponent(copy.id))) }
        setDialog(null)
      }) }}>
        {dialog === 'duplicate' && <label className="block text-sm">Copy name<input className={fieldClass} maxLength={80} required value={copyName} onChange={(event) => setCopyName(event.target.value)} /></label>}
        {action.error && <ErrorState>{action.error}</ErrorState>}<button className={primaryClass} disabled={action.busy || (dialog === 'duplicate' && !copyName.trim()) || (dialog === 'archive' && style.is_default)}>{dialog === 'archive' ? 'Archive style' : 'Create copy'}</button>
      </form>
    </StudioDialog>
  </div>
}
