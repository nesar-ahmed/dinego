import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUsers1794780000000 implements MigrationInterface {
  name = "CreateUsers1794780000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name" text NOT NULL,
        "email" text,
        "phone" text,
        "password_hash" text,
        "pin_hash" text,
        "role" text NOT NULL DEFAULT ('WAITER'),
        "active" boolean NOT NULL DEFAULT (1),
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "uq_users_email" UNIQUE ("email")
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_users_role" ON "users" ("role")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_users_role"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
