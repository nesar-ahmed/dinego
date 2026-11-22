import { HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, type Repository } from "typeorm";
import {
  CART_MAX_ITEM_QUANTITY,
  CART_MAX_LINES,
  type AddCartItemInput,
  type CartResponse,
  type Station,
} from "@dinego/shared";
import { MenuItem } from "../menu/entities/menu-item.entity.js";
import { toPublicItem } from "../menu/menu.mapper.js";
import { User } from "../users/entities/user.entity.js";
import { cartError } from "./cart.errors.js";
import { CartItem } from "./entities/cart-item.entity.js";
import { Cart } from "./entities/cart.entity.js";

/** A cart line with what checkout needs to price it. */
export interface CheckoutCartLine {
  menuItemId: number;
  name: string;
  quantity: number;
  unitPriceCents: number;
  taxRate: number;
  station: Station;
  /** Same rule as the public cart: available and in an active category. */
  purchasable: boolean;
}

/**
 * Customer cart.
 *
 * Concurrency: the better-sqlite3 driver shares ONE query runner across all requests, so
 * interactive transactions (BEGIN … await … COMMIT) from concurrent requests nest into each
 * other and fail or roll back unrelated work. Every cart mutation is therefore a single atomic
 * SQL statement with its limits enforced inside the statement. Do not introduce
 * `dataSource.transaction()` here.
 */
@Injectable()
export class CartService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Cart) private readonly carts: Repository<Cart>,
    @InjectRepository(CartItem) private readonly cartItems: Repository<CartItem>,
    @InjectRepository(MenuItem) private readonly menuItems: Repository<MenuItem>,
  ) {}

  async getCart(customerId: number): Promise<CartResponse> {
    await this.assertActiveCustomer(customerId);
    return this.buildCart(customerId);
  }

  /** Adds an item, or increases its quantity when it is already in the cart. */
  async addItem(customerId: number, input: AddCartItemInput): Promise<CartResponse> {
    await this.assertActiveCustomer(customerId);

    const item = await this.menuItems
      .createQueryBuilder("item")
      .innerJoin("item.category", "category")
      .where("item.id = :id", { id: input.menuItemId })
      .andWhere("category.active = :active", { active: true })
      .getOne();

    if (!item) {
      throw cartError(HttpStatus.NOT_FOUND, "MENU_ITEM_NOT_FOUND", "Menu item not found");
    }

    if (!item.available) {
      throw cartError(HttpStatus.CONFLICT, "ITEM_UNAVAILABLE", `${item.name} is sold out`);
    }

    const cartId = await this.ensureCart(customerId);

    // New line only while the cart has room; existing line only while under the quantity cap.
    // (SQLite requires a WHERE on the SELECT when it is followed by ON CONFLICT.)
    const rows: Array<{ quantity: number }> = await this.dataSource.query(
      `INSERT INTO "cart_items" ("cart_id", "menu_item_id", "quantity")
       SELECT ?, ?, ?
       WHERE (SELECT COUNT(*) FROM "cart_items" WHERE "cart_id" = ?) < ?
          OR EXISTS (SELECT 1 FROM "cart_items" WHERE "cart_id" = ? AND "menu_item_id" = ?)
       ON CONFLICT ("cart_id", "menu_item_id") DO UPDATE
         SET "quantity" = "quantity" + excluded."quantity", "updated_at" = datetime('now')
         WHERE "quantity" + excluded."quantity" <= ?
       RETURNING "quantity"`,
      [
        cartId,
        item.id,
        input.quantity,
        cartId,
        CART_MAX_LINES,
        cartId,
        item.id,
        CART_MAX_ITEM_QUANTITY,
      ],
    );

    if (rows.length === 0) {
      const existing = await this.cartItems.findOne({
        where: { cartId, menuItemId: item.id },
      });

      if (existing) {
        throw cartError(
          HttpStatus.CONFLICT,
          "QUANTITY_LIMIT",
          `You can add up to ${CART_MAX_ITEM_QUANTITY} of ${item.name}; your cart has ${existing.quantity}`,
        );
      }

      throw cartError(
        HttpStatus.CONFLICT,
        "CART_FULL",
        `Your cart can hold up to ${CART_MAX_LINES} different items`,
      );
    }

    return this.buildCart(customerId);
  }

  /**
   * Sets an absolute quantity; `0` removes the item. Raising the quantity requires the item to
   * still be purchasable; lowering it is always allowed.
   */
  async setQuantity(
    customerId: number,
    menuItemId: number,
    quantity: number,
  ): Promise<CartResponse> {
    await this.assertActiveCustomer(customerId);

    if (quantity === 0) {
      const removed = await this.deleteLine(customerId, menuItemId);

      if (!removed) {
        throw this.cartItemNotFound();
      }

      return this.buildCart(customerId);
    }

    const rows: Array<{ quantity: number }> = await this.dataSource.query(
      `UPDATE "cart_items"
       SET "quantity" = ?, "updated_at" = datetime('now')
       WHERE "menu_item_id" = ?
         AND "cart_id" = (SELECT "id" FROM "carts" WHERE "customer_id" = ?)
         AND (
           ? <= "quantity"
           OR EXISTS (
             SELECT 1 FROM "menu_items" AS "item"
             INNER JOIN "menu_categories" AS "category" ON "category"."id" = "item"."category_id"
             WHERE "item"."id" = "cart_items"."menu_item_id"
               AND "item"."available" = 1
               AND "category"."active" = 1
           )
         )
       RETURNING "quantity"`,
      [quantity, menuItemId, customerId, quantity],
    );

    if (rows.length === 0) {
      const line = await this.findLine(customerId, menuItemId);

      if (!line) {
        throw this.cartItemNotFound();
      }

      throw cartError(
        HttpStatus.CONFLICT,
        "ITEM_UNAVAILABLE",
        `${line.menuItem.name} is no longer available; you can only lower its quantity or remove it`,
      );
    }

    await this.touchCart(customerId);
    return this.buildCart(customerId);
  }

  /** Removes an item. Idempotent: removing an item that is not in the cart succeeds. */
  async removeItem(customerId: number, menuItemId: number): Promise<CartResponse> {
    await this.assertActiveCustomer(customerId);
    await this.deleteLine(customerId, menuItemId);
    return this.buildCart(customerId);
  }

  /**
   * Cart lines for checkout pricing, including the internal tax rate that the public cart hides.
   * Lines are in the order they were first added.
   */
  async getCheckoutLines(customerId: number): Promise<CheckoutCartLine[]> {
    const lines = await this.cartItems
      .createQueryBuilder("line")
      .innerJoin("line.cart", "cart")
      .innerJoinAndSelect("line.menuItem", "item")
      .innerJoinAndSelect("item.category", "category")
      .where("cart.customerId = :customerId", { customerId })
      .orderBy("line.id", "ASC")
      .getMany();

    return lines.map((line) => ({
      menuItemId: line.menuItemId,
      name: line.menuItem.name,
      quantity: line.quantity,
      unitPriceCents: line.menuItem.priceCents,
      taxRate: line.menuItem.taxRate,
      station: line.menuItem.station,
      purchasable: line.menuItem.available && line.menuItem.category.active,
    }));
  }

  /* -------------------------------- helpers ------------------------------- */

  /** Tokens stay valid for days, so re-check that the account still exists and is active. */
  private async assertActiveCustomer(customerId: number): Promise<void> {
    const exists = await this.users.exists({
      where: { id: customerId, role: "CUSTOMER", active: true },
    });

    if (!exists) {
      throw new UnauthorizedException("Account is not available");
    }
  }

  /** Creates the cart on first use, or touches `updated_at`. Atomic. */
  private async ensureCart(customerId: number): Promise<number> {
    const [row]: Array<{ id: number }> = await this.dataSource.query(
      `INSERT INTO "carts" ("customer_id") VALUES (?)
       ON CONFLICT ("customer_id") DO UPDATE SET "updated_at" = datetime('now')
       RETURNING "id"`,
      [customerId],
    );

    return row.id;
  }

  private async touchCart(customerId: number): Promise<void> {
    await this.dataSource.query(
      `UPDATE "carts" SET "updated_at" = datetime('now') WHERE "customer_id" = ?`,
      [customerId],
    );
  }

  /** Returns true when a line was removed. */
  private async deleteLine(customerId: number, menuItemId: number): Promise<boolean> {
    const rows: Array<{ id: number }> = await this.dataSource.query(
      `DELETE FROM "cart_items"
       WHERE "menu_item_id" = ?
         AND "cart_id" = (SELECT "id" FROM "carts" WHERE "customer_id" = ?)
       RETURNING "id"`,
      [menuItemId, customerId],
    );

    if (rows.length > 0) {
      await this.touchCart(customerId);
    }

    return rows.length > 0;
  }

  private findLine(customerId: number, menuItemId: number): Promise<CartItem | null> {
    return this.cartItems
      .createQueryBuilder("line")
      .innerJoin("line.cart", "cart")
      .innerJoinAndSelect("line.menuItem", "item")
      .where("cart.customerId = :customerId", { customerId })
      .andWhere("line.menuItemId = :menuItemId", { menuItemId })
      .getOne();
  }

  private cartItemNotFound() {
    return cartError(HttpStatus.NOT_FOUND, "CART_ITEM_NOT_FOUND", "This item is not in your cart");
  }

  private async buildCart(customerId: number): Promise<CartResponse> {
    const cart = await this.carts.findOne({ where: { customerId } });

    if (!cart) {
      return {
        cart: {
          items: [],
          itemCount: 0,
          subtotalCents: 0,
          hasUnavailableItems: false,
          updatedAt: null,
        },
      };
    }

    const lines = await this.cartItems
      .createQueryBuilder("line")
      .innerJoinAndSelect("line.menuItem", "item")
      .innerJoinAndSelect("item.category", "category")
      .where("line.cartId = :cartId", { cartId: cart.id })
      .orderBy("line.id", "ASC")
      .getMany();

    const items = lines.map((line) => {
      const purchasable = line.menuItem.available && line.menuItem.category.active;

      return {
        item: toPublicItem(line.menuItem),
        quantity: line.quantity,
        lineTotalCents: line.menuItem.priceCents * line.quantity,
        purchasable,
      };
    });

    const purchasableLines = items.filter((line) => line.purchasable);

    return {
      cart: {
        items,
        itemCount: purchasableLines.reduce((sum, line) => sum + line.quantity, 0),
        subtotalCents: purchasableLines.reduce((sum, line) => sum + line.lineTotalCents, 0),
        hasUnavailableItems: purchasableLines.length !== items.length,
        updatedAt: cart.updatedAt.toISOString(),
      },
    };
  }
}
