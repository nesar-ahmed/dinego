import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Customer carts.
 *
 * - One cart per customer (unique customer_id); deleting the customer deletes the cart.
 * - One row per menu item per cart; deleting a menu item removes it from every cart.
 * - Prices are not stored here; the cart always reads current menu prices.
 *
 * Keep each CONSTRAINT on a single line: TypeORM's SQLite schema introspection parses
 * constraints from the stored CREATE TABLE text and misses ones that span lines.
 */
export class CreateCarts1794827797332 implements MigrationInterface {
  name = "CreateCarts1794827797332";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "carts" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "customer_id" integer NOT NULL,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "fk_carts_customer" FOREIGN KEY ("customer_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_carts_customer_id" ON "carts" ("customer_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "cart_items" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "cart_id" integer NOT NULL,
        "menu_item_id" integer NOT NULL,
        "quantity" integer NOT NULL,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "chk_cart_items_quantity" CHECK ("quantity" > 0),
        CONSTRAINT "fk_cart_items_cart" FOREIGN KEY ("cart_id") REFERENCES "carts" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "fk_cart_items_menu_item" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_cart_items_menu_item_id" ON "cart_items" ("menu_item_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_cart_items_cart_menu_item" ON "cart_items" ("cart_id", "menu_item_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "uq_cart_items_cart_menu_item"`);
    await queryRunner.query(`DROP INDEX "idx_cart_items_menu_item_id"`);
    await queryRunner.query(`DROP TABLE "cart_items"`);
    await queryRunner.query(`DROP INDEX "uq_carts_customer_id"`);
    await queryRunner.query(`DROP TABLE "carts"`);
  }
}
