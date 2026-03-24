/**
 * StorageAdapterFactory — Environment-aware adapter creation.
 *
 * Detects the runtime environment and returns the appropriate storage adapter:
 * - Browser: IndexedDBAdapter (async)
 * - Node.js: SqliteAdapter (sync)
 * - Fallback: MemoryAdapter (sync)
 *
 * @packageDocumentation
 */

import type { StorageAdapter } from './index.js';
import type { AsyncStorageAdapter } from './indexeddb-adapter.js';
import { MemoryAdapter } from './index.js';

/** Supported adapter type identifiers. */
export type AdapterType = 'memory' | 'sqlite' | 'indexeddb' | 'auto';

/** Options for createStorageAdapter. */
export interface CreateAdapterOptions {
  /**
   * Which adapter to create.
   * - 'memory': In-memory (no persistence).
   * - 'sqlite': SQLite file-backed (Node.js only).
   * - 'indexeddb': IndexedDB (browser only).
   * - 'auto': Detect environment and choose sqlite (Node) or indexeddb (browser).
   *
   * @defaultValue 'auto'
   */
  readonly type?: AdapterType;
  /**
   * Path to the SQLite database file. Only used when type is 'sqlite' or
   * when 'auto' resolves to sqlite. Defaults to SqliteAdapter.resolveDefaultPath().
   */
  readonly dbPath?: string;
}

/**
 * Create a storage adapter based on the specified type or environment detection.
 *
 * @param options - Adapter creation options.
 * @returns A StorageAdapter (sync) for memory/sqlite, or AsyncStorageAdapter for indexeddb.
 *
 * @example
 * ```ts
 * // Auto-detect: sqlite in Node, indexeddb in browser
 * const adapter = await createStorageAdapter();
 *
 * // Explicit sqlite with custom path
 * const sqlAdapter = await createStorageAdapter({ type: 'sqlite', dbPath: './data.db' });
 *
 * // Explicit memory (no persistence)
 * const memAdapter = await createStorageAdapter({ type: 'memory' });
 * ```
 */
export async function createStorageAdapter(
  options?: CreateAdapterOptions
): Promise<StorageAdapter | AsyncStorageAdapter> {
  const resolvedType = options?.type ?? 'auto';

  switch (resolvedType) {
    case 'memory':
      return new MemoryAdapter();

    case 'sqlite':
      return createSqliteAdapter(options?.dbPath);

    case 'indexeddb':
      return createIndexedDBAdapter();

    case 'auto':
      return detectAndCreate(options?.dbPath);
  }
}

/**
 * Detect the runtime environment and create the appropriate adapter.
 *
 * Uses `typeof window !== 'undefined'` to distinguish browser from Node.js.
 * Browser environments get IndexedDB; Node.js environments get SQLite.
 *
 * @param dbPath - Optional SQLite database path for Node.js environments.
 * @returns The created adapter.
 */
async function detectAndCreate(
  dbPath?: string
): Promise<StorageAdapter | AsyncStorageAdapter> {
  const isBrowser = typeof window !== 'undefined';

  if (isBrowser) {
    return createIndexedDBAdapter();
  }

  return createSqliteAdapter(dbPath);
}

/**
 * Dynamically import and instantiate SqliteAdapter.
 *
 * Uses dynamic import to avoid bundling better-sqlite3 in browser builds.
 *
 * @param dbPath - Optional database file path.
 * @returns SqliteAdapter instance.
 */
async function createSqliteAdapter(dbPath?: string): Promise<StorageAdapter> {
  const { SqliteAdapter } = await import('./sqlite-adapter.js');
  const resolvedPath = dbPath ?? SqliteAdapter.resolveDefaultPath();
  return new SqliteAdapter(resolvedPath);
}

/**
 * Dynamically import and instantiate IndexedDBAdapter.
 *
 * @returns IndexedDBAdapter instance.
 */
async function createIndexedDBAdapter(): Promise<AsyncStorageAdapter> {
  const { IndexedDBAdapter } = await import('./indexeddb-adapter.js');
  return new IndexedDBAdapter();
}
