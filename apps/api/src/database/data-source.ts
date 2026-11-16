import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DataSourceOptions } from "typeorm";
import { User } from "../users/entities/user.entity.js";
import { CreateUsers1794780000000 } from "./migrations/1794780000000-CreateUsers.js";

export const entities = [User];

/**
 * The SQLite file lives at the root of apps/api.
 * `import.meta.url` points at src/database in development and dist/database
 * after a build, so going up two levels always lands on apps/api.
 */
export function resolveDatabasePath(): string {
  const configured = process.env.DATABASE_PATH;
  const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

  if (configured) {
    return isAbsolute(configured) ? configured : resolve(apiRoot, configured);
  }

  return resolve(apiRoot, "dinego.sqlite");
}

/** Single source of truth for the SQLite connection, used by Nest, migrations, and seeds. */
export function buildDataSourceOptions(): DataSourceOptions {
  const databasePath = resolveDatabasePath();

  mkdirSync(dirname(databasePath), { recursive: true });

  return {
    type: "better-sqlite3",
    database: databasePath,
    entities,
    migrations: [CreateUsers1794780000000],
    migrationsTableName: "migrations",
    synchronize: false,
    logging: process.env.DB_LOGGING === "true",
    enableWAL: true,
  };
}
