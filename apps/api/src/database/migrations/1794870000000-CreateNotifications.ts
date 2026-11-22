import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * In-app notifications: one row per recipient, so every user has their own read state.
 *
 * - `type` has no CHECK: new features add types, and SQLite can only change a CHECK by
 *   rebuilding the table. The API validates types against the shared NOTIFICATION_TYPES.
 *   `category` and `priority` are small, stable sets and are checked.
 * - `dedupe_key` is unique per recipient, so an event that is processed twice (a retry or a
 *   replay) notifies each person once. NULL keys never conflict (SQLite treats NULLs as distinct).
 * - `link` must be a path inside the app, never another site.
 * - Rows are deleted with their user (CASCADE) and after the 7-day retention window.
 *
 * Keep each CONSTRAINT on a single line and the FOREIGN KEY last (see CreateDiningTables).
 */
export class CreateNotifications1794870000000 implements MigrationInterface {
  name = "CreateNotifications1794870000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "recipient_id" integer NOT NULL,
        "type" text NOT NULL,
        "category" text NOT NULL,
        "priority" text NOT NULL DEFAULT ('NORMAL'),
        "title" text NOT NULL,
        "body" text NOT NULL,
        "link" text,
        "entity_type" text,
        "entity_id" integer,
        "data" text,
        "dedupe_key" text,
        "read_at" datetime,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "chk_notifications_category" CHECK ("category" IN ('ACCOUNT', 'ORDER', 'PAYMENT', 'FLOOR', 'SYSTEM')),
        CONSTRAINT "chk_notifications_priority" CHECK ("priority" IN ('LOW', 'NORMAL', 'HIGH')),
        CONSTRAINT "chk_notifications_link" CHECK ("link" IS NULL OR ("link" LIKE '/%' AND "link" NOT LIKE '//%')),
        CONSTRAINT "chk_notifications_entity" CHECK (("entity_type" IS NULL) = ("entity_id" IS NULL)),
        CONSTRAINT "chk_notifications_data" CHECK ("data" IS NULL OR (json_valid("data") AND json_type("data") = 'object')),
        CONSTRAINT "fk_notifications_recipient" FOREIGN KEY ("recipient_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_notifications_recipient_dedupe" ON "notifications" ("recipient_id", "dedupe_key")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_recipient_read" ON "notifications" ("recipient_id", "read_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_created_at" ON "notifications" ("created_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_notifications_created_at"`);
    await queryRunner.query(`DROP INDEX "idx_notifications_recipient_read"`);
    await queryRunner.query(`DROP INDEX "uq_notifications_recipient_dedupe"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
  }
}
