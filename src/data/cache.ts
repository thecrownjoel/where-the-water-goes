// Local cache for fetched snapshots. Lives entirely on the user's machine.
//
// Retention policy (documented in docs/PRIVACY.md):
// - Only public agency data is cached; nothing about the user is stored.
// - Each key keeps a single latest entry; entries older than `maxAgeMs` are purged on startup.
// - "Clear cached data" in Settings deletes everything.

export interface CacheEntry<T = unknown> {
  key: string;
  storedAt: number;
  value: T;
}

export interface CacheStore {
  get<T>(key: string): Promise<CacheEntry<T> | undefined>;
  put<T>(key: string, value: T, storedAt?: number): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
}

export class MemoryCache implements CacheStore {
  private map = new Map<string, CacheEntry>();
  async get<T>(key: string) { return this.map.get(key) as CacheEntry<T> | undefined; }
  async put<T>(key: string, value: T, storedAt = Date.now()) { this.map.set(key, { key, storedAt, value }); }
  async delete(key: string) { this.map.delete(key); }
  async keys() { return [...this.map.keys()]; }
  async clear() { this.map.clear(); }
}

/** IndexedDB-backed store. Works in browsers and in Tauri webviews (stored in the app data dir). */
export class IndexedDbCache implements CacheStore {
  private db: Promise<IDBDatabase>;
  private readonly store = 'entries';

  constructor(name = 'wtrshd-cache') {
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(this.store, { keyPath: 'key' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async tx<R>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<R>): Promise<R> {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const t = db.transaction(this.store, mode);
      const req = fn(t.objectStore(this.store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async get<T>(key: string) { return (await this.tx('readonly', (s) => s.get(key))) as CacheEntry<T> | undefined; }
  async put<T>(key: string, value: T, storedAt = Date.now()) { await this.tx('readwrite', (s) => s.put({ key, storedAt, value })); }
  async delete(key: string) { await this.tx('readwrite', (s) => s.delete(key)); }
  async keys() { return (await this.tx('readonly', (s) => s.getAllKeys())).map(String); }
  async clear() { await this.tx('readwrite', (s) => s.clear()); }
}

/** Remove entries older than maxAgeMs. Returns the number removed. */
export async function purgeExpired(cache: CacheStore, maxAgeMs: number, now = Date.now()): Promise<number> {
  let removed = 0;
  for (const k of await cache.keys()) {
    const e = await cache.get(k);
    if (!e || now - e.storedAt > maxAgeMs) {
      await cache.delete(k);
      removed++;
    }
  }
  return removed;
}

/** Pick a cache implementation that works in this environment, falling back to memory. */
export function createCache(): CacheStore {
  try {
    if (typeof indexedDB !== 'undefined') return new IndexedDbCache();
  } catch {
    /* fall through */
  }
  return new MemoryCache();
}
