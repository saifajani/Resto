/**
 * Photo storage for demo mode. Photos are too big for localStorage (about
 * 5 MB in total), so they go in IndexedDB, keyed by the same path the real
 * bucket uses.
 */

const DB_NAME = 'resto-demo-photos'
const STORE = 'photos'

let opening: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      opening = null
      reject(request.error)
    }
  })
  return opening
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const request = action(db.transaction(STORE, mode).objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export const demoPhotos = {
  put: (path: string, photo: Blob) => run('readwrite', (s) => s.put(photo, path)).then(() => undefined),
  get: (path: string) => run<Blob | undefined>('readonly', (s) => s.get(path)),
  remove: (path: string) => run('readwrite', (s) => s.delete(path)).then(() => undefined),
  /** Removes every photo whose path starts with `folder/`. */
  removeFolder: (folder: string) =>
    run('readwrite', (s) => s.delete(IDBKeyRange.bound(`${folder}/`, `${folder}/￿`))).then(() => undefined),
}
