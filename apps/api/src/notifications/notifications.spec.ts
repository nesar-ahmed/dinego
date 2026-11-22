import Database from "better-sqlite3";
import type { QueryRunner } from "typeorm";
import type { DataSource } from "typeorm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  internalPathSchema,
  markAllNotificationsReadSchema,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_TYPES,
  notificationItemSchema,
  notificationsQuerySchema,
  type UserRole,
} from "@dinego/shared";
import { CreateNotifications1794870000000 } from "../database/migrations/1794870000000-CreateNotifications.js";
import type { Notification } from "./entities/notification.entity.js";
import { NotificationPublisher } from "./notification-publisher.js";
import {
  accountNotifications,
  checkoutNotifications,
  CUSTOMER_REGISTERED_RECIPIENTS,
  floorNotifications,
  orderStatusNotifications,
  type OrderStatusChange,
  NOTIFICATION_TYPE_META,
  ORDER_RECEIVED_RECIPIENTS,
  type NotificationDraft,
  type PlacedOrder,
} from "./notifications.catalog.js";
import { toNotificationItem } from "./notifications.mapper.js";

const dineInOrder: PlacedOrder = {
  orderId: 42,
  orderNo: "DG-00042",
  type: "DINE_IN",
  customerId: 7,
  tableLabel: "T4",
  tableSeated: true,
  pickupCode: null,
  itemCount: 3,
  totalCents: 3430,
  method: "CARD",
};
const takeawayOrder: PlacedOrder = {
  ...dineInOrder,
  orderId: 43,
  orderNo: "DG-00043",
  type: "TAKEAWAY",
  tableLabel: null,
  tableSeated: false,
  pickupCode: "0427",
  itemCount: 1,
  totalCents: 590,
  method: "ONLINE",
};

const takeawayChange = (
  to: OrderStatusChange["to"],
  reason: string | null = null,
): OrderStatusChange => ({
  orderId: 43,
  orderNo: "DG-00043",
  type: "TAKEAWAY",
  customerId: 7,
  tableLabel: null,
  pickupCode: "0427",
  itemCount: 2,
  totalCents: 2580,
  from: "PLACED",
  to,
  reason,
  actorId: 2,
});
const dineInChange = (
  to: OrderStatusChange["to"],
  reason: string | null = null,
): OrderStatusChange => ({
  ...takeawayChange(to, reason),
  orderId: 42,
  orderNo: "DG-00042",
  type: "DINE_IN",
  tableLabel: "T4",
  pickupCode: null,
  from: "SENT",
});
const table = { tableId: 4, label: "T4", seats: 4, zone: "Window" };

const allAccountDrafts = (): NotificationDraft[] => [
  ...accountNotifications.registration({ id: 7, name: "Sam Lee", email: "sam@example.com" }),
  ...accountNotifications.emailChanged({
    userId: 7,
    previousEmail: "sam@example.com",
    newEmail: "sam.lee@example.com",
  }),
  ...accountNotifications.passwordChanged({ userId: 7, tokenVersion: 3 }),
  ...checkoutNotifications.orderPlaced(dineInOrder),
  ...checkoutNotifications.orderPlaced(takeawayOrder),
  ...checkoutNotifications.checkoutInterrupted({
    paymentId: 9,
    customerId: 7,
    orderType: "TAKEAWAY",
    amountCents: 590,
  }),
  ...checkoutNotifications.providerOutage({
    provider: "simulated",
    paymentId: 9,
    reason: "unavailable",
    at: new Date(),
  }),
  ...(
    ["ACCEPTED", "READY_FOR_PICKUP", "COLLECTED", "REJECTED", "CANCELLED", "NO_SHOW"] as const
  ).flatMap((to) => orderStatusNotifications.statusChanged(takeawayChange(to, "Out of fish"))),
  ...(["READY", "CLOSED", "CANCELLED"] as const).flatMap((to) =>
    orderStatusNotifications.statusChanged(dineInChange(to, "Out of fish")),
  ),
  ...orderStatusNotifications.acceptanceOverdue({
    orderId: 43,
    orderNo: "DG-00043",
    pickupCode: "0427",
    itemCount: 2,
    totalCents: 2580,
    minutesWaiting: 12,
  }),
  ...floorNotifications.billRequested(table, 3),
  ...floorNotifications.needsCleaning(table, 3),
  ...floorNotifications.layoutChanged(table, "ADDED", 2),
];

describe("notification catalog", () => {
  it("describes every notification type with a valid category and priority", () => {
    for (const type of NOTIFICATION_TYPES) {
      const meta = NOTIFICATION_TYPE_META[type];
      expect(NOTIFICATION_CATEGORIES).toContain(meta.category);
      expect(NOTIFICATION_PRIORITIES).toContain(meta.priority);
    }
  });

  it("only links to paths inside the app", () => {
    for (const draft of allAccountDrafts()) {
      if (draft.link !== null) {
        expect(internalPathSchema.safeParse(draft.link).success).toBe(true);
      }
    }
  });

  it("welcomes the customer by first name and tells ADMIN and MANAGER staff", () => {
    const [welcome, staff] = accountNotifications.registration({
      id: 7,
      name: "Sam Lee",
      email: "sam@example.com",
    });

    expect(welcome).toMatchObject({
      type: "CUSTOMER_WELCOME",
      audience: { kind: "user", userId: 7 },
      title: "Welcome to DineGo, Sam!",
      link: "/menu",
      entity: { type: "USER", id: 7 },
      dedupeKey: "customer:7:welcome",
    });
    expect(staff).toMatchObject({
      type: "CUSTOMER_REGISTERED",
      audience: { kind: "roles", roles: ["ADMIN", "MANAGER"], excludeUserId: 7 },
      body: "Sam Lee (sam@example.com) created a customer account.",
      link: "/admin/customers",
      data: { customerId: 7 },
      dedupeKey: "customer:7:registered",
    });
    expect(CUSTOMER_REGISTERED_RECIPIENTS).toEqual(["ADMIN", "MANAGER"]);
  });

  it("uses the first word of the name, ignoring extra spaces", () => {
    const [welcome] = accountNotifications.registration({
      id: 7,
      name: "  Sam   Lee ",
      email: null,
    });
    expect(welcome.title).toBe("Welcome to DineGo, Sam!");
  });

  it("leaves the email out of the staff message when there is none", () => {
    const [, staff] = accountNotifications.registration({ id: 8, name: "Alex", email: null });
    expect(staff.body).toBe("Alex created a customer account.");
  });

  it("shows the old and new email, and makes each password change unique", () => {
    const [email] = accountNotifications.emailChanged({
      userId: 7,
      previousEmail: "old@example.com",
      newEmail: "new@example.com",
    });
    expect(email.body).toContain("You now sign in with new@example.com instead of old@example.com");
    expect(email.dedupeKey).toBeNull();

    const [first] = accountNotifications.passwordChanged({ userId: 7, tokenVersion: 1 });
    const [second] = accountNotifications.passwordChanged({ userId: 7, tokenVersion: 2 });
    expect(first.dedupeKey).toBe("user:7:password:v1");
    expect(second.dedupeKey).not.toBe(first.dedupeKey);
  });
});

describe("checkout notification catalog", () => {
  it("confirms a dine-in order to the customer and alerts dine-in staff", () => {
    const [customer, staff] = checkoutNotifications.orderPlaced(dineInOrder);

    expect(customer).toMatchObject({
      type: "ORDER_PLACED",
      audience: { kind: "user", userId: 7 },
      title: "Order DG-00042 is with the kitchen",
      body: "Table T4 · 3 items · $34.30, paid by card. We'll bring it to your table.",
      link: "/account/orders/42",
      entity: { type: "ORDER", id: 42 },
      dedupeKey: "order:42:placed",
    });
    expect(staff).toMatchObject({
      type: "ORDER_RECEIVED",
      audience: {
        kind: "roles",
        roles: ["ADMIN", "MANAGER", "WAITER", "KITCHEN"],
        excludeUserId: 7,
      },
      title: "New dine-in order DG-00042",
      body: "Table T4 · 3 items · $34.30. Sent to the kitchen; the table is now occupied.",
      link: null,
      dedupeKey: "order:42:received",
    });
    expect(staff.data).toEqual({
      orderId: 42,
      orderNo: "DG-00042",
      orderType: "DINE_IN",
      tableLabel: "T4",
      pickupCode: null,
      itemCount: 3,
      totalCents: 3430,
    });

    // A party ordering again at a table that was already occupied.
    const [, again] = checkoutNotifications.orderPlaced({ ...dineInOrder, tableSeated: false });
    expect(again.body).toBe("Table T4 · 3 items · $34.30. Sent to the kitchen.");
  });

  it("gives the takeaway customer the pickup code and alerts takeaway staff", () => {
    const [customer, staff] = checkoutNotifications.orderPlaced(takeawayOrder);

    expect(customer).toMatchObject({
      title: "Order DG-00043 is placed",
      body: "1 item · $5.90, paid online. Your pickup code is 0427: show it when you collect your order.",
      link: "/account/orders/43",
    });
    expect(staff).toMatchObject({
      title: "New takeaway order DG-00043",
      body: "1 item · $5.90 · pickup code 0427. Waiting to be accepted.",
      audience: { kind: "roles", roles: ["ADMIN", "MANAGER", "CASHIER", "KITCHEN"] },
    });
  });

  it("sends new orders to the kitchen and managers, waiters for dine-in, cashiers for takeaway", () => {
    expect(ORDER_RECEIVED_RECIPIENTS.DINE_IN).toEqual(["ADMIN", "MANAGER", "WAITER", "KITCHEN"]);
    expect(ORDER_RECEIVED_RECIPIENTS.TAKEAWAY).toEqual(["ADMIN", "MANAGER", "CASHIER", "KITCHEN"]);
  });

  it("tells the customer an interrupted checkout charged nothing", () => {
    const [draft] = checkoutNotifications.checkoutInterrupted({
      paymentId: 9,
      customerId: 7,
      orderType: "DINE_IN",
      amountCents: 3430,
    });

    expect(draft).toMatchObject({
      type: "CHECKOUT_INTERRUPTED",
      audience: { kind: "user", userId: 7 },
      title: "Your checkout didn't finish",
      link: "/checkout",
      entity: { type: "PAYMENT", id: 9 },
      dedupeKey: "payment:9:interrupted",
    });
    expect(draft.body).toBe(
      "Your dine-in checkout of $34.30 was interrupted. You were not charged and no order was placed. Your cart is unchanged, so you can check out again.",
    );
  });

  it("alerts about a provider outage at most once per clock hour", () => {
    const outage = (at: string, reason: "unavailable" | "error" = "unavailable") =>
      checkoutNotifications.providerOutage({
        provider: "simulated",
        paymentId: 9,
        reason,
        at: new Date(at),
      })[0];

    expect(outage("2026-11-17T09:05:00Z")).toMatchObject({
      type: "PAYMENT_PROVIDER_OUTAGE",
      audience: { kind: "roles", roles: ["ADMIN", "MANAGER"] },
      dedupeKey: "payments:provider-outage:2026-11-17T09",
    });
    expect(outage("2026-11-17T09:59:59Z").dedupeKey).toBe(outage("2026-11-17T09:00:00Z").dedupeKey);
    expect(outage("2026-11-17T10:00:00Z").dedupeKey).toBe("payments:provider-outage:2026-11-17T10");
    expect(outage("2026-11-17T09:05:00Z").body).toContain("could not be reached");
    expect(outage("2026-11-17T09:05:00Z", "error").body).toContain("unexpected error");
  });
});

describe("order status notification catalog", () => {
  const types = (drafts: NotificationDraft[]) => drafts.map((draft) => draft.type);

  it("tells the customer when a takeaway order is accepted, with the pickup code", () => {
    const [accepted, ...rest] = orderStatusNotifications.statusChanged(takeawayChange("ACCEPTED"));

    expect(rest).toEqual([]);
    expect(accepted).toMatchObject({
      type: "ORDER_ACCEPTED",
      audience: { kind: "user", userId: 7 },
      title: "Order DG-00043 is accepted",
      body: "We're preparing it now and will let you know when it's ready. Your pickup code is 0427.",
      link: "/account/orders/43",
      entity: { type: "ORDER", id: 43 },
      dedupeKey: "order:43:status:ACCEPTED",
    });
  });

  it("tells the customer and the hand-over staff when the order is ready", () => {
    const [customer, cashier] = orderStatusNotifications.statusChanged(
      takeawayChange("READY_FOR_PICKUP"),
    );
    expect(customer).toMatchObject({
      type: "ORDER_READY",
      title: "Order DG-00043 is ready for pickup",
      body: "Show pickup code 0427 at the counter to collect it.",
    });
    expect(cashier).toMatchObject({
      type: "ORDER_READY_FOR_SERVICE",
      audience: { kind: "roles", roles: ["CASHIER"], excludeUserId: 2 },
      title: "Order DG-00043 is ready for pickup",
      link: null,
      dedupeKey: "order:43:status:READY_FOR_PICKUP:staff",
    });

    const [diner, waiter] = orderStatusNotifications.statusChanged(dineInChange("READY"));
    expect(diner).toMatchObject({
      type: "ORDER_READY",
      body: "It's on its way to table T4. Enjoy your meal!",
    });
    expect(waiter).toMatchObject({
      audience: { kind: "roles", roles: ["WAITER"] },
      title: "Order DG-00042 is ready for table T4",
      body: "2 items · $25.80. Serve it now.",
    });
  });

  it("thanks the customer when the order is collected or closed", () => {
    expect(orderStatusNotifications.statusChanged(takeawayChange("COLLECTED"))).toEqual([
      expect.objectContaining({
        type: "ORDER_COMPLETED",
        title: "Thanks for collecting order DG-00043",
      }),
    ]);
    expect(orderStatusNotifications.statusChanged(dineInChange("CLOSED"))).toEqual([
      expect.objectContaining({ type: "ORDER_COMPLETED", title: "Thanks for dining with us" }),
    ]);
  });

  it("gives the reason when an order is declined or cancelled, and stops the staff", () => {
    const [customer, staff] = orderStatusNotifications.statusChanged(
      takeawayChange("REJECTED", "We ran out of fish"),
    );
    expect(customer).toMatchObject({
      type: "ORDER_CANCELLED",
      title: "Order DG-00043 was declined",
      body: "The restaurant couldn't take your order. Reason: We ran out of fish. Refunds are handled by the restaurant: please contact us about your payment of $25.80.",
    });
    expect(customer.data).toMatchObject({ status: "REJECTED", reason: "We ran out of fish" });
    expect(staff).toMatchObject({
      type: "ORDER_STOPPED",
      audience: {
        kind: "roles",
        roles: ["ADMIN", "MANAGER", "KITCHEN", "CASHIER"],
        excludeUserId: 2,
      },
      body: "2 items · $25.80. Reason: We ran out of fish. Don't prepare it.",
    });

    const [, dineInStaff] = orderStatusNotifications.statusChanged(
      dineInChange("CANCELLED", "Guest left"),
    );
    expect(dineInStaff).toMatchObject({
      audience: { kind: "roles", roles: ["ADMIN", "MANAGER", "KITCHEN", "WAITER"] },
      title: "Order DG-00042 was cancelled",
      body: "Table T4 · 2 items · $25.80. Reason: Guest left. Stop preparing it.",
    });
  });

  it("tells the customer and managers about a no-show, with or without a reason", () => {
    const [customer, staff] = orderStatusNotifications.statusChanged(takeawayChange("NO_SHOW"));
    expect(customer).toMatchObject({
      title: "Order DG-00043 was not collected",
      body: "We kept your order ready, but it wasn't collected. Please contact us if you still want it.",
    });
    expect(staff.audience).toEqual({
      kind: "roles",
      roles: ["ADMIN", "MANAGER"],
      excludeUserId: 2,
    });
  });

  it("stays quiet for kitchen steps the tracker already shows", () => {
    for (const to of ["PREPARING", "SENT", "IN_PROGRESS", "SERVED"] as const) {
      expect(orderStatusNotifications.statusChanged(takeawayChange(to))).toEqual([]);
    }
  });

  it("notifies only staff about orders that have no customer", () => {
    const drafts = orderStatusNotifications.statusChanged({
      ...takeawayChange("READY_FOR_PICKUP"),
      customerId: null,
    });
    expect(types(drafts)).toEqual(["ORDER_READY_FOR_SERVICE"]);
    expect(
      orderStatusNotifications.statusChanged({ ...takeawayChange("ACCEPTED"), customerId: null }),
    ).toEqual([]);
  });

  it("alerts ADMIN and MANAGER once about a takeaway order waiting to be accepted", () => {
    const [overdue] = orderStatusNotifications.acceptanceOverdue({
      orderId: 43,
      orderNo: "DG-00043",
      pickupCode: "0427",
      itemCount: 2,
      totalCents: 2580,
      minutesWaiting: 12,
    });
    expect(overdue).toMatchObject({
      type: "ORDER_ACCEPTANCE_OVERDUE",
      audience: { kind: "roles", roles: ["ADMIN", "MANAGER"] },
      title: "Takeaway order DG-00043 is waiting to be accepted",
      body: "Placed 12 minutes ago and not accepted yet. Pickup code 0427 · 2 items · $25.80.",
      dedupeKey: "order:43:acceptance-overdue",
    });
  });
});

describe("floor notification catalog", () => {
  it("sends bill requests to cashiers and waiters, and cleaning to waiters", () => {
    expect(floorNotifications.billRequested(table, 3)[0]).toMatchObject({
      type: "TABLE_BILL_REQUESTED",
      audience: { kind: "roles", roles: ["CASHIER", "WAITER"], excludeUserId: 3 },
      title: "Table T4 asked for the bill",
      body: "Bring the bill to table T4 (4 seats · Window).",
      entity: { type: "TABLE", id: 4 },
      dedupeKey: null,
    });
    expect(
      floorNotifications.needsCleaning({ ...table, seats: 1, zone: null }, 3)[0],
    ).toMatchObject({
      type: "TABLE_NEEDS_CLEANING",
      audience: { kind: "roles", roles: ["WAITER"], excludeUserId: 3 },
      title: "Table T4 needs cleaning",
    });
  });

  it("describes each layout change for ADMIN and MANAGER", () => {
    const title = (change: "ADDED" | "REMOVED" | "OUT_OF_SERVICE" | "BACK_IN_SERVICE") =>
      floorNotifications.layoutChanged(table, change, 2)[0].title;
    expect(title("ADDED")).toBe("Table T4 was added");
    expect(title("REMOVED")).toBe("Table T4 was removed");
    expect(title("OUT_OF_SERVICE")).toBe("Table T4 is out of service");
    expect(title("BACK_IN_SERVICE")).toBe("Table T4 is back in service");
    expect(floorNotifications.layoutChanged(table, "ADDED", 2)[0]).toMatchObject({
      audience: { kind: "roles", roles: ["ADMIN", "MANAGER"], excludeUserId: 2 },
      data: { tableId: 4, label: "T4", change: "ADDED" },
    });
  });
});

describe("notification request schemas", () => {
  it("pages newest-first lists and filters by read state and category", () => {
    expect(notificationsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(
      notificationsQuerySchema.parse({
        page: "2",
        pageSize: "5",
        unread: "true",
        category: "ACCOUNT",
      }),
    ).toEqual({ page: 2, pageSize: 5, unread: true, category: "ACCOUNT" });
    expect(notificationsQuerySchema.parse({ unread: "false" }).unread).toBe(false);

    for (const invalid of [
      { pageSize: "51" },
      { page: "0" },
      { unread: "yes" },
      { category: "account" },
      { sort: "oldest" },
    ]) {
      expect(notificationsQuerySchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("accepts an empty mark-all body and an optional upToId", () => {
    expect(markAllNotificationsReadSchema.parse(undefined)).toEqual({});
    expect(markAllNotificationsReadSchema.parse({})).toEqual({});
    expect(markAllNotificationsReadSchema.parse({ upToId: 14 })).toEqual({ upToId: 14 });
    expect(markAllNotificationsReadSchema.safeParse({ upToId: 0 }).success).toBe(false);
    expect(markAllNotificationsReadSchema.safeParse({ upToId: "14" }).success).toBe(false);
    expect(markAllNotificationsReadSchema.safeParse({ all: true }).success).toBe(false);
  });

  it("only accepts links inside the app", () => {
    for (const path of ["/menu", "/account/orders/42", "/account/profile#email"]) {
      expect(internalPathSchema.safeParse(path).success).toBe(true);
    }
    for (const path of ["//evil.example", "https://evil.example", "menu", ""]) {
      expect(internalPathSchema.safeParse(path).success).toBe(false);
    }
  });
});

describe("toNotificationItem", () => {
  it("hides internal fields and derives the read flag", () => {
    const base = {
      id: 3,
      recipientId: 7,
      recipient: undefined,
      type: "CUSTOMER_WELCOME",
      category: "ACCOUNT",
      priority: "NORMAL",
      title: "Welcome",
      body: "Body",
      link: "/menu",
      entityType: "USER",
      entityId: 7,
      data: null,
      dedupeKey: "customer:7:welcome",
      createdAt: new Date("2026-11-17T09:00:00.000Z"),
    } as unknown as Notification;

    const unread = toNotificationItem({ ...base, readAt: null } as Notification);
    expect(notificationItemSchema.parse(unread)).toEqual(unread);
    expect(unread).toMatchObject({ read: false, readAt: null });
    expect(unread).not.toHaveProperty("recipientId");
    expect(unread).not.toHaveProperty("dedupeKey");

    const read = toNotificationItem({
      ...base,
      readAt: new Date("2026-11-17T09:05:00.000Z"),
    } as Notification);
    expect(read).toMatchObject({ read: true, readAt: "2026-11-17T09:05:00.000Z" });
  });
});

/**
 * The publisher's SQL against a real in-memory SQLite database, with the notifications table
 * created by the real migration.
 */
describe("NotificationPublisher", () => {
  let db: Database.Database;
  let publisher: NotificationPublisher;

  const addUser = (id: number, role: UserRole, active = true) =>
    db
      .prepare(`INSERT INTO "users" ("id", "role", "active") VALUES (?, ?, ?)`)
      .run(id, role, active ? 1 : 0);
  const recipientsOf = (type: string) =>
    (
      db
        .prepare(
          `SELECT "recipient_id" FROM "notifications" WHERE "type" = ? ORDER BY "recipient_id"`,
        )
        .all(type) as Array<{ recipient_id: number }>
    ).map((row) => row.recipient_id);

  beforeEach(async () => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(
      `CREATE TABLE "users" ("id" integer PRIMARY KEY, "role" text NOT NULL, "active" boolean NOT NULL)`,
    );
    const queryRunner = { query: async (sql: string) => db.exec(sql) } as unknown as QueryRunner;
    await new CreateNotifications1794870000000().up(queryRunner);

    const dataSource = { driver: { databaseConnection: db } } as unknown as DataSource;
    publisher = new NotificationPublisher(dataSource);

    addUser(1, "ADMIN");
    addUser(2, "MANAGER");
    addUser(3, "MANAGER", false);
    addUser(4, "WAITER");
    addUser(5, "KITCHEN");
    addUser(6, "CASHIER");
    addUser(7, "CUSTOMER");
  });

  afterEach(() => {
    db.close();
    vi.restoreAllMocks();
  });

  it("fans out to active users with the roles, and to the customer", async () => {
    const created = await publisher.publish(
      accountNotifications.registration({ id: 7, name: "Sam Lee", email: "sam@example.com" }),
    );

    expect(created).toBe(3);
    expect(recipientsOf("CUSTOMER_WELCOME")).toEqual([7]);
    // The inactive manager (3) and the other staff roles are not notified.
    expect(recipientsOf("CUSTOMER_REGISTERED")).toEqual([1, 2]);

    const row = db
      .prepare(`SELECT * FROM "notifications" WHERE "type" = 'CUSTOMER_REGISTERED' LIMIT 1`)
      .get() as Record<string, unknown>;
    expect(row).toMatchObject({
      category: "ACCOUNT",
      priority: "LOW",
      entity_type: "USER",
      entity_id: 7,
      data: JSON.stringify({ customerId: 7 }),
      read_at: null,
    });
  });

  it("can reach every role, and never notifies the person who caused the event", () => {
    const draft: NotificationDraft = {
      ...accountNotifications.registration({ id: 7, name: "Sam", email: null })[1],
      audience: {
        kind: "roles",
        roles: ["ADMIN", "MANAGER", "WAITER", "KITCHEN", "CASHIER"],
        excludeUserId: 4,
      },
    };

    const created = db.transaction(() => publisher.write(db, [draft]))();

    expect(created).toBe(4);
    expect(recipientsOf("CUSTOMER_REGISTERED")).toEqual([1, 2, 5, 6]);
  });

  it("notifies each recipient once per dedupe key", async () => {
    const drafts = accountNotifications.registration({ id: 7, name: "Sam", email: null });

    expect(await publisher.publish(drafts)).toBe(3);
    expect(await publisher.publish(drafts)).toBe(0);

    // Without a dedupe key, every event is new.
    const email = accountNotifications.emailChanged({
      userId: 7,
      previousEmail: "a@example.com",
      newEmail: "b@example.com",
    });
    expect(await publisher.publish(email)).toBe(1);
    expect(await publisher.publish(email)).toBe(1);
    expect(recipientsOf("EMAIL_CHANGED")).toEqual([7, 7]);
  });

  it("skips inactive or missing accounts", async () => {
    expect(
      await publisher.publish(accountNotifications.passwordChanged({ userId: 3, tokenVersion: 1 })),
    ).toBe(0);
    expect(
      await publisher.publish(
        accountNotifications.passwordChanged({ userId: 99, tokenVersion: 1 }),
      ),
    ).toBe(0);
  });

  it("rolls back the whole batch when one draft is invalid", () => {
    const [welcome] = accountNotifications.registration({ id: 7, name: "Sam", email: null });
    const invalid: NotificationDraft = { ...welcome, dedupeKey: "other", link: "//evil.example" };

    expect(() => db.transaction(() => publisher.write(db, [welcome, invalid]))()).toThrow(
      /CHECK constraint/,
    );
    expect(recipientsOf("CUSTOMER_WELCOME")).toEqual([]);
  });

  it("logs instead of failing the caller when publishing fails", async () => {
    const error = vi.spyOn(publisher["logger"], "error").mockImplementation(() => undefined);
    const [welcome] = accountNotifications.registration({ id: 7, name: "Sam", email: null });

    await expect(publisher.publish([{ ...welcome, link: "//evil.example" }])).resolves.toBe(0);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Could not create CUSTOMER_WELCOME notification(s)"),
      expect.any(String),
    );
    expect(recipientsOf("CUSTOMER_WELCOME")).toEqual([]);
  });

  it("does nothing for an empty batch", async () => {
    expect(await publisher.publish([])).toBe(0);
    expect(db.transaction(() => publisher.writeAlongside(db, []))()).toBe(0);
  });

  describe("writeAlongside", () => {
    const placed = () => checkoutNotifications.orderPlaced({ ...dineInOrder, customerId: 7 });

    it("commits the notifications with the caller's change", () => {
      db.exec(`CREATE TABLE "orders_test" ("id" integer PRIMARY KEY)`);

      const created = db.transaction(() => {
        db.prepare(`INSERT INTO "orders_test" DEFAULT VALUES`).run();
        return publisher.writeAlongside(db, placed());
      })();

      // The customer, plus ADMIN, MANAGER (active), WAITER, and KITCHEN; not the CASHIER.
      expect(created).toBe(5);
      expect(recipientsOf("ORDER_PLACED")).toEqual([7]);
      expect(recipientsOf("ORDER_RECEIVED")).toEqual([1, 2, 4, 5]);
      expect(db.inTransaction).toBe(false);
    });

    it("rolls back with the caller's change", () => {
      expect(() =>
        db.transaction(() => {
          publisher.writeAlongside(db, placed());
          throw new Error("order failed");
        })(),
      ).toThrow("order failed");

      expect(recipientsOf("ORDER_PLACED")).toEqual([]);
      expect(recipientsOf("ORDER_RECEIVED")).toEqual([]);
    });

    it("never fails the caller's change: a failing batch is dropped and logged", () => {
      const error = vi.spyOn(publisher["logger"], "error").mockImplementation(() => undefined);
      db.exec(`CREATE TABLE "orders_test" ("id" integer PRIMARY KEY)`);
      const [customer, staff] = placed();

      const created = db.transaction(() => {
        db.prepare(`INSERT INTO "orders_test" DEFAULT VALUES`).run();
        // The first draft is valid, the second is not: the whole batch is dropped.
        const result = publisher.writeAlongside(db, [customer, { ...staff, link: "//evil" }]);
        db.prepare(`INSERT INTO "orders_test" DEFAULT VALUES`).run();
        return result;
      })();

      expect(created).toBe(0);
      expect(db.prepare(`SELECT COUNT(*) AS "count" FROM "orders_test"`).get()).toEqual({
        count: 2,
      });
      expect(recipientsOf("ORDER_PLACED")).toEqual([]);
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining("Could not create ORDER_PLACED, ORDER_RECEIVED notification(s)"),
        expect.any(String),
      );
    });
  });
});
