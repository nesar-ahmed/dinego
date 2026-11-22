import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Why staff rejected, cancelled, or marked an order as not collected. Shown to the customer in
 * their notification; kept on the order for the staff view and the customer panel.
 */
export class AddOrderStatusReason1794880000000 implements MigrationInterface {
  name = "AddOrderStatusReason1794880000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN "status_reason" text`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "status_reason"`);
  }
}
