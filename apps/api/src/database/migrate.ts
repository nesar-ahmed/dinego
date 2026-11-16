import "reflect-metadata";
import "dotenv/config";
import { DataSource } from "typeorm";
import { buildDataSourceOptions } from "./data-source.js";

/**
 * Applies pending TypeORM migrations.
 * The actual migration classes are registered in database/data-source.ts.
 */
async function main(): Promise<void> {
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  try {
    const migrations = await dataSource.runMigrations();

    if (migrations.length === 0) {
      console.log("No pending migrations.");
      return;
    }

    console.log(`Applied ${migrations.length} migration(s):`);
    for (const migration of migrations) {
      console.log(`  ${migration.name}`);
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error("Migration failed:", error);
  process.exitCode = 1;
});
