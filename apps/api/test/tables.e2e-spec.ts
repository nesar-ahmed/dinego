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
  floorTablesResponseSchema,
  publicTablesResponseSchema,
  tableResponseSchema,
  type UserRole,
} from "@dinego/shared";
import { buildDataSourceOptions } from "../src/database/data-source.js";
import { seedMenu } from "../src/database/seeds/menu.seed.js";
import { floorPlan, seedTables } from "../src/database/seeds/tables.seed.js";
import { seedUsers, userAccounts } from "../src/database/seeds/users.seed.js";
import { createE2eApp, type ServerLogs } from "./support/e2e-app.js";

const account = (role: UserRole) => userAccounts.find((entry) => entry.role === role)!;

describe("Tables API (e2e)", () => {
  let app: INestApplication;
  let logs: ServerLogs;
  let dataSource: DataSource;
  let databaseDir: string;
  let originalDatabasePath: string | undefined;
  const tokens = {} as Record<UserRole, string>;

  const server = () => app.getHttpServer();
  const as = (role: UserRole) => ({ Authorization: `Bearer ${tokens[role]}` });
  const floor = (role: UserRole) => request(server()).get("/api/v1/floor/tables").set(as(role));
  const create = (role: UserRole, body: object) =>
    request(server()).post("/api/v1/floor/tables").set(as(role)).send(body);
  const update = (role: UserRole, id: number | string, body: object) =>
    request(server()).patch(`/api/v1/floor/tables/${id}`).set(as(role)).send(body);
  const setStatus = (role: UserRole, id: number, status: string) =>
    request(server()).patch(`/api/v1/floor/tables/${id}/status`).set(as(role)).send({ status });
  const remove = (role: UserRole, id: number) =>
    request(server()).delete(`/api/v1/floor/tables/${id}`).set(as(role));

  let labelCounter = 0;
  /** A fresh FREE table so each test owns its state. */
  const newTable = async (seats = 4) => {
    labelCounter += 1;
    const response = await create("MANAGER", { label: `E2E ${labelCounter}`, seats }).expect(201);
    return tableResponseSchema.parse(response.body).table;
  };

  beforeAll(async () => {
    originalDatabasePath = process.env.DATABASE_PATH;
    databaseDir = mkdtempSync(join(tmpdir(), "dinego-tables-e2e-"));
    process.env.DATABASE_PATH = join(databaseDir, "test.sqlite");

    dataSource = new DataSource(buildDataSourceOptions());
    await dataSource.initialize();
    await dataSource.runMigrations();
    await dataSource.transaction(async (manager) => {
      await seedUsers(manager);
      await seedMenu(manager);
      await seedTables(manager);
    });

    ({ app, logs } = await createE2eApp());

    for (const role of ["ADMIN", "MANAGER", "WAITER", "CASHIER", "KITCHEN", "CUSTOMER"] as const) {
      const { email, password } = account(role);
      const response = await request(server())
        .post("/api/v1/users/session-login")
        .send({ email, password })
        .expect(200);
      tokens[role] = response.body.accessToken;
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

  describe("public list", () => {
    it("lists active tables in natural order without the floor status, no login needed", async () => {
      const response = await request(server()).get("/api/v1/tables").expect(200);
      const { tables } = publicTablesResponseSchema.parse(response.body);

      expect(tables.slice(0, floorPlan.length).map((table) => table.label)).toEqual(
        floorPlan.map((entry) => entry.label),
      );
      expect(tables[0]).toEqual({
        id: expect.any(Number),
        label: "T1",
        seats: 4,
        zone: "Window",
        orderable: true,
      });
      expect(tables[0]).not.toHaveProperty("status");
      expect(floorPlan.reduce((sum, entry) => sum + entry.seats, 0)).toBe(48);
    });

    it("marks reserved, cleaning, and bill-requested tables as not orderable, and hides inactive ones", async () => {
      const reserved = await newTable();
      const occupied = await newTable();
      const inactive = await newTable();
      await setStatus("WAITER", reserved.id, "RESERVED").expect(200);
      await setStatus("WAITER", occupied.id, "OCCUPIED").expect(200);
      await update("MANAGER", inactive.id, { active: false }).expect(200);

      const { tables } = publicTablesResponseSchema.parse(
        (await request(server()).get("/api/v1/tables").expect(200)).body,
      );
      const byId = new Map(tables.map((table) => [table.id, table]));

      expect(byId.get(reserved.id)?.orderable).toBe(false);
      expect(byId.get(occupied.id)?.orderable).toBe(true);
      expect(byId.has(inactive.id)).toBe(false);
    });
  });

  describe("access", () => {
    it("requires staff for the floor view and admin or manager for layout changes", async () => {
      await request(server()).get("/api/v1/floor/tables").expect(401);
      await floor("CUSTOMER").expect(403);
      await floor("KITCHEN").expect(403);

      for (const role of ["ADMIN", "MANAGER", "WAITER", "CASHIER"] as const) {
        const { tables } = floorTablesResponseSchema.parse((await floor(role).expect(200)).body);
        expect(tables.length).toBeGreaterThanOrEqual(floorPlan.length);
      }

      const table = await newTable();
      await create("WAITER", { label: "Nope", seats: 2 }).expect(403);
      await update("CASHIER", table.id, { seats: 6 }).expect(403);
      await remove("WAITER", table.id).expect(403);
      await setStatus("CUSTOMER", table.id, "OCCUPIED").expect(403);
      await setStatus("KITCHEN", table.id, "OCCUPIED").expect(403);
      await setStatus("CASHIER", table.id, "OCCUPIED").expect(200);
    });
  });

  describe("layout", () => {
    it("creates FREE, active tables and rejects duplicate labels regardless of case", async () => {
      const response = await create("ADMIN", { label: "Patio 1", seats: 2, zone: "Patio" }).expect(
        201,
      );
      expect(tableResponseSchema.parse(response.body).table).toMatchObject({
        label: "Patio 1",
        seats: 2,
        zone: "Patio",
        status: "FREE",
        active: true,
      });

      for (const label of ["Patio 1", "patio 1", "PATIO 1"]) {
        const duplicate = await create("ADMIN", { label, seats: 2 }).expect(409);
        expect(duplicate.body).toMatchObject({ statusCode: 409, code: "TABLE_LABEL_TAKEN" });
      }
    });

    it("edits details and refuses to rename onto another label", async () => {
      const table = await newTable();

      const edited = await update("MANAGER", table.id, { seats: 6, zone: "Terrace" }).expect(200);
      expect(edited.body.table).toMatchObject({ seats: 6, zone: "Terrace", label: table.label });
      expect(
        (await update("MANAGER", table.id, { zone: "" }).expect(200)).body.table.zone,
      ).toBeNull();

      // Renaming to its own label in another case is allowed.
      await update("MANAGER", table.id, { label: table.label.toLowerCase() }).expect(200);
      const taken = await update("MANAGER", table.id, { label: "t1" }).expect(409);
      expect(taken.body).toMatchObject({ code: "TABLE_LABEL_TAKEN" });
    });

    it("only takes FREE tables out of service, and inactive tables cannot change status", async () => {
      const table = await newTable();
      await setStatus("WAITER", table.id, "OCCUPIED").expect(200);

      const busy = await update("MANAGER", table.id, { active: false }).expect(409);
      expect(busy.body).toMatchObject({ code: "TABLE_IN_USE" });
      // A combined edit is refused as a whole.
      await update("MANAGER", table.id, { seats: 8, active: false }).expect(409);
      expect(
        (
          await request(server())
            .get(`/api/v1/floor/tables/${table.id}`)
            .set(as("WAITER"))
            .expect(200)
        ).body.table.seats,
      ).toBe(4);

      await setStatus("WAITER", table.id, "FREE").expect(200);
      await update("MANAGER", table.id, { active: false }).expect(200);

      const inactive = await setStatus("WAITER", table.id, "OCCUPIED").expect(409);
      expect(inactive.body).toMatchObject({ code: "TABLE_INACTIVE" });

      await update("MANAGER", table.id, { active: true }).expect(200);
      await setStatus("WAITER", table.id, "OCCUPIED").expect(200);
    });

    it("deletes only FREE tables", async () => {
      const table = await newTable();
      await setStatus("WAITER", table.id, "CLEANING").expect(200);

      const busy = await remove("ADMIN", table.id).expect(409);
      expect(busy.body).toMatchObject({ code: "TABLE_IN_USE" });

      await setStatus("WAITER", table.id, "FREE").expect(200);
      await remove("ADMIN", table.id).expect(204);
      await remove("ADMIN", table.id).expect(404);
      const missing = await request(server())
        .get(`/api/v1/floor/tables/${table.id}`)
        .set(as("ADMIN"))
        .expect(404);
      expect(missing.body).toMatchObject({ code: "TABLE_NOT_FOUND" });
    });
  });

  describe("history", () => {
    it("refuses to delete a table with order history, even without a payment", async () => {
      const table = await newTable();
      // A staff-entered order (no customer payment) referencing the table.
      await dataSource.query(
        `INSERT INTO "orders" ("order_no", "type", "status", "table_id", "subtotal_cents",
           "tax_cents", "tip_cents", "total_cents")
         VALUES (?, 'DINE_IN', 'CLOSED', ?, 0, 0, 0, 0)`,
        [`HIST-${table.id}`, table.id],
      );

      const response = await remove("ADMIN", table.id).expect(409);
      expect(response.body).toMatchObject({
        code: "TABLE_IN_USE",
        message: expect.stringContaining("order or payment history"),
      });
      await update("MANAGER", table.id, { active: false }).expect(200);
    });
  });

  describe("status", () => {
    it("follows the floor flow and treats a repeated status as a no-op", async () => {
      const table = await newTable();

      for (const status of [
        "OCCUPIED",
        "BILL_REQUESTED",
        "CLEANING",
        "FREE",
        "RESERVED",
        "OCCUPIED",
      ]) {
        const response = await setStatus("WAITER", table.id, status).expect(200);
        expect(response.body.table.status).toBe(status);
      }

      // Backdate, so a rewritten timestamp would be visible despite 1-second resolution.
      await dataSource.query(
        `UPDATE "dining_tables" SET "updated_at" = '2026-01-01 00:00:00' WHERE "id" = ?`,
        [table.id],
      );
      const again = (await setStatus("WAITER", table.id, "OCCUPIED").expect(200)).body.table;
      expect(again.updatedAt).toBe("2026-01-01T00:00:00.000Z");
      const changed = (await setStatus("WAITER", table.id, "FREE").expect(200)).body.table;
      expect(changed.updatedAt).not.toBe("2026-01-01T00:00:00.000Z");
    });

    it("rejects transitions outside the flow", async () => {
      const table = await newTable();
      await setStatus("WAITER", table.id, "CLEANING").expect(200);

      const invalid = await setStatus("WAITER", table.id, "OCCUPIED").expect(409);
      expect(invalid.body).toMatchObject({
        statusCode: 409,
        code: "INVALID_STATUS_TRANSITION",
        message: expect.stringContaining("CLEANING to OCCUPIED"),
      });
      await setStatus("WAITER", 999_999, "FREE").expect(404);
    });

    it("applies simultaneous seatings consistently", async () => {
      const table = await newTable();
      // Two waiters seat the same table while a third marks it reserved.
      const responses = await Promise.all([
        setStatus("WAITER", table.id, "OCCUPIED"),
        setStatus("CASHIER", table.id, "OCCUPIED"),
        setStatus("MANAGER", table.id, "RESERVED"),
      ]);

      expect(
        responses.every((response) => response.status === 200 || response.status === 409),
      ).toBe(true);
      const final = (
        await request(server())
          .get(`/api/v1/floor/tables/${table.id}`)
          .set(as("WAITER"))
          .expect(200)
      ).body.table;
      expect(["OCCUPIED", "RESERVED"]).toContain(final.status);
    });
  });

  describe("validation", () => {
    it.each([
      ["missing seats", { label: "V1" }],
      ["zero seats", { label: "V1", seats: 0 }],
      ["too many seats", { label: "V1", seats: 51 }],
      ["blank label", { label: "  ", seats: 2 }],
      ["client-set status", { label: "V1", seats: 2, status: "OCCUPIED" }],
    ])("rejects a create with %s", async (_label, body) => {
      const response = await create("ADMIN", body).expect(400);
      expect(apiErrorSchema.parse(response.body)).toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("rejects bad ids, empty updates, and unknown statuses", async () => {
      await update("ADMIN", "abc", { seats: 2 }).expect(400);
      await update("ADMIN", 1, {}).expect(400);
      await setStatus("WAITER", 1, "DIRTY").expect(400);
    });
  });
});
