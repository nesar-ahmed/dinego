import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DataSourceOptions } from "typeorm";
import { CartItem } from "../cart/entities/cart-item.entity.js";
import { Cart } from "../cart/entities/cart.entity.js";
import { MenuCategory } from "../menu/entities/menu-category.entity.js";
import { MenuItem } from "../menu/entities/menu-item.entity.js";
import { Notification } from "../notifications/entities/notification.entity.js";
import { OrderItem } from "../orders/entities/order-item.entity.js";
import { Order } from "../orders/entities/order.entity.js";
import { Payment } from "../payments/entities/payment.entity.js";
import { DiningTable } from "../tables/entities/dining-table.entity.js";
import { User } from "../users/entities/user.entity.js";
import { CreateUsers1794780000000 } from "./migrations/1794780000000-CreateUsers.js";
import { CreateMenu1794819338363 } from "./migrations/1794819338363-CreateMenu.js";
import { CreateCarts1794827797332 } from "./migrations/1794827797332-CreateCarts.js";
import { CreateDiningTables1794851878825 } from "./migrations/1794851878825-CreateDiningTables.js";
import { CreatePayments1794851878826 } from "./migrations/1794851878826-CreatePayments.js";
import { CreateOrders1794854163916 } from "./migrations/1794854163916-CreateOrders.js";
import { AddUserTokenVersion1794858290384 } from "./migrations/1794858290384-AddUserTokenVersion.js";
import { CreateNotifications1794870000000 } from "./migrations/1794870000000-CreateNotifications.js";
import { AddOrderStatusReason1794880000000 } from "./migrations/1794880000000-AddOrderStatusReason.js";

export const entities = [
  User,
  MenuCategory,
  MenuItem,
  Cart,
  CartItem,
  DiningTable,
  Payment,
  Order,
  OrderItem,
  Notification,
];

/**
 * The SQLite file lives at the root of apps/api.
 * `import.meta.url` points at src/database in development and dist/database
 * after a build, so going up two levels always lands on apps/api.
 */
export function resolveDatabasePath(): string {
  const configured = process.env.DATABASE_PATH;
  const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

  if (configured) {
    return isAbsolute(configured) ? configured : resolve(apiRoot, configured);
  }

  return resolve(apiRoot, "dinego.sqlite");
}

/** Single source of truth for the SQLite connection, used by Nest, migrations, and seeds. */
export function buildDataSourceOptions(): DataSourceOptions {
  const databasePath = resolveDatabasePath();

  mkdirSync(dirname(databasePath), { recursive: true });

  return {
    type: "better-sqlite3",
    database: databasePath,
    entities,
    migrations: [
      CreateUsers1794780000000,
      CreateMenu1794819338363,
      CreateCarts1794827797332,
      CreateDiningTables1794851878825,
      CreatePayments1794851878826,
      CreateOrders1794854163916,
      AddUserTokenVersion1794858290384,
      CreateNotifications1794870000000,
      AddOrderStatusReason1794880000000,
    ],
    migrationsTableName: "migrations",
    synchronize: false,
    logging: process.env.DB_LOGGING === "true",
    enableWAL: true,
  };
}
