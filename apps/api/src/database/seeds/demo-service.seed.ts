import { JwtService } from "@nestjs/jwt";
import type { DataSource } from "typeorm";
import {
  checkoutSchema,
  type OrderStatus,
  type OrderType,
  type StaffRole,
  type TableStatus,
} from "@dinego/shared";
import { CartService } from "../../cart/cart.service.js";
import { Cart } from "../../cart/entities/cart.entity.js";
import { CartItem } from "../../cart/entities/cart-item.entity.js";
import { runAtomically } from "../../common/database/atomic.js";
import { MenuItem } from "../../menu/entities/menu-item.entity.js";
import { NotificationPublisher } from "../../notifications/notification-publisher.js";
import { Order } from "../../orders/entities/order.entity.js";
import { OrdersService } from "../../orders/orders.service.js";
import { StaffOrdersService } from "../../orders/staff-orders.service.js";
import { Payment } from "../../payments/entities/payment.entity.js";
import { PaymentsService } from "../../payments/payments.service.js";
import { SimulatedPaymentProvider } from "../../payments/providers/simulated-payment.provider.js";
import { DiningTable } from "../../tables/entities/dining-table.entity.js";
import { TablesService } from "../../tables/tables.service.js";
import { User } from "../../users/entities/user.entity.js";
import { UsersService } from "../../users/users.service.js";

type Actor = Extract<StaffRole, "KITCHEN" | "WAITER" | "CASHIER" | "MANAGER">;

/** One demo order: what the customer ordered, and how far the staff have taken it. */
interface DemoOrder {
  key: string;
  customer: string;
  type: OrderType;
  table?: string;
  lines: Array<[slug: string, quantity: number]>;
  tipCents?: number;
  method?: "CARD" | "ONLINE";
  placedMinutesAgo: number;
  steps: Array<{ to: OrderStatus; by: Actor; minutesAgo: number; reason?: string }>;
  /** A table change after the order, e.g. the table set for cleaning once the guests left. */
  tableAfter?: { status: TableStatus; by: Actor; minutesAgo: number };
}

const SOFIA = "customer@dinego.com";
const ALEX = "alex@dinego.com";

/**
 * A restaurant mid-service, so every staff dashboard has something on it: each column of the
 * kitchen, service, and pickup boards, a late ticket (over 15 minutes), tables in every state,
 * and a little history. Times are relative to when the seed runs.
 */
export const demoOrders: DemoOrder[] = [
  // Dine-in
  {
    key: "dine-in-sent",
    customer: SOFIA,
    type: "DINE_IN",
    table: "T1",
    lines: [
      ["crispy-calamari", 1],
      ["grilled-chicken", 1],
      ["house-lemonade", 2],
    ],
    placedMinutesAgo: 2,
    steps: [],
  },
  {
    key: "dine-in-cooking",
    customer: ALEX,
    type: "DINE_IN",
    table: "T2",
    lines: [
      ["smash-burger", 2],
      ["craft-beer", 2],
    ],
    tipCents: 400,
    placedMinutesAgo: 9,
    steps: [{ to: "IN_PROGRESS", by: "KITCHEN", minutesAgo: 6 }],
  },
  {
    key: "dine-in-late",
    customer: SOFIA,
    type: "DINE_IN",
    table: "T3",
    lines: [
      ["ribeye-steak", 1],
      ["mushroom-risotto", 1],
      ["sparkling-water", 2],
    ],
    tipCents: 600,
    placedMinutesAgo: 23,
    steps: [{ to: "IN_PROGRESS", by: "KITCHEN", minutesAgo: 19 }],
  },
  {
    key: "dine-in-ready",
    customer: ALEX,
    type: "DINE_IN",
    table: "T5",
    lines: [
      ["fish-and-chips", 2],
      ["burrata-and-tomatoes", 1],
      ["espresso", 2],
    ],
    placedMinutesAgo: 18,
    steps: [
      { to: "IN_PROGRESS", by: "KITCHEN", minutesAgo: 15 },
      { to: "READY", by: "KITCHEN", minutesAgo: 2 },
    ],
  },
  {
    key: "dine-in-served",
    customer: SOFIA,
    type: "DINE_IN",
    table: "T7",
    lines: [
      ["margherita-pizza", 1],
      ["chocolate-lava-cake", 2],
    ],
    tipCents: 300,
    placedMinutesAgo: 41,
    steps: [
      { to: "IN_PROGRESS", by: "KITCHEN", minutesAgo: 37 },
      { to: "READY", by: "KITCHEN", minutesAgo: 30 },
      { to: "SERVED", by: "WAITER", minutesAgo: 28 },
    ],
  },
  {
    key: "dine-in-closed",
    customer: ALEX,
    type: "DINE_IN",
    table: "T6",
    lines: [
      ["wild-mushroom-toast", 1],
      ["grilled-chicken", 2],
      ["new-york-cheesecake", 2],
    ],
    tipCents: 800,
    placedMinutesAgo: 80,
    steps: [
      { to: "IN_PROGRESS", by: "KITCHEN", minutesAgo: 76 },
      { to: "READY", by: "KITCHEN", minutesAgo: 66 },
      { to: "SERVED", by: "WAITER", minutesAgo: 64 },
      { to: "CLOSED", by: "WAITER", minutesAgo: 12 },
    ],
    tableAfter: { status: "CLEANING", by: "MANAGER", minutesAgo: 10 },
  },
  // Takeaway
  {
    key: "takeaway-new",
    customer: ALEX,
    type: "TAKEAWAY",
    lines: [
      ["smash-burger", 1],
      ["house-lemonade", 1],
    ],
    placedMinutesAgo: 1,
    steps: [],
  },
  {
    key: "takeaway-new-2",
    customer: SOFIA,
    type: "TAKEAWAY",
    method: "ONLINE",
    lines: [
      ["margherita-pizza", 2],
      ["gelato-trio", 1],
    ],
    placedMinutesAgo: 4,
    steps: [],
  },
  {
    key: "takeaway-accepted",
    customer: ALEX,
    type: "TAKEAWAY",
    lines: [
      ["fish-and-chips", 1],
      ["craft-beer", 1],
    ],
    placedMinutesAgo: 7,
    steps: [{ to: "ACCEPTED", by: "CASHIER", minutesAgo: 5 }],
  },
  {
    key: "takeaway-preparing",
    customer: SOFIA,
    type: "TAKEAWAY",
    lines: [
      ["grilled-chicken", 1],
      ["burrata-and-tomatoes", 1],
      ["sparkling-water", 1],
    ],
    placedMinutesAgo: 13,
    steps: [
      { to: "ACCEPTED", by: "CASHIER", minutesAgo: 11 },
      { to: "PREPARING", by: "KITCHEN", minutesAgo: 8 },
    ],
  },
  {
    key: "takeaway-ready",
    customer: ALEX,
    type: "TAKEAWAY",
    lines: [
      ["mushroom-risotto", 1],
      ["chocolate-lava-cake", 1],
      ["espresso", 1],
    ],
    placedMinutesAgo: 21,
    steps: [
      { to: "ACCEPTED", by: "KITCHEN", minutesAgo: 19 },
      { to: "PREPARING", by: "KITCHEN", minutesAgo: 16 },
      { to: "READY_FOR_PICKUP", by: "KITCHEN", minutesAgo: 3 },
    ],
  },
  {
    key: "takeaway-collected",
    customer: SOFIA,
    type: "TAKEAWAY",
    lines: [
      ["smash-burger", 2],
      ["craft-beer", 2],
    ],
    placedMinutesAgo: 110,
    steps: [
      { to: "ACCEPTED", by: "CASHIER", minutesAgo: 108 },
      { to: "PREPARING", by: "KITCHEN", minutesAgo: 104 },
      { to: "READY_FOR_PICKUP", by: "KITCHEN", minutesAgo: 92 },
      { to: "COLLECTED", by: "CASHIER", minutesAgo: 85 },
    ],
  },
  {
    key: "takeaway-no-show",
    customer: ALEX,
    type: "TAKEAWAY",
    lines: [
      ["charred-corn-ribs", 1],
      ["new-york-cheesecake", 1],
    ],
    placedMinutesAgo: 240,
    steps: [
      { to: "ACCEPTED", by: "CASHIER", minutesAgo: 238 },
      { to: "PREPARING", by: "KITCHEN", minutesAgo: 235 },
      { to: "READY_FOR_PICKUP", by: "KITCHEN", minutesAgo: 225 },
      { to: "NO_SHOW", by: "CASHIER", minutesAgo: 150, reason: "Not collected before closing" },
    ],
  },
];

/** A reservation with no order yet. */
const demoTables: Array<{ label: string; status: TableStatus; by: Actor }> = [
  { label: "T4", status: "RESERVED", by: "MANAGER" },
];

const DEMO_KEY_PREFIX = "seed-demo-";
const FINISHED: OrderStatus[] = ["CLOSED", "COLLECTED", "NO_SHOW", "CANCELLED", "REJECTED"];

export interface DemoServiceResult {
  /** False when demo orders already exist: the seed never duplicates or resets them. */
  created: boolean;
  orders: number;
  skipped: string[];
}

/** `-12 minutes`, for SQLite's datetime('now', ?). */
const ago = (minutes: number) => `-${minutes} minutes`;

/**
 * Seeds a restaurant mid-service through the same services the API uses: each demo order is
 * added to the customer's cart, quoted, paid with the dummy provider, and placed (so payment,
 * pickup code, items, table seating, and notifications are exactly what a real checkout makes),
 * then moved on by the staff role that does each step. Afterwards the timestamps are set back to
 * the times in `demoOrders`, so tickets show realistic waiting times.
 *
 * Runs once: if any demo order exists (payments with a `seed-demo-` idempotency key), nothing is
 * created, so re-seeding never duplicates orders or undoes what the staff did with them.
 * Needs the seeded users, menu, and tables, and runs outside any other transaction.
 */
export async function seedDemoService(dataSource: DataSource): Promise<DemoServiceResult> {
  const [existing] = await dataSource.query(
    `SELECT COUNT(*) AS "count" FROM "payments" WHERE "idempotency_key" LIKE ?`,
    [`${DEMO_KEY_PREFIX}%`],
  );
  if (Number(existing.count) > 0) {
    return { created: false, orders: Number(existing.count), skipped: [] };
  }

  const repo = dataSource.getRepository.bind(dataSource);
  const publisher = new NotificationPublisher(dataSource);
  const usersService = new UsersService(repo(User), new JwtService({}), publisher);
  const cartService = new CartService(
    dataSource,
    repo(User),
    repo(Cart),
    repo(CartItem),
    repo(MenuItem),
  );
  const paymentsService = new PaymentsService(
    dataSource,
    repo(Payment),
    repo(DiningTable),
    usersService,
    cartService,
    new SimulatedPaymentProvider(),
    publisher,
  );
  const ordersService = new OrdersService(
    dataSource,
    repo(Order),
    repo(Payment),
    paymentsService,
    usersService,
    publisher,
  );
  const staffOrders = new StaffOrdersService(dataSource, repo(Order), publisher);
  const tablesService = new TablesService(dataSource, repo(DiningTable), publisher);

  const users = new Map((await repo(User).find()).map((user) => [user.email ?? "", user]));
  const staffId = (role: Actor) => {
    const user = [...users.values()].find((entry) => entry.role === role && entry.active);
    if (!user) throw new Error(`Demo service needs an active ${role} account; run the user seed`);
    return user.id;
  };
  const menu = new Map((await repo(MenuItem).find()).map((item) => [item.slug, item.id]));
  const tables = new Map((await repo(DiningTable).find()).map((table) => [table.label, table]));

  /** Notifications written by `work` get `minutesAgo` as their time. */
  const latestNotification = async () =>
    Number(
      (await dataSource.query(`SELECT COALESCE(MAX("id"), 0) AS "id" FROM "notifications"`))[0].id,
    );
  const dated = async (minutesAgo: number, work: () => Promise<unknown>) => {
    const before = await latestNotification();
    await work();
    await dataSource.query(
      `UPDATE "notifications" SET "created_at" = datetime('now', ?) WHERE "id" > ?`,
      [ago(minutesAgo), before],
    );
  };

  const skipped: string[] = [];
  let created = 0;

  // Oldest first, so order numbers follow the order they were placed.
  for (const demo of [...demoOrders].sort((a, b) => b.placedMinutesAgo - a.placedMinutesAgo)) {
    const customer = users.get(demo.customer);
    if (!customer) throw new Error(`Demo customer ${demo.customer} is missing; run the user seed`);

    // Checkout pays for the whole cart, so never touch a customer's own cart.
    if ((await cartService.getCart(customer.id)).cart.items.length > 0) {
      skipped.push(`${demo.key} (${demo.customer} has items in their cart)`);
      continue;
    }
    const table = demo.table ? tables.get(demo.table) : undefined;
    if (demo.table && (!table || !table.active || !["FREE", "OCCUPIED"].includes(table.status))) {
      skipped.push(`${demo.key} (table ${demo.table} is not free)`);
      continue;
    }

    let orderId = 0;
    await dated(demo.placedMinutesAgo, async () => {
      for (const [slug, quantity] of demo.lines) {
        const menuItemId = menu.get(slug);
        if (!menuItemId) throw new Error(`Demo menu item "${slug}" is missing; run the menu seed`);
        await cartService.addItem(customer.id, { menuItemId, quantity });
      }
      const tipCents = demo.tipCents ?? 0;
      const { quote } = await paymentsService.quote(customer.id, tipCents);
      const { order } = await ordersService.checkout(
        customer.id,
        `${DEMO_KEY_PREFIX}${demo.key}`,
        checkoutSchema.parse({
          orderType: demo.type,
          ...(table ? { tableId: table.id } : {}),
          method: demo.method ?? "CARD",
          paymentToken: "tok_visa",
          tipCents,
          expectedTotalCents: quote.totalCents,
        }),
      );
      orderId = order.id;
    });

    for (const step of demo.steps) {
      await dated(step.minutesAgo, () =>
        staffOrders.changeStatus({ id: staffId(step.by), role: step.by }, orderId, {
          status: step.to,
          ...(step.reason ? { reason: step.reason } : {}),
        }),
      );
    }
    if (demo.tableAfter && table) {
      const { status, by, minutesAgo } = demo.tableAfter;
      await dated(minutesAgo, () => tablesService.changeStatus(table.id, status, staffId(by)));
    }

    const stepAt = (status: OrderStatus) =>
      demo.steps.find((step) => step.to === status)?.minutesAgo;
    const last = demo.steps.at(-1)?.minutesAgo ?? demo.placedMinutesAgo;
    const fired = demo.type === "DINE_IN" ? demo.placedMinutesAgo : (stepAt("ACCEPTED") ?? last);
    const ready = stepAt("READY") ?? stepAt("READY_FOR_PICKUP") ?? last;
    const finished = FINISHED.includes(demo.steps.at(-1)?.to ?? "SENT");

    await runAtomically(dataSource, (db) => {
      db.prepare(
        `UPDATE "orders" SET "created_at" = datetime('now', ?), "updated_at" = datetime('now', ?)
         WHERE "id" = ?`,
      ).run(ago(demo.placedMinutesAgo), ago(last), orderId);
      db.prepare(
        `UPDATE "payments" SET "created_at" = datetime('now', ?), "updated_at" = datetime('now', ?)
         WHERE "order_id" = ?`,
      ).run(ago(demo.placedMinutesAgo), ago(demo.placedMinutesAgo), orderId);
      db.prepare(
        `UPDATE "order_items" SET "created_at" = datetime('now', ?),
           "fired_at" = CASE WHEN "fired_at" IS NULL THEN NULL ELSE datetime('now', ?) END,
           "ready_at" = CASE WHEN "ready_at" IS NULL THEN NULL ELSE datetime('now', ?) END
         WHERE "order_id" = ?`,
      ).run(ago(demo.placedMinutesAgo), ago(fired), ago(ready), orderId);
      // Finished orders are history: everyone has seen their notifications.
      if (finished) {
        db.prepare(
          `UPDATE "notifications" SET "read_at" = "created_at"
           WHERE "entity_type" = 'ORDER' AND "entity_id" = ? AND "read_at" IS NULL`,
        ).run(orderId);
      }
    });
    created += 1;
  }

  for (const entry of demoTables) {
    const table = tables.get(entry.label);
    const current = table ? await repo(DiningTable).findOneBy({ id: table.id }) : null;
    if (current?.active && current.status === "FREE") {
      await tablesService.changeStatus(current.id, entry.status, staffId(entry.by));
    }
  }

  return { created: true, orders: created, skipped };
}
