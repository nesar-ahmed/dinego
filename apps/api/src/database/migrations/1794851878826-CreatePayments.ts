import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Payments.
 *
 * - A checkout payment is taken before its order exists: it stores the checkout snapshot
 *   (order type, table, priced lines as JSON, totals) and `order_id` stays NULL until the order is
 *   created from it. The FK on `order_id` is added by the orders migration.
 * - `(customer_id, idempotency_key)` is unique, so a retried request can never charge twice.
 * - `uq_payments_open_checkout` allows at most one open checkout (PENDING, or SUCCEEDED without an
 *   order) per customer, so a customer cannot pay twice for the same cart.
 * - Customers and tables with payments cannot be deleted (ON DELETE RESTRICT).
 *
 * Keep each CONSTRAINT on a single line (see CreateCarts).
 */
export class CreatePayments1794851878826 implements MigrationInterface {
  name = "CreatePayments1794851878826";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "order_id" integer,
        "customer_id" integer,
        "order_type" text NOT NULL,
        "table_id" integer,
        "method" text NOT NULL,
        "subtotal_cents" integer NOT NULL,
        "tax_cents" integer NOT NULL,
        "tip_cents" integer NOT NULL,
        "amount_cents" integer NOT NULL,
        "lines" text NOT NULL,
        "status" text NOT NULL DEFAULT ('PENDING'),
        "provider" text NOT NULL,
        "provider_ref" text,
        "failure_code" text,
        "failure_message" text,
        "idempotency_key" text NOT NULL,
        "request_hash" text NOT NULL,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "chk_payments_order_type" CHECK ("order_type" IN ('DINE_IN', 'TAKEAWAY')),
        CONSTRAINT "chk_payments_table" CHECK (("order_type" = 'DINE_IN' AND "table_id" IS NOT NULL) OR ("order_type" = 'TAKEAWAY' AND "table_id" IS NULL)),
        CONSTRAINT "chk_payments_method" CHECK ("method" IN ('CASH', 'CARD', 'ONLINE')),
        CONSTRAINT "chk_payments_status" CHECK ("status" IN ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED')),
        CONSTRAINT "chk_payments_amounts" CHECK ("subtotal_cents" >= 0 AND "tax_cents" >= 0 AND "tip_cents" >= 0 AND "amount_cents" > 0 AND "amount_cents" = "subtotal_cents" + "tax_cents" + "tip_cents"),
        CONSTRAINT "chk_payments_lines" CHECK (json_valid("lines") AND json_type("lines") = 'array'),
        CONSTRAINT "fk_payments_customer" FOREIGN KEY ("customer_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "fk_payments_table" FOREIGN KEY ("table_id") REFERENCES "dining_tables" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_payments_customer_idempotency_key" ON "payments" ("customer_id", "idempotency_key")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_payments_open_checkout" ON "payments" ("customer_id") WHERE "order_id" IS NULL AND "status" IN ('PENDING', 'SUCCEEDED')`,
    );
    await queryRunner.query(`CREATE INDEX "idx_payments_order_id" ON "payments" ("order_id")`);
    await queryRunner.query(`CREATE INDEX "idx_payments_table_id" ON "payments" ("table_id")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_payments_table_id"`);
    await queryRunner.query(`DROP INDEX "idx_payments_order_id"`);
    await queryRunner.query(`DROP INDEX "uq_payments_open_checkout"`);
    await queryRunner.query(`DROP INDEX "uq_payments_customer_idempotency_key"`);
    await queryRunner.query(`DROP TABLE "payments"`);
  }
}
