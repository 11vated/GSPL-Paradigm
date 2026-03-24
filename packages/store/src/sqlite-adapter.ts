/**
 * SqliteAdapter — SQLite-backed StorageAdapter using better-sqlite3.
 *
 * Provides persistent key-value storage backed by a SQLite database.
 * All statements are prepared in the constructor for optimal performance.
 *
 * @packageDocumentation
 */

import Database from 'better-sqlite3';
import type BetterSqlite3 from 'better-sqlite3';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { StorageAdapter } from './index.js';

/** Row shape returned by the get query. */
interface KvRow {
  readonly value: string;
}

/** Row shape returned by the has query. */
interface CountRow {
  readonly cnt: number;
}

/** Row shape returned by the keys query. */
interface KeyRow {
  readonly key: string;
}

/**
 * SQLite-backed implementation of StorageAdapter.
 *
 * Uses better-sqlite3 for synchronous, high-performance key-value persistence.
 * All SQL statements are prepared once in the constructor and reused for every call.
 *
 * @example
 * ```ts
 * const adapter = new SqliteAdapter('/path/to/db.sqlite');
 * adapter.set('theme', 'dark');
 * console.log(adapter.get('theme')); // 'dark'
 * adapter.close();
 * ```
 */
export class SqliteAdapter implements StorageAdapter {
  private readonly db: BetterSqlite3.Database;
  private readonly stmtGet: BetterSqlite3.Statement<[string]>;
  private readonly stmtSet: BetterSqlite3.Statement<[string, string]>;
  private readonly stmtDelete: BetterSqlite3.Statement<[string]>;
  private readonly stmtHas: BetterSqlite3.Statement<[string]>;
  private readonly stmtKeys: BetterSqlite3.Statement<[]>;
  private readonly stmtClear: BetterSqlite3.Statement<[]>;

  /**
   * Create a new SqliteAdapter.
   *
   * @param dbPath - Path to the SQLite database file, or ':memory:' for in-memory.
   *   Defaults to ':memory:'.
   */
  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);

    // Enable WAL mode for better concurrent read performance.
    this.db.pragma('journal_mode = WAL');

    this.db.exec(
      `CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`
    );

    this.stmtGet = this.db.prepare<[string]>(
      'SELECT value FROM kv_store WHERE key = ?'
    );
    this.stmtSet = this.db.prepare<[string, string]>(
      'INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, unixepoch())'
    );
    this.stmtDelete = this.db.prepare<[string]>(
      'DELETE FROM kv_store WHERE key = ?'
    );
    this.stmtHas = this.db.prepare<[string]>(
      'SELECT COUNT(*) AS cnt FROM kv_store WHERE key = ?'
    );
    this.stmtKeys = this.db.prepare<[]>(
      'SELECT key FROM kv_store ORDER BY key'
    );
    this.stmtClear = this.db.prepare<[]>(
      'DELETE FROM kv_store'
    );
  }

  /** Retrieve value by key, or undefined if not found. */
  get(key: string): string | undefined {
    const row = this.stmtGet.get(key) as KvRow | undefined;
    return row?.value;
  }

  /** Store a value under the given key. Overwrites if the key already exists. */
  set(key: string, value: string): void {
    this.stmtSet.run(key, value);
  }

  /** Delete a key. Returns true if the key existed and was removed. */
  delete(key: string): boolean {
    const result = this.stmtDelete.run(key);
    return result.changes > 0;
  }

  /** Check whether a key exists. */
  has(key: string): boolean {
    const row = this.stmtHas.get(key) as CountRow;
    return row.cnt > 0;
  }

  /** Return all stored keys in alphabetical order. */
  keys(): string[] {
    const rows = this.stmtKeys.all() as KeyRow[];
    return rows.map((row) => row.key);
  }

  /** Remove all entries from the store. */
  clear(): void {
    this.stmtClear.run();
  }

  /** Close the underlying database connection. */
  close(): void {
    this.db.close();
  }

  /**
   * Resolve the default database path for persistent storage.
   *
   * @returns Absolute path to `~/.gspl-paradigm/paradigm.db`.
   */
  static resolveDefaultPath(): string {
    return join(homedir(), '.gspl-paradigm', 'paradigm.db');
  }
}
