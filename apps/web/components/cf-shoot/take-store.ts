import type { Brand, Idea } from './api'
import type { TakeUploadSession } from './upload'

export interface StoredTake {
  id: string
  state: 'recording' | 'ready'
  createdAt: number
  mimeType: string
  durationMs: number
  recovered: boolean
  chunkCount: number
  size: number
  meta: { brand: Brand; idea: Idea | null; title: string | null; text: string }
  assetName?: string
  fileName?: string
  kept: boolean
  upload: { session: TakeUploadSession | null; partsDone: number; percent: number }
}

export type TakePatch = Omit<Partial<StoredTake>, 'upload'> & { upload?: Partial<StoredTake['upload']> }

export interface TakeStore {
  beginTake(record: StoredTake): Promise<void>
  putChunk(id: string, seq: number, blob: Blob): Promise<void>
  finalizeTake(id: string, patch: TakePatch): Promise<void>
  updateTake(id: string, patch: TakePatch): Promise<void>
  readBlob(id: string, mimeType: string): Promise<Blob>
  readChunk(id: string, seq: number): Promise<Blob | ArrayBuffer | undefined>
  listTakes(): Promise<StoredTake[]>
  deleteTake(id: string): Promise<void>
  chunkSeqs(id: string): Promise<number[]>
}

function chunkKey(id: string, seq: number): string {
  return `${id}:${String(seq).padStart(6, '0')}`
}

function makeStore(db: IDBDatabase, ranges: typeof IDBKeyRange): TakeStore {
  const range = (id: string) => ranges.bound(`${id}:`, `${id}:\uffff`)

  // Requests succeeding does not mean their transaction committed (quota errors
  // can arrive later). Every operation, including reads, settles with the tx.
  function transact<T>(names: string[], mode: IDBTransactionMode, run: (
    tx: IDBTransaction, result: (value: T) => void, fail: (error: unknown) => void,
  ) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(names, mode)
        let result: T
        tx.oncomplete = () => resolve(result)
        tx.onerror = () => reject(new Error('Take storage failed'))
        tx.onabort = () => reject(new Error('Take storage was interrupted'))
        run(tx, (value) => { result = value }, reject)
      } catch (error) {
        reject(error)
      }
    })
  }

  function read<T>(name: string, request: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return transact([name], 'readonly', (tx, result, fail) => {
      const req = request(tx.objectStore(name))
      req.onsuccess = () => result(req.result)
      req.onerror = () => fail(req.error)
    })
  }

  function updateTake(id: string, patch: TakePatch): Promise<void> {
    return transact(['takes'], 'readwrite', (tx, result, fail) => {
      const store = tx.objectStore('takes')
      const req = store.get(id)
      req.onerror = () => fail(req.error)
      req.onsuccess = () => {
        try {
          const record = req.result as StoredTake | undefined
          if (!record) throw new Error('Take no longer exists on this phone')
          const put = store.put({ ...record, ...patch, id, upload: { ...record.upload, ...patch.upload } })
          put.onerror = () => fail(put.error)
          result(undefined)
        } catch (error) {
          fail(error)
        }
      }
    })
  }

  function putChunkData(id: string, seq: number, data: Blob | ArrayBuffer, size: number): Promise<void> {
    return transact(['takes', 'chunks'], 'readwrite', (tx, result, fail) => {
      const takes = tx.objectStore('takes')
      const chunks = tx.objectStore('chunks')
      const recordRequest = takes.get(id)
      recordRequest.onerror = () => fail(recordRequest.error)
      recordRequest.onsuccess = () => {
        const record = recordRequest.result as StoredTake | undefined
        if (!record) { fail(new Error('Take no longer exists on this phone')); return }
        const previous = chunks.get(chunkKey(id, seq))
        previous.onerror = () => fail(previous.error)
        previous.onsuccess = () => {
          try {
            const old = previous.result as Blob | ArrayBuffer | undefined
            const oldSize = old instanceof Blob ? old.size : old?.byteLength ?? 0
            const put = chunks.put(data, chunkKey(id, seq))
            put.onerror = () => fail(put.error)
            // Keep crash recovery metadata in the same transaction as the chunk.
            const metadata = takes.put({ ...record, chunkCount: Math.max(record.chunkCount, seq + 1), size: record.size + size - oldSize })
            metadata.onerror = () => fail(metadata.error)
            result(undefined)
          } catch (error) {
            fail(error)
          }
        }
      }
    })
  }

  return {
    beginTake: (record) => transact(['takes'], 'readwrite', (tx, result, fail) => {
      const put = tx.objectStore('takes').put(record)
      put.onerror = () => fail(put.error)
      result(undefined)
    }),
    async putChunk(id, seq, blob) {
      try {
        await putChunkData(id, seq, blob, blob.size)
      } catch (error) {
        if (!(typeof error === 'object' && error !== null && 'name' in error && error.name === 'DataCloneError')) throw error
        // Older WebKit versions may reject structured cloning of a Blob.
        await putChunkData(id, seq, await blob.arrayBuffer(), blob.size)
      }
    },
    updateTake,
    finalizeTake: updateTake,
    async readBlob(id, mimeType) {
      const parts = await read<BlobPart[]>('chunks', (store) => store.getAll(range(id)))
      return new Blob(parts, { type: mimeType })
    },
    readChunk: (id, seq) => read('chunks', (store) => store.get(chunkKey(id, seq))),
    listTakes: () => read('takes', (store) => store.getAll()),
    deleteTake: (id) => transact(['takes', 'chunks'], 'readwrite', (tx, result, fail) => {
      const record = tx.objectStore('takes').delete(id)
      const chunks = tx.objectStore('chunks').delete(range(id))
      record.onerror = () => fail(record.error)
      chunks.onerror = () => fail(chunks.error)
      result(undefined)
    }),
    async chunkSeqs(id) {
      const keys = await read('chunks', (store) => store.getAllKeys(range(id)))
      return keys.map((key) => Number(String(key).slice(id.length + 1)))
    },
  }
}

export function openTakeStore(env: { indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange } = globalThis): Promise<TakeStore | null> {
  return new Promise((resolve) => {
    try {
      const { indexedDB, IDBKeyRange: ranges } = env
      if (!indexedDB || !ranges) { resolve(null); return }
      const request = indexedDB.open('cf-shoot', 1)
      request.onupgradeneeded = () => {
        try {
          const db = request.result
          if (!db.objectStoreNames.contains('takes')) db.createObjectStore('takes', { keyPath: 'id' })
          if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks')
        } catch {
          resolve(null)
        }
      }
      request.onsuccess = () => resolve(makeStore(request.result, ranges))
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

let defaultStore: Promise<TakeStore | null> | undefined

export function getTakeStore(): Promise<TakeStore | null> {
  defaultStore ??= openTakeStore()
  return defaultStore
}

export function resetTakeStoreForTests(): void {
  defaultStore = undefined
}
