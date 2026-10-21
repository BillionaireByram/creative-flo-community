import { describe, expect, it } from 'vitest'
import { openTakeStore, type TakeStore } from '../take-store'
import { createIdbShim } from './idb-shim'
import { blobText, storedTake } from './recorder-fixtures'

async function opened(env = createIdbShim()): Promise<TakeStore> {
  const store = await openTakeStore(env)
  if (!store) throw new Error('Store did not open')
  return store
}

describe('take store', () => {
  it('commits metadata and chunks, reads numeric sequence order beyond ten, and lists takes', async () => {
    const store = await opened()
    await store.beginTake(storedTake())
    for (const seq of [11, 2, 10, 0, 1, 9, 3, 4, 5, 6, 7, 8]) {
      await store.putChunk('take-1', seq, new Blob([`${seq},`]))
    }
    await store.finalizeTake('take-1', { state: 'ready', durationMs: 12_000 })
    const blob = await store.readBlob('take-1', 'video/mp4')
    expect(blob.type).toBe('video/mp4')
    expect(await blobText(blob)).toBe('0,1,2,3,4,5,6,7,8,9,10,11,')
    expect(await store.chunkSeqs('take-1')).toEqual(Array.from({ length: 12 }, (_, i) => i))
    expect(await store.listTakes()).toEqual([expect.objectContaining({
      id: 'take-1', state: 'ready', durationMs: 12_000, chunkCount: 12, size: blob.size,
    })])
  })

  it('reopens the same version without erasing existing records', async () => {
    const env = createIdbShim()
    const first = await opened(env)
    await first.beginTake(storedTake())
    await first.putChunk('take-1', 0, new Blob(['retained']))
    const second = await opened(env)
    expect((await second.listTakes())).toHaveLength(1)
    expect(await blobText(await second.readBlob('take-1', 'video/mp4'))).toBe('retained')
  })

  it('merges nested upload patches and serializes concurrent read-modify-write transactions', async () => {
    const store = await opened()
    await store.beginTake(storedTake())
    const session = { upload_id: 'u', s3_key: 's', asset_id: 'a', version_id: 'v', chunk_size_bytes: 4 }
    await Promise.all([
      store.updateTake('take-1', { kept: true, upload: { session } }),
      store.updateTake('take-1', { upload: { partsDone: 2, percent: 50 } }),
    ])
    expect((await store.listTakes())[0]).toMatchObject({ kept: true, upload: { session, partsDone: 2, percent: 50 } })
    await expect(store.updateTake('missing', { kept: true })).rejects.toThrow()
  })

  it('deletes only the requested record and its full chunk range in one transaction', async () => {
    const store = await opened()
    for (const id of ['take-1', 'take-10']) {
      await store.beginTake(storedTake({ id }))
      await store.putChunk(id, 0, new Blob(['a']))
      await store.putChunk(id, 10, new Blob(['b']))
    }
    await store.deleteTake('take-1')
    expect(await store.chunkSeqs('take-1')).toEqual([])
    expect((await store.readBlob('take-1', 'video/mp4')).size).toBe(0)
    expect((await store.listTakes()).map((take) => take.id)).toEqual(['take-10'])
    expect(await blobText(await store.readBlob('take-10', 'video/mp4'))).toBe('ab')
  })

  it.each(['throw', 'request'] as const)('retries a Blob DataCloneError from %s as an ArrayBuffer', async (mode) => {
    const env = createIdbShim()
    const store = await opened(env)
    await store.beginTake(storedTake())
    const buffer = new Uint8Array([97, 98, 99]).buffer
    const blob = new Blob(['abc'])
    Object.defineProperty(blob, 'arrayBuffer', { value: async () => buffer })
    env.failNextBlobPut(mode)
    await store.putChunk('take-1', 0, blob)
    expect(await store.readChunk('take-1', 0)).toBe(buffer)
    expect(await blobText(await store.readBlob('take-1', 'video/mp4'))).toBe('abc')
  })

  it('rejects a failed transaction and retains previously committed data', async () => {
    const env = createIdbShim()
    const store = await opened(env)
    await store.beginTake(storedTake())
    env.failPutsAfter(1) // Chunk put succeeds; metadata put fails and rolls both back.
    await expect(store.putChunk('take-1', 0, new Blob(['abc']))).rejects.toBeTruthy()
    expect(await store.chunkSeqs('take-1')).toEqual([])
    expect((await store.listTakes())[0].size).toBe(0)
  })

  it('returns null without IDB or when opening throws', async () => {
    await expect(openTakeStore({})).resolves.toBeNull()
    const env = createIdbShim()
    await expect(openTakeStore({ ...env, indexedDB: {
      open: () => { throw new DOMException('Private mode', 'SecurityError') },
    } as unknown as IDBFactory })).resolves.toBeNull()
  })
})
