import "reflect-metadata";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DataSource } from "typeorm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  apiErrorSchema,
  markAllNotificationsReadResponseSchema,
  notificationDeleteResponseSchema,
  notificationReadResponseSchema,
  notificationsResponseSchema,
  notificationUnreadCountResponseSchema,
  USER_ROLES,
  type NotificationItem,
  type UserRole,
} from "@dinego/shared";
import { buildDataSourceOptions } from "../src/database/data-source.js";
import { seedUsers, userAccounts } from "../src/database/seeds/users.seed.js";
import { NotificationRetention } from "../src/notifications/notification-retention.js";
import { createE2eApp, type ServerLogs } from "./support/e2e-app.js";

const STAFF_ROLES = USER_ROLES.filter(
  (role): role is Exclude<UserRole, "CUSTOMER"> => role !== "CUSTOMER",
);
const account = (role: UserRole) => userAccounts.find((entry) => entry.role === role)!;
const PASSWORD = "Password123!";

describe("Notifications API (e2e)", () => {
  let app: INestApplication;
  let logs: ServerLogs;
  let dataSource: DataSource;
  let databaseDir: string;
  let originalDatabasePath: string | undefined;
  const staffTokens = {} as Record<Exclude<UserRole, "CUSTOMER">, string>;

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  const login = (email: string, password: string) =>
    request(server()).post("/api/v1/users/session-login").send({ email, password });

  let counter = 0;
  const register = (email: string, name = "Notify Customer") =>
    request(server()).post("/api/v1/users/register").send({ name, email, password: PASSWORD });
  /** A fresh customer per test, so inboxes never overlap. */
  const newCustomer = async (name = "Notify Customer") => {
    counter += 1;
    const email = `notify-${counter}-${Date.now()}@dinego.com`;
    const response = await register(email, name).expect(201);
    return {
      token: response.body.accessToken as string,
      id: response.body.customer.id as number,
      email,
    };
  };

  const list = async (token: string, query = "") =>
    notificationsResponseSchema.parse(
      (await request(server()).get(`/api/v1/notifications${query}`).set(bearer(token)).expect(200))
        .body,
    );
  const unread = async (token: string) =>
    notificationUnreadCountResponseSchema.parse(
      (
        await request(server())
          .get("/api/v1/notifications/unread-count")
          .set(bearer(token))
          .expect(200)
      ).body,
    );
  const markRead = (token: string, id: number | string) =>
    request(server()).patch(`/api/v1/notifications/${id}/read`).set(bearer(token));
  const markUnread = (token: string, id: number | string) =>
    request(server()).patch(`/api/v1/notifications/${id}/unread`).set(bearer(token));
  const remove = (token: string, id: number | string) =>
    request(server()).delete(`/api/v1/notifications/${id}`).set(bearer(token));
  const markAll = (token: string, body?: object) => {
    const call = request(server()).post("/api/v1/notifications/read-all").set(bearer(token));
    return body === undefined ? call : call.send(body);
  };
  /** Notifications about one customer in a staff inbox. */
  const aboutCustomer = (items: NotificationItem[], customerId: number) =>
    items.filter((item) => item.entityType === "USER" && item.entityId === customerId);
  const staffInbox = async (role: Exclude<UserRole, "CUSTOMER">) =>
    (await list(staffTokens[role], "?pageSize=50")).notifications;

  beforeAll(async () => {
    originalDatabasePath = process.env.DATABASE_PATH;
    databaseDir = mkdtempSync(join(tmpdir(), "dinego-notifications-e2e-"));
    process.env.DATABASE_PATH = join(databaseDir, "test.sqlite");

    dataSource = new DataSource(buildDataSourceOptions());
    await dataSource.initialize();
    await dataSource.runMigrations();
    await dataSource.transaction(async (manager) => {
      await seedUsers(manager);
    });
    // An inactive manager, who must never be notified.
    await dataSource.query(
      `INSERT INTO "users" ("name", "email", "role", "active") VALUES ('Former Manager', 'former-manager@dinego.com', 'MANAGER', 0)`,
    );

    ({ app, logs } = await createE2eApp());

    for (const role of STAFF_ROLES) {
      const { email, password } = account(role);
      staffTokens[role] = (await login(email, password).expect(200)).body.accessToken as string;
    }
  });

  afterEach(() => {
    logs.assertNoUnexpectedErrors();
  });

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    rmSync(databaseDir, { recursive: true, force: true });

    if (originalDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = originalDatabasePath;
    }
  });

  describe("access", () => {
    it("requires a session", async () => {
      await request(server()).get("/api/v1/notifications").expect(401);
      await request(server()).get("/api/v1/notifications/unread-count").expect(401);
      await request(server()).patch("/api/v1/notifications/1/read").expect(401);
      await request(server()).patch("/api/v1/notifications/1/unread").expect(401);
      await request(server()).delete("/api/v1/notifications/1").expect(401);
      await request(server()).post("/api/v1/notifications/read-all").expect(401);
    });

    it("works for customers and every staff role", async () => {
      const customer = await newCustomer();

      for (const token of [customer.token, ...Object.values(staffTokens)]) {
        await list(token);
        await unread(token);
        await markAll(token, {}).expect(200);
      }
    });
  });

  describe("registration", () => {
    it("welcomes the customer", async () => {
      const customer = await newCustomer("Sam Lee");

      const count = await unread(customer.token);
      expect(count.unreadCount).toBe(1);

      const inbox = await list(customer.token);
      expect(inbox.unreadCount).toBe(1);
      expect(inbox.pagination).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
      expect(inbox.notifications).toHaveLength(1);
      expect(inbox.notifications[0]).toMatchObject({
        id: count.latestId,
        type: "CUSTOMER_WELCOME",
        category: "ACCOUNT",
        priority: "NORMAL",
        title: "Welcome to DineGo, Sam!",
        link: "/menu",
        entityType: "USER",
        entityId: customer.id,
        data: null,
        read: false,
        readAt: null,
      });
      expect(inbox.notifications[0]).not.toHaveProperty("recipientId");
      expect(inbox.notifications[0]).not.toHaveProperty("dedupeKey");
    });

    it("tells ADMIN and MANAGER staff, and nobody else", async () => {
      const customer = await newCustomer("Priya Shah");

      for (const role of ["ADMIN", "MANAGER"] as const) {
        const items = aboutCustomer(await staffInbox(role), customer.id);
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
          type: "CUSTOMER_REGISTERED",
          priority: "LOW",
          title: "New customer registered",
          body: `Priya Shah (${customer.email}) created a customer account.`,
          link: "/admin/customers",
          data: { customerId: customer.id },
          read: false,
        });
      }

      for (const role of ["WAITER", "CASHIER", "KITCHEN"] as const) {
        expect(aboutCustomer(await staffInbox(role), customer.id)).toEqual([]);
      }

      const [{ count }] = await dataSource.query(
        `SELECT COUNT(*) AS "count" FROM "notifications" n JOIN "users" u ON u."id" = n."recipient_id"
         WHERE u."email" = 'former-manager@dinego.com'`,
      );
      expect(Number(count)).toBe(0);
    });

    it("notifies nobody when the registration is refused", async () => {
      const customer = await newCustomer();
      const before = await unread(staffTokens.ADMIN);

      await register(customer.email).expect(409);

      expect(await unread(staffTokens.ADMIN)).toEqual(before);
    });

    it("notifies once per customer when many register at the same time", async () => {
      const stamp = Date.now();
      const responses = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          register(`burst-${stamp}-${index}@dinego.com`, `Burst ${index}`),
        ),
      );
      const ids = responses.map((response) => {
        expect(response.status).toBe(201);
        return response.body.customer.id as number;
      });
      const inbox = await staffInbox("MANAGER");

      for (const id of ids) {
        expect(aboutCustomer(inbox, id)).toHaveLength(1);
      }
      for (const response of responses) {
        expect((await unread(response.body.accessToken)).unreadCount).toBe(1);
      }
    });
  });

  describe("account changes", () => {
    it("tells every session about an email change", async () => {
      const customer = await newCustomer();
      const otherDevice = (await login(customer.email, PASSWORD).expect(200)).body
        .accessToken as string;
      const newEmail = `changed-${Date.now()}@dinego.com`;

      await request(server())
        .put("/api/v1/users/me/email")
        .set(bearer(customer.token))
        .send({ newEmail, currentPassword: PASSWORD })
        .expect(200);

      const [latest] = (await list(otherDevice)).notifications;
      expect(latest).toMatchObject({
        type: "EMAIL_CHANGED",
        priority: "HIGH",
        title: "Your email address was changed",
        link: "/account/profile#email",
        read: false,
      });
      expect(latest.body).toContain(
        `You now sign in with ${newEmail} instead of ${customer.email}`,
      );
    });

    it("tells the customer about a password change, on the session that stays signed in", async () => {
      const customer = await newCustomer();

      const changed = await request(server())
        .put("/api/v1/users/me/password")
        .set(bearer(customer.token))
        .send({ currentPassword: PASSWORD, newPassword: "Changed123!" })
        .expect(200);

      // The old session was signed out; the new token sees the notification.
      await request(server()).get("/api/v1/notifications").set(bearer(customer.token)).expect(401);
      const [latest] = (await list(changed.body.accessToken)).notifications;
      expect(latest).toMatchObject({
        type: "PASSWORD_CHANGED",
        priority: "HIGH",
        title: "Your password was changed",
        link: "/account/profile#password",
      });
    });

    it("notifies nothing for failed changes or profile edits", async () => {
      const customer = await newCustomer();
      const before = await unread(customer.token);

      await request(server())
        .put("/api/v1/users/me/email")
        .set(bearer(customer.token))
        .send({ newEmail: "someone-else@dinego.com", currentPassword: "WrongPassword1!" })
        .expect(400);
      await request(server())
        .put("/api/v1/users/me/password")
        .set(bearer(customer.token))
        .send({ currentPassword: "WrongPassword1!", newPassword: "Changed123!" })
        .expect(400);
      await request(server())
        .patch("/api/v1/users/me/profile")
        .set(bearer(customer.token))
        .send({ name: "Renamed Customer" })
        .expect(200);

      expect(await unread(customer.token)).toEqual(before);
    });
  });

  describe("reading", () => {
    it("marks a clicked notification as read, once", async () => {
      const customer = await newCustomer();
      const [welcome] = (await list(customer.token)).notifications;

      const first = notificationReadResponseSchema.parse(
        (await markRead(customer.token, welcome.id).expect(200)).body,
      );
      expect(first.notification).toMatchObject({ id: welcome.id, read: true });
      expect(first.notification.readAt).not.toBeNull();
      expect(first.unreadCount).toBe(0);

      // Clicking again keeps the first read time.
      const again = notificationReadResponseSchema.parse(
        (await markRead(customer.token, welcome.id).expect(200)).body,
      );
      expect(again.notification.readAt).toBe(first.notification.readAt);
      expect((await unread(customer.token)).unreadCount).toBe(0);
    });

    it("marks a notification as unread again", async () => {
      const customer = await newCustomer();
      const [welcome] = (await list(customer.token)).notifications;
      await markRead(customer.token, welcome.id).expect(200);

      const unreadAgain = notificationReadResponseSchema.parse(
        (await markUnread(customer.token, welcome.id).expect(200)).body,
      );
      expect(unreadAgain.notification).toMatchObject({
        id: welcome.id,
        read: false,
        readAt: null,
      });
      expect(unreadAgain.unreadCount).toBe(1);

      // Repeating is harmless, and it counts once.
      await markUnread(customer.token, welcome.id).expect(200);
      expect(await unread(customer.token)).toEqual({ unreadCount: 1, latestId: welcome.id });

      // Opening it again records a new read time.
      const reread = notificationReadResponseSchema.parse(
        (await markRead(customer.token, welcome.id).expect(200)).body,
      );
      expect(reread.notification.read).toBe(true);
      expect(reread.unreadCount).toBe(0);
    });

    it("deletes a notification for good", async () => {
      const customer = await newCustomer();
      await request(server())
        .put("/api/v1/users/me/email")
        .set(bearer(customer.token))
        .send({ newEmail: `delete-${Date.now()}@dinego.com`, currentPassword: PASSWORD })
        .expect(200);
      const [emailChanged, welcome] = (await list(customer.token)).notifications;

      const deleted = notificationDeleteResponseSchema.parse(
        (await remove(customer.token, emailChanged.id).expect(200)).body,
      );
      expect(deleted).toEqual({ unreadCount: 1 });

      const inbox = await list(customer.token);
      expect(inbox.notifications.map((item) => item.id)).toEqual([welcome.id]);
      expect(inbox.pagination.total).toBe(1);
      expect(await unread(customer.token)).toEqual({ unreadCount: 1, latestId: welcome.id });

      // Gone: deleting, reading, or un-reading it again is 404.
      for (const call of [remove, markRead, markUnread]) {
        const response = await call(customer.token, emailChanged.id).expect(404);
        expect(response.body).toMatchObject({ code: "NOTIFICATION_NOT_FOUND" });
      }

      // Deleting a read notification leaves the unread count alone.
      await markRead(customer.token, welcome.id).expect(200);
      expect((await remove(customer.token, welcome.id).expect(200)).body).toEqual({
        unreadCount: 0,
      });
      expect((await list(customer.token)).notifications).toEqual([]);
    });

    it("keeps every inbox private", async () => {
      const owner = await newCustomer();
      const stranger = await newCustomer();
      const [welcome] = (await list(owner.token)).notifications;

      for (const token of [stranger.token, staffTokens.ADMIN]) {
        for (const call of [markRead, markUnread, remove]) {
          const response = await call(token, welcome.id).expect(404);
          expect(apiErrorSchema.parse(response.body)).toMatchObject({
            code: "NOTIFICATION_NOT_FOUND",
            message: "Notification not found",
          });
        }
      }
      await markRead(owner.token, 999_999).expect(404);

      expect((await list(stranger.token)).notifications.map((item) => item.id)).not.toContain(
        welcome.id,
      );
      expect((await unread(owner.token)).unreadCount).toBe(1);
    });

    it("marks all as read up to the newest one the user saw", async () => {
      const customer = await newCustomer();
      await request(server())
        .put("/api/v1/users/me/email")
        .set(bearer(customer.token))
        .send({ newEmail: `seen-${Date.now()}@dinego.com`, currentPassword: PASSWORD })
        .expect(200);
      const seen = await unread(customer.token);
      expect(seen.unreadCount).toBe(2);

      // Arrives after the user looked at the list.
      const changed = await request(server())
        .put("/api/v1/users/me/password")
        .set(bearer(customer.token))
        .send({ currentPassword: PASSWORD, newPassword: "Changed123!" })
        .expect(200);
      const token = changed.body.accessToken as string;

      const partial = markAllNotificationsReadResponseSchema.parse(
        (await markAll(token, { upToId: seen.latestId! }).expect(200)).body,
      );
      expect(partial).toEqual({ updated: 2, unreadCount: 1 });
      expect((await list(token, "?unread=true")).notifications.map((item) => item.type)).toEqual([
        "PASSWORD_CHANGED",
      ]);

      // No body marks everything; repeating changes nothing.
      expect((await markAll(token).expect(200)).body).toEqual({ updated: 1, unreadCount: 0 });
      expect((await markAll(token, {}).expect(200)).body).toEqual({ updated: 0, unreadCount: 0 });
    });

    it("filters by read state and category, newest first, with paging", async () => {
      const customer = await newCustomer();
      await request(server())
        .put("/api/v1/users/me/email")
        .set(bearer(customer.token))
        .send({ newEmail: `filter-${Date.now()}@dinego.com`, currentPassword: PASSWORD })
        .expect(200);
      const all = await list(customer.token);
      expect(all.notifications.map((item) => item.type)).toEqual([
        "EMAIL_CHANGED",
        "CUSTOMER_WELCOME",
      ]);

      await markRead(customer.token, all.notifications[1].id).expect(200);

      const unreadOnly = await list(customer.token, "?unread=true");
      expect(unreadOnly.notifications.map((item) => item.type)).toEqual(["EMAIL_CHANGED"]);
      expect(unreadOnly.unreadCount).toBe(1);
      const readOnly = await list(customer.token, "?unread=false");
      expect(readOnly.notifications.map((item) => item.type)).toEqual(["CUSTOMER_WELCOME"]);
      // unreadCount covers the whole inbox, whatever the filter.
      expect(readOnly.unreadCount).toBe(1);

      expect((await list(customer.token, "?category=ACCOUNT")).pagination.total).toBe(2);
      expect((await list(customer.token, "?category=ORDER")).notifications).toEqual([]);

      const page2 = await list(customer.token, "?page=2&pageSize=1");
      expect(page2.pagination).toEqual({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
      expect(page2.notifications.map((item) => item.type)).toEqual(["CUSTOMER_WELCOME"]);
    });

    it("pages with a cursor that never skips items after a delete", async () => {
      const customer = await newCustomer();
      for (let change = 1; change <= 4; change += 1) {
        await request(server())
          .put("/api/v1/users/me/email")
          .set(bearer(customer.token))
          .send({
            newEmail: `cursor-${change}-${Date.now()}@dinego.com`,
            currentPassword: PASSWORD,
          })
          .expect(200);
      }
      // 5 notifications: 4 email changes and the welcome, newest first.
      const firstPage = await list(customer.token, "?pageSize=2");
      expect(firstPage.pagination.total).toBe(5);
      const [newest, second] = firstPage.notifications;

      // Deleting one that is already shown shifts page offsets; the cursor is unaffected.
      await remove(customer.token, newest.id).expect(200);
      const more = await list(customer.token, `?pageSize=2&beforeId=${second.id}`);
      const rest = await list(customer.token, `?pageSize=2&beforeId=${more.notifications[1].id}`);

      const loaded = [second, ...more.notifications, ...rest.notifications].map((item) => item.id);
      const all = (await list(customer.token)).notifications.map((item) => item.id);
      expect(loaded).toEqual(all);
      expect(all).toHaveLength(4);
      // The total ignores the cursor, so clients can tell whether more remain.
      expect(more.pagination.total).toBe(4);
      // 4 left after the delete: [second] + 2 more + the last one, the welcome.
      expect(more.notifications).toHaveLength(2);
      expect(rest.notifications.map((item) => item.type)).toEqual(["CUSTOMER_WELCOME"]);
    });

    it("filters by the record a notification is about", async () => {
      const customer = await newCustomer();
      const other = await newCustomer();

      const mine = await list(customer.token, `?entityType=USER&entityId=${customer.id}`);
      expect(mine.notifications.map((item) => [item.type, item.entityId])).toEqual([
        ["CUSTOMER_WELCOME", customer.id],
      ]);
      // Someone else's record shows nothing of theirs: inboxes stay private.
      expect(
        (await list(customer.token, `?entityType=USER&entityId=${other.id}`)).notifications,
      ).toEqual([]);
      expect(
        (await list(customer.token, `?entityType=ORDER&entityId=${customer.id}`)).notifications,
      ).toEqual([]);

      for (const query of [
        "?entityType=USER",
        `?entityId=${customer.id}`,
        "?entityType=MENU&entityId=1",
      ]) {
        const response = await request(server())
          .get(`/api/v1/notifications${query}`)
          .set(bearer(customer.token))
          .expect(400);
        expect(response.body).toMatchObject({ code: "VALIDATION_ERROR" });
      }
    });

    it("validates ids, queries, and bodies", async () => {
      const customer = await newCustomer();

      for (const id of ["abc", "0", "-1", "1.5"]) {
        for (const call of [markRead, markUnread, remove]) {
          const response = await call(customer.token, id).expect(400);
          expect(response.body).toMatchObject({ code: "VALIDATION_ERROR" });
        }
      }
      for (const query of [
        "?pageSize=51",
        "?unread=yes",
        "?category=account",
        "?sort=old",
        "?beforeId=0",
        "?beforeId=abc",
      ]) {
        const response = await request(server())
          .get(`/api/v1/notifications${query}`)
          .set(bearer(customer.token))
          .expect(400);
        expect(response.body).toMatchObject({ code: "VALIDATION_ERROR" });
      }
      for (const body of [{ upToId: 0 }, { upToId: "5" }, { everything: true }]) {
        const response = await markAll(customer.token, body).expect(400);
        expect(response.body).toMatchObject({ code: "VALIDATION_ERROR" });
      }
    });
  });

  describe("retention", () => {
    it("hides notifications older than 7 days and purges them", async () => {
      const customer = await newCustomer();
      await request(server())
        .put("/api/v1/users/me/email")
        .set(bearer(customer.token))
        .send({ newEmail: `old-${Date.now()}@dinego.com`, currentPassword: PASSWORD })
        .expect(200);
      const [recent, welcome] = (await list(customer.token)).notifications;

      await dataSource.query(
        `UPDATE "notifications" SET "created_at" = datetime('now', '-8 days') WHERE "id" = ?`,
        [welcome.id],
      );
      await dataSource.query(
        `UPDATE "notifications" SET "created_at" = datetime('now', '-6 days') WHERE "id" = ?`,
        [recent.id],
      );

      const inbox = await list(customer.token);
      expect(inbox.notifications.map((item) => item.id)).toEqual([recent.id]);
      expect(inbox.unreadCount).toBe(1);
      expect(await unread(customer.token)).toEqual({ unreadCount: 1, latestId: recent.id });
      await markRead(customer.token, welcome.id).expect(404);
      await markUnread(customer.token, welcome.id).expect(404);
      await remove(customer.token, welcome.id).expect(404);
      expect((await markAll(customer.token).expect(200)).body).toEqual({
        updated: 1,
        unreadCount: 0,
      });

      const purged = await app.get(NotificationRetention).purgeExpired();
      expect(purged).toBeGreaterThanOrEqual(1);
      const remaining: Array<{ id: number }> = await dataSource.query(
        `SELECT "id" FROM "notifications" WHERE "id" IN (?, ?)`,
        [welcome.id, recent.id],
      );
      expect(remaining).toEqual([{ id: recent.id }]);
    });
  });
});
