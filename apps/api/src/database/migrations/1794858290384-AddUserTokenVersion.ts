import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Session versioning. Every JWT carries the account's `token_version` as `ver`, and the auth guard
 * rejects tokens whose version is not the current one. Changing the password increments the
 * version, which signs out every other session. Existing rows and tokens start at version 0.
 */
export class AddUserTokenVersion1794858290384 implements MigrationInterface {
  name = "AddUserTokenVersion1794858290384";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "token_version" integer NOT NULL DEFAULT (0)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "token_version"`);
  }
}
