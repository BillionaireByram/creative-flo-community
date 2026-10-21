import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssetGrid } from '../asset-grid'
import { FolderCard } from '../folder-card'
import { FolderTree } from '../folder-tree'
import { useViewStore } from '@/stores/view-store'
import { resetPointerMemory } from '@/lib/touch'
import { setCoarsePointer } from '@/test/setup'
import type { Asset, Folder } from '@/types'

vi.mock('swr', () => ({ default: () => ({ data: undefined }) }))

const asset: Asset = {
  id: 'a1', project_id: 'p1', name: 'Film', description: null, asset_type: 'video',
  status: 'in_review', rating: null, assignee_id: null, folder_id: null, due_date: null,
  keywords: [], created_by: 'u1', created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null,
}
const folder: Folder = {
  id: 'f1', project_id: 'p1', parent_id: null, name: 'Footage', item_count: 0,
  created_by: 'u1', created_at: '2026-01-01', updated_at: '2026-01-01',
}

function pointer(target: Element, type: string, pointerType = 'touch', x = 0) {
  const event = new Event(type, { bubbles: true })
  Object.assign(event, { pointerType, clientX: x, clientY: 0 })
  fireEvent(target, event)
}

beforeEach(() => {
  useViewStore.setState({ layout: 'grid', cardSize: 'M', flattenFolders: false, showCardInfo: true })
})
afterEach(() => {
  cleanup()
  setCoarsePointer(false)
  resetPointerMemory()
  vi.useRealTimers()
})

describe.each(['grid', 'list'] as const)('%s file browser', (layout) => {
  beforeEach(() => useViewStore.setState({ layout }))

  it('opens with a finger even when the primary pointer is a mouse', () => {
    const open = vi.fn(), select = vi.fn()
    render(<AssetGrid assets={[asset]} projectId="p1" onAssetOpen={open} onAssetSelect={select} />)
    pointer(screen.getByText('Film'), 'pointerdown')
    fireEvent.click(screen.getByText('Film'))
    expect(open).toHaveBeenCalledWith(asset)
    expect(select).not.toHaveBeenCalled()
  })

  it('selects with an iPad trackpad and still opens on double-click', () => {
    setCoarsePointer(true)
    const open = vi.fn(), select = vi.fn()
    render(<AssetGrid assets={[asset]} projectId="p1" onAssetOpen={open} onAssetSelect={select} />)
    pointer(screen.getByText('Film'), 'pointerdown', 'mouse')
    fireEvent.click(screen.getByText('Film'))
    expect(select).toHaveBeenCalledWith(asset, expect.anything())
    expect(open).not.toHaveBeenCalled()
    fireEvent.doubleClick(screen.getByText('Film'))
    expect(open).toHaveBeenCalledWith(asset)
  })

  it('keeps touch taps in share mode as selection', () => {
    setCoarsePointer(true)
    const open = vi.fn(), folderOpen = vi.fn()
    render(<AssetGrid assets={[asset]} folders={[folder]} projectId="p1" shareMode onAssetOpen={open} onFolderOpen={folderOpen} />)
    fireEvent.click(screen.getByText('Film'))
    fireEvent.click(screen.getByText('Footage'))
    expect(screen.getByRole('button', { name: 'Select Film' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Select Footage' })).toHaveAttribute('aria-pressed', 'true')
    expect(open).not.toHaveBeenCalled()
    expect(folderOpen).not.toHaveBeenCalled()
  })

  it('selects on long-press and swallows its ending click', () => {
    vi.useFakeTimers()
    const open = vi.fn(), select = vi.fn()
    render(<AssetGrid assets={[asset]} projectId="p1" onAssetOpen={open} onAssetSelect={select} />)
    const name = screen.getByText('Film')
    pointer(name, 'pointerdown')
    act(() => vi.advanceTimersByTime(500))
    pointer(name, 'pointerup')
    fireEvent.click(name)
    expect(screen.getByRole('button', { name: 'Select Film' })).toHaveAttribute('aria-pressed', 'true')
    expect(open).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
  })

  it('cancels long-press while scrolling', () => {
    vi.useFakeTimers()
    render(<AssetGrid assets={[asset]} projectId="p1" />)
    pointer(screen.getByText('Film'), 'pointerdown')
    pointer(screen.getByText('Film'), 'pointermove', 'touch', 20)
    act(() => vi.advanceTimersByTime(500))
    expect(screen.getByRole('button', { name: 'Select Film' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('lets the checkbox select without opening', () => {
    setCoarsePointer(true)
    const open = vi.fn()
    render(<AssetGrid assets={[asset]} projectId="p1" onAssetOpen={open} />)
    fireEvent.click(screen.getByRole('button', { name: 'Select Film' }))
    expect(open).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Select Film' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('exposes selection and actions without hover', () => {
    render(<AssetGrid assets={[asset]} folders={[folder]} projectId="p1" onFolderOpen={vi.fn()} />)
    for (const name of ['Select Film', 'Select Footage']) {
      const checkbox = screen.getByRole('button', { name })
      expect(checkbox.className.split(/\s+/)).not.toContain('opacity-0')
    }
    expect(document.querySelectorAll('.opacity-0')).toHaveLength(0)
  })
})

describe('folder cards', () => {
  it('opens on touch and keeps mouse click-select / double-click-open', () => {
    setCoarsePointer(true)
    const open = vi.fn(), select = vi.fn()
    render(<FolderCard folder={folder} onOpen={open} onSelect={select} />)
    fireEvent.click(screen.getByText('Footage'))
    expect(open).toHaveBeenCalledOnce()
    pointer(screen.getByText('Footage'), 'pointerdown', 'mouse')
    fireEvent.click(screen.getByText('Footage'))
    expect(select).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledOnce()
    fireEvent.doubleClick(screen.getByText('Footage'))
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('selects folders on long-press without opening them', () => {
    vi.useFakeTimers()
    const open = vi.fn()
    render(<AssetGrid assets={[]} folders={[folder]} projectId="p1" onFolderOpen={open} />)
    pointer(screen.getByText('Footage'), 'pointerdown')
    act(() => vi.advanceTimersByTime(500))
    pointer(screen.getByText('Footage'), 'pointerup')
    fireEvent.click(screen.getByText('Footage'))
    expect(open).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Select Footage' })).toHaveAttribute('aria-pressed', 'true')
  })

  it.each([false, true])('disables HTML dragging only with a coarse pointer (%s)', (coarse) => {
    setCoarsePointer(coarse)
    render(<AssetGrid assets={[asset]} folders={[folder]} projectId="p1" onFolderOpen={vi.fn()} />)
    for (const card of [screen.getByTestId('folder-card'), screen.getByTestId('asset-card')]) {
      expect(card).toHaveAttribute('draggable', String(!coarse))
      expect(card).toHaveAttribute('data-touch-card')
    }
  })

  it('fits its menu and dismisses it on an outside tap without opening the folder', async () => {
    const open = vi.fn()
    render(<FolderCard folder={folder} onOpen={open} />)
    const menuButton = screen.getByRole('button', { name: 'Actions for Footage' })
    expect(menuButton.className.split(/\s+/)).not.toContain('opacity-0')
    await userEvent.click(menuButton)
    const menu = await screen.findByRole('menu')
    expect(menu.className).toContain('max-w-[calc(100vw-16px)]')
    expect(menu.className).toContain('--radix-dropdown-menu-content-available-height')
    expect(screen.getByRole('menuitem', { name: 'Rename' }).className).toContain('[@media(pointer:coarse)]:min-h-11')
    pointer(document.body, 'pointerdown')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(open).not.toHaveBeenCalled()
  })

  it('uses two phone columns for medium folders without changing desktop columns', () => {
    render(<AssetGrid assets={[]} folders={[folder]} projectId="p1" onFolderOpen={vi.fn()} />)
    const grid = screen.getByTestId('folder-card').parentElement!.parentElement!
    expect(grid.className).toContain('grid-cols-2')
    expect(grid.className).toContain('lg:grid-cols-3')
  })

  it('provides finger sized tree rows and actions without hover', () => {
    render(<FolderTree tree={[{ ...folder, children: [] }]} projectName="Project" currentFolderId={null} showTrash={false} onSelectFolder={vi.fn()} onShowTrash={vi.fn()} onCreateFolder={vi.fn()} onRenameFolder={vi.fn()} onDeleteFolder={vi.fn()} />)
    expect(screen.getByText('Footage').parentElement!.className).toContain('[@media(pointer:coarse)]:min-h-11')
    expect(document.querySelectorAll('.opacity-0')).toHaveLength(0)
  })
})
