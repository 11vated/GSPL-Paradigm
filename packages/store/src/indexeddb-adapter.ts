/**
 * IndexedDBAdapter — Browser-native AsyncStorageAdapter backed by IndexedDB.
 *
 * Provides persistent key-value storage in browser environments using the
 * IndexedDB API. All operations are asynchronous and return Promises.
 *
 * @packageDocumentation
 */

// ─────────────────────────────────────────────
// AsyncStorageAdapter Interface
// ─────────────────────────────────────────────

/**
 * Asynchronous variant of StorageAdapter.
 * Same methods as StorageAdapter but all return Promise.
 * Required for browser-native stores (IndexedDB, etc.) that are inherently async.
 */
export interface AsyncStorageAdapter {
  /** Retrieve value by key, or undefined if not found. */
  get(key: string): Promise<string | undefined>;
  /** Store a value under the given key. */
  set(key: string, value: string): Promise<void>;
  /** Delete a key. Returns true if the key existed. */
  delete(key: string): Promise<boolean>;
  /** Check whether a key exists. */
  has(key: string): Promise<boolean>;
  /** Return all stored keys. */
  keys(): Promise<string[]>;
  /** Remove all entries. */
  clear(): Promise<void>;
}

// ─────────────────────────────────────────────
// IndexedDB Helpers
// ─────────────────────────────────────────────

/** Database name used by IndexedDBAdapter. */
const DB_NAME = 'gspl-paradigm';

/** Object store name within the IndexedDB database. */
const STORE_NAME = 'kv_store';

/** Database schema version. */
const DB_VERSION = 1;

/**
 * Wrap an IDBRequest in a Promise.
 *
 * @param request - The IDBRequest to promisify.
 * @returns Promise that resolves with the request result or rejects with its error.
 */
function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed'));
    };
  });
}

// ─────────────────────────────────────────────
// IndexedDBAdapter
// ─────────────────────────────────────────────

/**
 * IndexedDB-backed implementation of AsyncStorageAdapter.
 *
 * Stores key-value pairs in a single IndexedDB object store. The database
 * connection is opened lazily on first access and cached for subsequent calls.
 *
 * @example
 * ```ts
 * const adapter = new IndexedDBAdapter();
 * await adapter.set('theme', 'dark');
 * console.log(await adapter.get('theme')); // 'dark'
 * ```
 */
export class IndexedDBAdapter implements AsyncStorageAdapter {
  private readonly dbPromise: Promise<IDBDatabase>;

  /** Create a new IndexedDBAdapter. Opens the database immediately. */
  constructor() {
    this.dbPromise = this.openDatabase();
  }

  /** Retrieve value by key, or undefined if not found. */
  async get(key: string): Promise<string | undefined> {
    const db = await this.dbPromise;
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const result = await promisifyRequest(store.get(key));
    if (result === undefined || result === null) {
      return undefined;
    }
    return (result as KvRecord).value;
  }

  /** Store a value under the given key. Overwrites if the key already exists. */
  async set(key: string, value: string): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const record: KvRecord = { key, value, updatedAt: Date.now() };
    await promisifyRequest(store.put(record));
  }

  /** Delete a key. Returns true if the key existed and was removed. */
  async delete(key: string): Promise<boolean> {
    const db = await this.dbPromise;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // Check existence first to return accurate boolean.
    const existing = await promisifyRequest(store.get(key));
    if (existing === undefined || existing === null) {
      return false;
    }

    await promisifyRequest(store.delete(key));
    return true;
  }

  /** Check whether a key exists. */
  async has(key: string): Promise<boolean> {
    const db = await this.dbPromise;
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const count = await promisifyRequest(store.count(IDBKeyRange.only(key)));
    return count > 0;
  }

  /** Return all stored keys. */
  async keys(): Promise<string[]> {
    const db = await this.dbPromise;
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const allKeys = await promisifyRequest(store.getAllKeys());
    return allKeys.map((k) => String(k));
  }

  /** Remove all entries from the store. */
  async clear(): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await promisifyRequest(store.clear());
  }

  /**
   * Open the IndexedDB database, creating the object store on first run.
   *
   * @returns Promise resolving to the opened IDBDatabase.
   */
  private openDatabase(): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error ?? new Error('Failed to open IndexedDB database'));
      };
    });
  }
}

// ─────────────────────────────────────────────
// Internal Types
// ─────────────────────────────────────────────

/** Shape of records stored in the IndexedDB object store. */
interface KvRecord {
  readonly key: string;
  readonly value: string;
  readonly updatedAt: number;
}
