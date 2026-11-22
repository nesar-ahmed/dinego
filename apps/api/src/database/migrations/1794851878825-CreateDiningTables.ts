import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Dining tables on the restaurant floor.
 *
 * - `label` is unique. Case-insensitive uniqueness ("t4" vs "T4") is enforced by TablesService in
 *   its atomic writes, because TypeORM's SQLite driver cannot represent a NOCASE column collation
 *   (the schema would drift from the entity).
 * - Tables are deactivated instead of deleted once they have payment history (FKs RESTRICT).
 *
 * Keep each CONSTRAINT on a single line (see CreateCarts). TypeORM's introspection also requires
 * a CHECK to be followed directly by "," or by the table's closing parenthesis, so when a CHECK
 * is the last constraint the closing ")" stays on the same line.
 */
export class CreateDiningTables1794851878825 implements MigrationInterface {
  name = "CreateDiningTables1794851878825";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "dining_tables" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "label" text NOT NULL,
        "seats" integer NOT NULL,
        "zone" text,
        "status" text NOT NULL DEFAULT ('FREE'),
        "active" boolean NOT NULL DEFAULT (1),
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "chk_dining_tables_seats" CHECK ("seats" > 0 AND "seats" <= 50),
        CONSTRAINT "chk_dining_tables_status" CHECK ("status" IN ('FREE', 'OCCUPIED', 'BILL_REQUESTED', 'CLEANING', 'RESERVED')))
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_dining_tables_label" ON "dining_tables" ("label")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "uq_dining_tables_label"`);
    await queryRunner.query(`DROP TABLE "dining_tables"`);
  }
}
