import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Public menu: categories and items.
 *
 * - Money is stored as integer cents; tax_rate is a percentage.
 * - allergens and dietary_tags are JSON arrays of strings (queried with json_each).
 * - A category that still has items cannot be deleted (ON DELETE RESTRICT); deactivate it instead.
 */
export class CreateMenu1794819338363 implements MigrationInterface {
  name = "CreateMenu1794819338363";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "menu_categories" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "slug" text NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "sort_order" integer NOT NULL DEFAULT (0),
        "active" boolean NOT NULL DEFAULT (1),
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_menu_categories_slug" ON "menu_categories" ("slug")`,
    );

    await queryRunner.query(`
      CREATE TABLE "menu_items" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "category_id" integer NOT NULL,
        "slug" text NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "price_cents" integer NOT NULL,
        "tax_rate" real NOT NULL DEFAULT (0),
        "station" text NOT NULL DEFAULT ('OTHER'),
        "allergens" text NOT NULL DEFAULT ('[]'),
        "dietary_tags" text NOT NULL DEFAULT ('[]'),
        "featured" boolean NOT NULL DEFAULT (0),
        "available" boolean NOT NULL DEFAULT (1),
        "sort_order" integer NOT NULL DEFAULT (0),
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "chk_menu_items_dietary_tags" CHECK (json_valid("dietary_tags") AND json_type("dietary_tags") = 'array'),
        CONSTRAINT "chk_menu_items_allergens" CHECK (json_valid("allergens") AND json_type("allergens") = 'array'),
        CONSTRAINT "chk_menu_items_station" CHECK ("station" IN ('GRILL', 'COLD', 'BAR', 'DESSERT', 'OTHER')),
        CONSTRAINT "chk_menu_items_tax_rate" CHECK ("tax_rate" >= 0 AND "tax_rate" <= 100),
        CONSTRAINT "chk_menu_items_price_cents" CHECK ("price_cents" >= 0),
        CONSTRAINT "fk_menu_items_category" FOREIGN KEY ("category_id") REFERENCES "menu_categories" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_menu_items_category_id" ON "menu_items" ("category_id")`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_menu_items_slug" ON "menu_items" ("slug")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "uq_menu_items_slug"`);
    await queryRunner.query(`DROP INDEX "idx_menu_items_category_id"`);
    await queryRunner.query(`DROP TABLE "menu_items"`);
    await queryRunner.query(`DROP INDEX "uq_menu_categories_slug"`);
    await queryRunner.query(`DROP TABLE "menu_categories"`);
  }
}
