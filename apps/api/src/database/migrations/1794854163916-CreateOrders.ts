import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Orders and order items, and the `payments.order_id` foreign key.
 *
 * - Customer orders are created at checkout from the successful payment's snapshot, in the same
 *   atomic transaction that marks the payment SUCCEEDED and sets `payments.order_id`.
 * - `order_items` copy name, price, and station from the snapshot so history survives menu edits.
 *   Menu items, tables, and users with orders cannot be deleted (ON DELETE RESTRICT).
 * - SQLite cannot add a constraint to an existing column, so `payments` is rebuilt with the FK.
 *
 * Keep each CONSTRAINT on a single line and keep FOREIGN KEYs after the CHECKs (see
 * CreateDiningTables): TypeORM's introspection needs each CHECK followed directly by ",".
 */
export class CreateOrders1794854163916 implements MigrationInterface {
  name = "CreateOrders1794854163916";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "order_no" text NOT NULL,
        "type" text NOT NULL,
        "status" text NOT NULL,
        "table_id" integer,
        "customer_id" integer,
        "pickup_time" datetime,
        "pickup_code" text,
        "subtotal_cents" integer NOT NULL,
        "tax_cents" integer NOT NULL,
        "tip_cents" integer NOT NULL,
        "total_cents" integer NOT NULL,
        "notes" text,
        "created_by" integer,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "chk_orders_type" CHECK ("type" IN ('DINE_IN', 'TAKEAWAY')),
        CONSTRAINT "chk_orders_table" CHECK (("type" = 'DINE_IN' AND "table_id" IS NOT NULL) OR ("type" = 'TAKEAWAY' AND "table_id" IS NULL)),
        CONSTRAINT "chk_orders_status" CHECK ("status" IN ('OPEN', 'SENT', 'IN_PROGRESS', 'READY', 'SERVED', 'BILL_REQUESTED', 'PAID', 'CLOSED', 'PLACED', 'PAY_AT_PICKUP', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'COLLECTED', 'CANCELLED', 'REJECTED', 'NO_SHOW')),
        CONSTRAINT "chk_orders_amounts" CHECK ("subtotal_cents" >= 0 AND "tax_cents" >= 0 AND "tip_cents" >= 0 AND "total_cents" = "subtotal_cents" + "tax_cents" + "tip_cents"),
        CONSTRAINT "fk_orders_table" FOREIGN KEY ("table_id") REFERENCES "dining_tables" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "fk_orders_customer" FOREIGN KEY ("customer_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "fk_orders_created_by" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_orders_order_no" ON "orders" ("order_no")`);
    await queryRunner.query(`CREATE INDEX "idx_orders_customer_id" ON "orders" ("customer_id")`);
    await queryRunner.query(`CREATE INDEX "idx_orders_table_id" ON "orders" ("table_id")`);
    await queryRunner.query(`CREATE INDEX "idx_orders_status" ON "orders" ("status")`);

    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "order_id" integer NOT NULL,
        "menu_item_id" integer NOT NULL,
        "name" text NOT NULL,
        "quantity" integer NOT NULL,
        "unit_price_cents" integer NOT NULL,
        "status" text NOT NULL DEFAULT ('PENDING'),
        "station" text NOT NULL DEFAULT ('OTHER'),
        "notes" text,
        "fired_at" datetime,
        "ready_at" datetime,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "chk_order_items_quantity" CHECK ("quantity" > 0),
        CONSTRAINT "chk_order_items_unit_price_cents" CHECK ("unit_price_cents" >= 0),
        CONSTRAINT "chk_order_items_status" CHECK ("status" IN ('PENDING', 'FIRED', 'PREPARING', 'READY', 'SERVED', 'VOIDED')),
        CONSTRAINT "chk_order_items_station" CHECK ("station" IN ('GRILL', 'COLD', 'BAR', 'DESSERT', 'OTHER')),
        CONSTRAINT "fk_order_items_order" FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "fk_order_items_menu_item" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_order_items_order_id" ON "order_items" ("order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_order_items_menu_item_id" ON "order_items" ("menu_item_id")`,
    );

    await this.rebuildPayments(queryRunner, true);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await this.rebuildPayments(queryRunner, false);
    await queryRunner.query(`DROP INDEX "idx_order_items_menu_item_id"`);
    await queryRunner.query(`DROP INDEX "idx_order_items_order_id"`);
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(`DROP INDEX "idx_orders_status"`);
    await queryRunner.query(`DROP INDEX "idx_orders_table_id"`);
    await queryRunner.query(`DROP INDEX "idx_orders_customer_id"`);
    await queryRunner.query(`DROP INDEX "uq_orders_order_no"`);
    await queryRunner.query(`DROP TABLE "orders"`);
  }

  /** Recreates `payments` with or without the `order_id` FK, keeping every row and index. */
  private async rebuildPayments(queryRunner: QueryRunner, withOrderFk: boolean): Promise<void> {
    const orderFk = withOrderFk
      ? `,\n        CONSTRAINT "fk_payments_order" FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION`
      : "";

    await queryRunner.query(`
      CREATE TABLE "temporary_payments" (
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
        CONSTRAINT "fk_payments_table" FOREIGN KEY ("table_id") REFERENCES "dining_tables" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION${orderFk}
      )
    `);
    await queryRunner.query(`INSERT INTO "temporary_payments" SELECT * FROM "payments"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`ALTER TABLE "temporary_payments" RENAME TO "payments"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_payments_customer_idempotency_key" ON "payments" ("customer_id", "idempotency_key")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_payments_open_checkout" ON "payments" ("customer_id") WHERE "order_id" IS NULL AND "status" IN ('PENDING', 'SUCCEEDED')`,
    );
    await queryRunner.query(`CREATE INDEX "idx_payments_order_id" ON "payments" ("order_id")`);
    await queryRunner.query(`CREATE INDEX "idx_payments_table_id" ON "payments" ("table_id")`);
  }
}
