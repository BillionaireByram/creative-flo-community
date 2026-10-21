// A deliberately small IDB surface, with asynchronous request events and atomic,
// serialized transactions. Values are stored by reference, including Blobs.
interface Range { includes(key: string): boolean }
type Query = string | Range
interface Request<T> {
  result: T
  error: DOMException | null
  onsuccess: (() => void) | null
  onerror: (() => void) | null
}
interface StoreData { keyPath?: string; values: Map<string, unknown> }

function request<T>(): Request<T> {
  return { result: undefined as T, error: null, onsuccess: null, onerror: null }
}

function matches(key: string, query?: Query): boolean {
  return query === undefined || (typeof query === 'string' ? key === query : query.includes(key))
}

export function createIdbShim() {
  const databases = new Map<string, Database>()
  let putsLeft = Infinity
  let rejectBlob: 'throw' | 'request' | null = null

  class Database {
    version = 0
    stores = new Map<string, StoreData>()
    tail: Promise<void> = Promise.resolve()
    objectStoreNames = { contains: (name: string) => this.stores.has(name) }
    createObjectStore(name: string, options?: { keyPath?: string }) {
      this.stores.set(name, { keyPath: options?.keyPath, values: new Map() })
    }
    transaction(names: string | string[], mode: IDBTransactionMode) {
      return new Transaction(this, typeof names === 'string' ? [names] : names, mode)
    }
  }

  class Transaction {
    oncomplete: (() => void) | null = null
    onerror: (() => void) | null = null
    onabort: (() => void) | null = null
    error: DOMException | null = null
    private active = false
    private ended = false
    private draining = false
    private tasks: Array<() => void> = []
    private copies = new Map<string, StoreData>()
    private completion: ReturnType<typeof setTimeout> | undefined
    private release!: () => void

    constructor(private db: Database, private names: string[], private mode: IDBTransactionMode) {
      const previous = db.tail
      db.tail = new Promise<void>((resolve) => { this.release = resolve })
      void previous.then(() => {
        for (const name of names) {
          const store = db.stores.get(name)
          if (!store) throw new Error(`Missing store ${name}`)
          this.copies.set(name, { keyPath: store.keyPath, values: new Map(store.values) })
        }
        this.active = true
        this.schedule()
      })
    }

    private enqueue<T>(operation: () => T): Request<T> {
      if (this.ended) throw new DOMException('Inactive', 'TransactionInactiveError')
      const req = request<T>()
      this.tasks.push(() => {
        try {
          req.result = operation()
          req.onsuccess?.()
        } catch (error) {
          req.error = error instanceof DOMException ? error : new DOMException(String(error), 'UnknownError')
          this.error = req.error
          this.ended = true
          req.onerror?.()
          this.onerror?.()
          this.onabort?.()
          this.release()
        }
      })
      if (this.completion !== undefined) clearTimeout(this.completion)
      this.schedule()
      return req
    }

    private schedule() {
      if (!this.active || this.ended || this.draining) return
      this.draining = true
      queueMicrotask(() => {
        this.draining = false
        if (this.ended) return
        const task = this.tasks.shift()
        if (task) {
          task()
          this.schedule()
        } else {
          this.completion = setTimeout(() => {
            if (this.ended || this.tasks.length > 0) return
            this.ended = true
            if (this.mode === 'readwrite') {
              for (const name of this.names) {
                const copy = this.copies.get(name)
                if (copy) this.db.stores.set(name, copy)
              }
            }
            this.oncomplete?.()
            this.release()
          }, 0)
        }
      })
    }

    objectStore(name: string) {
      if (!this.names.includes(name)) throw new Error(`Store ${name} is outside transaction`)
      const data = () => {
        const store = this.copies.get(name)
        if (!store) throw new Error(`Missing store ${name}`)
        return store
      }
      const keys = (query?: Query) => Array.from(data().values.keys())
        .filter((key) => matches(key, query)).sort((a, b) => a < b ? -1 : a > b ? 1 : 0)
      return {
        put: (value: unknown, key?: string) => {
          let cloneError = false
          if (value instanceof Blob && rejectBlob) {
            const mode = rejectBlob
            rejectBlob = null
            if (mode === 'throw') throw new DOMException('Cannot clone Blob', 'DataCloneError')
            cloneError = true
          }
          return this.enqueue(() => {
            if (cloneError) throw new DOMException('Cannot clone Blob', 'DataCloneError')
            if (putsLeft <= 0) throw new DOMException('Full', 'QuotaExceededError')
            putsLeft -= 1
            const store = data()
            const actual = store.keyPath ? (value as Record<string, unknown>)[store.keyPath] : key
            if (typeof actual !== 'string') throw new DOMException('Missing key', 'DataError')
            store.values.set(actual, value)
            return actual
          })
        },
        get: (key: string) => this.enqueue(() => data().values.get(key)),
        getAll: (query?: Query) => this.enqueue(() => keys(query).map((key) => data().values.get(key))),
        getAllKeys: (query?: Query) => this.enqueue(() => keys(query)),
        delete: (query: Query) => this.enqueue(() => { for (const key of keys(query)) data().values.delete(key) }),
      }
    }
  }

  const indexedDB = {
    open(name: string, version = 1) {
      const req = Object.assign(request<Database>(), {
        onupgradeneeded: null as (() => void) | null,
        onblocked: null as (() => void) | null,
      })
      queueMicrotask(() => {
        try {
          const db = databases.get(name) ?? new Database()
          databases.set(name, db)
          req.result = db
          if (version < db.version) {
            req.error = new DOMException('Older version requested', 'VersionError')
            req.onerror?.()
            return
          }
          if (db.version < version) {
            db.version = version
            req.onupgradeneeded?.()
          }
          req.onsuccess?.()
        } catch {
          req.error = new DOMException('Open failed', 'UnknownError')
          req.onerror?.()
        }
      })
      return req
    },
  }
  const ranges = {
    bound: (lower: string, upper: string): Range => ({ includes: (key) => key >= lower && key <= upper }),
  }
  return {
    indexedDB: indexedDB as unknown as IDBFactory,
    IDBKeyRange: ranges as unknown as typeof IDBKeyRange,
    failPutsAfter: (n: number) => { putsLeft = n },
    failNextBlobPut: (mode: 'throw' | 'request') => { rejectBlob = mode },
  }
}
