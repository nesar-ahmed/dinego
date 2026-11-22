import type { DataSource } from "typeorm";

/** A prepared better-sqlite3 statement. */
export interface SqliteStatement {
  run(...params: unknown[]): { changes: number };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

/** The raw better-sqlite3 `Database` behind TypeORM's driver. */
interface RawSqliteDatabase {
  readonly inTransaction: boolean;
  prepare(sql: string): SqliteStatement;
  transaction<T>(fn: () => T): () => T;
}

/** What `runAtomically` work receives: prepared statements, reused across calls. */
export interface AtomicDatabase {
  prepare(sql: string): SqliteStatement;
}

const MAX_WAIT_MS = 5_000;
const MAX_CACHED_STATEMENTS = 200;
const statementCache = new WeakMap<RawSqliteDatabase, Map<string, SqliteStatement>>();

/**
 * Prepared statements are cached per SQL string instead of being created and garbage-collected
 * on every call (faster, and less native-object churn). Use static SQL with `?` placeholders.
 */
function cachedStatements(raw: RawSqliteDatabase): AtomicDatabase {
  let cache = statementCache.get(raw);
  if (!cache) {
    cache = new Map();
    statementCache.set(raw, cache);
  }
  const statements = cache;

  return {
    prepare(sql) {
      let statement = statements.get(sql);
      if (!statement) {
        statement = raw.prepare(sql);
        statements.set(sql, statement);
        if (statements.size > MAX_CACHED_STATEMENTS) {
          statements.delete(statements.keys().next().value as string);
        }
      }
      return statement;
    },
  };
}

/**
 * Runs `work` as ONE synchronous SQLite transaction on the shared better-sqlite3 connection.
 *
 * Why synchronous: the driver shares a single connection across requests, so an async TypeORM
 * transaction (BEGIN … await … COMMIT) lets other requests' queries run inside it. A synchronous
 * better-sqlite3 transaction cannot interleave: no other JavaScript runs until it commits, and a
 * thrown error rolls everything back.
 *
 * `work` must be synchronous: use `db.prepare(sql).run/get/all`, never `await`.
 *
 * If another async transaction is open on the connection (for example TypeORM's implicit
 * transaction around `repository.save()`), starting now would nest inside it and could be rolled
 * back with it, so this waits until the connection is idle.
 */
export async function runAtomically<T>(
  dataSource: DataSource,
  work: (db: AtomicDatabase) => T,
): Promise<T> {
  const raw = (dataSource.driver as unknown as { databaseConnection: RawSqliteDatabase })
    .databaseConnection;
  const deadline = Date.now() + MAX_WAIT_MS;

  while (raw.inTransaction) {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for another database transaction to finish");
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  const db = cachedStatements(raw);
  return raw.transaction(() => work(db))();
}
