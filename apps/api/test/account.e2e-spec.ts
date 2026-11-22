import "reflect-metadata";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import request from "supertest";
import { DataSource } from "typeorm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  apiErrorSchema,
  customerAuthResponseSchema,
  customerResponseSchema,
  type UserRole,
} from "@dinego/shared";
import { buildDataSourceOptions } from "../src/database/data-source.js";
import { seedTables } from "../src/database/seeds/tables.seed.js";
import { seedUsers, userAccounts } from "../src/database/seeds/users.seed.js";
import { createE2eApp, type ServerLogs } from "./support/e2e-app.js";

const account = (role: UserRole) => userAccounts.find((entry) => entry.role === role)!;
const PASSWORD = "Password123!";

describe("Customer account API (e2e)", () => {
  let app: INestApplication;
  let logs: ServerLogs;
  let dataSource: DataSource;
  let databaseDir: string;
  let originalDatabasePath: string | undefined;

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  let counter = 0;
  /** A fresh customer per test, so email and password changes never collide. */
  const newCustomer = async () => {
    counter += 1;
    const email = `account-${counter}-${Date.now()}@dinego.com`;
    const response = await request(server())
      .post("/api/v1/users/register")
      .send({
        name: `Account Customer ${counter}`,
        email,
        phone: "+1 555 0300",
        password: PASSWORD,
      })
      .expect(201);
    return {
      token: response.body.accessToken as string,
      id: response.body.customer.id as number,
      email,
    };
  };

  const login = (email: string, password: string) =>
    request(server()).post("/api/v1/users/session-login").send({ email, password });
  const me = (token: string) => request(server()).get("/api/v1/users/me").set(bearer(token));
  const patchProfile = (token: string, body: object) =>
    request(server()).patch("/api/v1/users/me/profile").set(bearer(token)).send(body);
  const putEmail = (token: string, body: object) =>
    request(server()).put("/api/v1/users/me/email").set(bearer(token)).send(body);
  const putPassword = (token: string, body: object) =>
    request(server()).put("/api/v1/users/me/password").set(bearer(token)).send(body);
  const staffToken = async (role: UserRole) => {
    const { email, password } = account(role);
    return (await login(email, password).expect(200)).body.accessToken as string;
  };

  beforeAll(async () => {
    originalDatabasePath = process.env.DATABASE_PATH;
    databaseDir = mkdtempSync(join(tmpdir(), "dinego-account-e2e-"));
    process.env.DATABASE_PATH = join(databaseDir, "test.sqlite");

    dataSource = new DataSource(buildDataSourceOptions());
    await dataSource.initialize();
    await dataSource.runMigrations();
    await dataSource.transaction(async (manager) => {
      await seedUsers(manager);
      await seedTables(manager);
    });

    ({ app, logs } = await createE2eApp());
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
    it("is for signed-in customers only", async () => {
      await request(server()).patch("/api/v1/users/me/profile").send({ name: "Nope" }).expect(401);
      await request(server()).put("/api/v1/users/me/email").send({}).expect(401);
      await request(server()).put("/api/v1/users/me/password").send({}).expect(401);

      const admin = await staffToken("ADMIN");
      const forbidden = await patchProfile(admin, { name: "Admin Renamed" }).expect(403);
      expect(forbidden.body).toMatchObject({ code: "CUSTOMER_ONLY" });
      await putEmail(admin, {
        newEmail: "new-admin@dinego.com",
        currentPassword: account("ADMIN").password,
      }).expect(403);
      await putPassword(admin, {
        currentPassword: account("ADMIN").password,
        newPassword: "Another123!",
      }).expect(403);
    });
  });

  describe("profile", () => {
    it("updates name and phone, and removes the phone with null or an empty value", async () => {
      const { token } = await newCustomer();

      const renamed = customerResponseSchema.parse(
        (
          await patchProfile(token, {
            name: "  Sofia Renamed  ",
            phone: "+44 20 7946 0000",
          }).expect(200)
        ).body,
      );
      expect(renamed.customer).toMatchObject({ name: "Sofia Renamed", phone: "+44 20 7946 0000" });
      expect((await me(token).expect(200)).body.customer).toMatchObject({ name: "Sofia Renamed" });

      expect(
        (await patchProfile(token, { phone: null }).expect(200)).body.customer.phone,
      ).toBeNull();
      await patchProfile(token, { phone: "+1 555 0400" }).expect(200);
      expect((await patchProfile(token, { phone: "" }).expect(200)).body.customer.phone).toBeNull();
      // Name was not touched by the phone-only updates.
      expect((await me(token).expect(200)).body.customer.name).toBe("Sofia Renamed");
    });

    it.each([
      ["an empty body", {}],
      ["a one-letter name", { name: "S" }],
      ["a short phone", { phone: "123" }],
      ["an email (separate endpoint)", { email: "x@dinego.com" }],
      ["a password (separate endpoint)", { password: "Password999!" }],
    ])("rejects %s", async (_label, body) => {
      const { token } = await newCustomer();
      const response = await patchProfile(token, body).expect(400);
      expect(apiErrorSchema.parse(response.body)).toMatchObject({ code: "VALIDATION_ERROR" });
    });
  });

  describe("email", () => {
    it("changes the sign-in email after checking the password, without signing out", async () => {
      const customer = await newCustomer();
      const newEmail = `changed-${Date.now()}@example.com`;

      const response = await putEmail(customer.token, {
        newEmail: `  ${newEmail.toUpperCase()} `,
        currentPassword: PASSWORD,
      }).expect(200);
      expect(customerResponseSchema.parse(response.body).customer.email).toBe(newEmail);

      await login(newEmail, PASSWORD).expect(200);
      await login(customer.email, PASSWORD).expect(401);
      // Changing the email keeps existing sessions.
      expect((await me(customer.token).expect(200)).body.customer.email).toBe(newEmail);

      // The old address is free again.
      await request(server())
        .post("/api/v1/users/register")
        .send({ name: "Newcomer", email: customer.email, password: PASSWORD })
        .expect(201);
    });

    it("refuses a wrong current password with a field error", async () => {
      const customer = await newCustomer();
      const response = await putEmail(customer.token, {
        newEmail: `never-${Date.now()}@example.com`,
        currentPassword: "WrongPassword1!",
      }).expect(400);

      expect(apiErrorSchema.parse(response.body)).toMatchObject({
        code: "INVALID_CURRENT_PASSWORD",
        details: [{ path: "currentPassword", message: "Your current password is incorrect" }],
      });
      expect((await me(customer.token).expect(200)).body.customer.email).toBe(customer.email);
    });

    it("refuses an email that another customer or a staff member uses, in any case", async () => {
      const customer = await newCustomer();

      for (const taken of [account("CUSTOMER").email.toUpperCase(), account("ADMIN").email]) {
        const response = await putEmail(customer.token, {
          newEmail: taken,
          currentPassword: PASSWORD,
        }).expect(409);
        expect(response.body).toMatchObject({
          code: "EMAIL_TAKEN",
          details: [{ path: "newEmail" }],
        });
      }
    });

    it("refuses the current email", async () => {
      const customer = await newCustomer();
      const response = await putEmail(customer.token, {
        newEmail: customer.email,
        currentPassword: PASSWORD,
      }).expect(400);
      expect(response.body).toMatchObject({
        code: "VALIDATION_ERROR",
        details: [{ path: "newEmail" }],
      });
    });

    it("gives a contested email to exactly one of two simultaneous requests", async () => {
      const first = await newCustomer();
      const second = await newCustomer();
      const contested = `contested-${Date.now()}@example.com`;

      const responses = await Promise.all([
        putEmail(first.token, { newEmail: contested, currentPassword: PASSWORD }),
        putEmail(second.token, { newEmail: contested, currentPassword: PASSWORD }),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
      expect(responses.find((response) => response.status === 409)?.body.code).toBe("EMAIL_TAKEN");
      const [{ owners }] = await dataSource.query(
        `SELECT COUNT(*) AS owners FROM "users" WHERE "email" = ?`,
        [contested],
      );
      expect(owners).toBe(1);
    });

    it.each([
      ["an invalid email", { newEmail: "not-an-email", currentPassword: PASSWORD }],
      ["no current password", { newEmail: "x@example.com" }],
      ["an unknown field", { newEmail: "x@example.com", currentPassword: PASSWORD, name: "X" }],
    ])("rejects %s", async (_label, body) => {
      const { token } = await newCustomer();
      expect((await putEmail(token, body).expect(400)).body.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("password", () => {
    it("changes the password, keeps this device signed in, and signs out every other session", async () => {
      const customer = await newCustomer();
      const otherDevice = (await login(customer.email, PASSWORD).expect(200)).body
        .accessToken as string;
      const cookieDevice = request.agent(server());
      await cookieDevice
        .post("/api/v1/users/login")
        .send({ email: customer.email, password: PASSWORD })
        .expect(200);
      await cookieDevice.get("/api/v1/users/me").expect(200);

      const changer = request.agent(server());
      await changer
        .post("/api/v1/users/login")
        .send({ email: customer.email, password: PASSWORD })
        .expect(200);
      const response = await changer
        .put("/api/v1/users/me/password")
        .send({ currentPassword: PASSWORD, newPassword: "BrandNew456!" })
        .expect(200);

      const result = customerAuthResponseSchema.parse(response.body);
      expect(result.customer.email).toBe(customer.email);
      expect(response.headers["set-cookie"]?.[0]).toMatch(/^dinego_access_token=.+HttpOnly/);

      // This device: the replaced cookie and the returned token both work.
      await changer.get("/api/v1/users/me").expect(200);
      await me(result.accessToken).expect(200);

      // Every session from before the change is signed out, on every endpoint.
      for (const token of [customer.token, otherDevice]) {
        const ended = await me(token).expect(401);
        expect(ended.body.message).toBe("Your session has ended. Please sign in again.");
        await request(server()).get("/api/v1/cart").set(bearer(token)).expect(401);
        await request(server()).get("/api/v1/orders").set(bearer(token)).expect(401);
      }
      await cookieDevice.get("/api/v1/users/me").expect(401);

      await login(customer.email, PASSWORD).expect(401);
      await login(customer.email, "BrandNew456!").expect(200);
    });

    it("refuses a wrong current password and leaves everything as it was", async () => {
      const customer = await newCustomer();
      const response = await putPassword(customer.token, {
        currentPassword: "WrongPassword1!",
        newPassword: "BrandNew456!",
      }).expect(400);

      expect(response.body).toMatchObject({
        code: "INVALID_CURRENT_PASSWORD",
        details: [{ path: "currentPassword" }],
      });
      await me(customer.token).expect(200);
      await login(customer.email, PASSWORD).expect(200);
    });

    it.each([
      ["the same password", { currentPassword: PASSWORD, newPassword: PASSWORD }, "newPassword"],
      ["a short password", { currentPassword: PASSWORD, newPassword: "short" }, "newPassword"],
      ["no current password", { newPassword: "BrandNew456!" }, "currentPassword"],
    ])("rejects %s", async (_label, body, path) => {
      const { token } = await newCustomer();
      const response = await putPassword(token, body).expect(400);
      expect(response.body).toMatchObject({ code: "VALIDATION_ERROR" });
      expect(response.body.details.map((detail: { path: string }) => detail.path)).toContain(path);
    });

    it("lets only one of two simultaneous password changes win", async () => {
      const customer = await newCustomer();

      const responses = await Promise.all([
        putPassword(customer.token, { currentPassword: PASSWORD, newPassword: "FirstNew123!" }),
        putPassword(customer.token, { currentPassword: PASSWORD, newPassword: "SecondNew123!" }),
      ]);

      expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
      const loser = responses.find((response) => response.status !== 200)!;
      expect(["CREDENTIALS_CHANGED", "INVALID_CURRENT_PASSWORD"]).toContain(loser.body.code);

      const logins = await Promise.all([
        login(customer.email, "FirstNew123!"),
        login(customer.email, "SecondNew123!"),
      ]);
      expect(logins.map((response) => response.status).sort()).toEqual([200, 401]);
    });
  });

  describe("sessions across the API", () => {
    it("accepts tokens issued before session versioning until the password changes", async () => {
      const customer = await newCustomer();
      const legacy = await app
        .get(JwtService)
        .signAsync({ sub: customer.id, type: "CUSTOMER", role: "CUSTOMER" });

      await me(legacy).expect(200);
      await putPassword(customer.token, {
        currentPassword: PASSWORD,
        newPassword: "BrandNew456!",
      }).expect(200);
      await me(legacy).expect(401);
    });

    it("signs out deactivated staff immediately", async () => {
      const token = await staffToken("WAITER");
      const waiter = account("WAITER").email;
      await request(server()).get("/api/v1/floor/tables").set(bearer(token)).expect(200);

      await dataSource.query(`UPDATE "users" SET "active" = 0 WHERE "email" = ?`, [waiter]);
      try {
        await request(server()).get("/api/v1/floor/tables").set(bearer(token)).expect(401);
        await request(server())
          .patch("/api/v1/floor/tables/1/status")
          .set(bearer(token))
          .send({ status: "FREE" })
          .expect(401);
      } finally {
        await dataSource.query(`UPDATE "users" SET "active" = 1 WHERE "email" = ?`, [waiter]);
      }
      await request(server()).get("/api/v1/floor/tables").set(bearer(token)).expect(200);
    });

    it("applies a staff role change immediately", async () => {
      const token = await staffToken("MANAGER");
      const manager = account("MANAGER").email;
      const create = (label: string) =>
        request(server()).post("/api/v1/floor/tables").set(bearer(token)).send({ label, seats: 2 });

      await create(`Role ${Date.now()}`).expect(201);
      await dataSource.query(`UPDATE "users" SET "role" = 'WAITER' WHERE "email" = ?`, [manager]);
      try {
        await create(`Role ${Date.now()}-2`).expect(403);
      } finally {
        await dataSource.query(`UPDATE "users" SET "role" = 'MANAGER' WHERE "email" = ?`, [
          manager,
        ]);
      }
    });

    it("refuses a customer token once the account is no longer a customer", async () => {
      const customer = await newCustomer();
      await dataSource.query(`UPDATE "users" SET "role" = 'WAITER' WHERE "id" = ?`, [customer.id]);
      await me(customer.token).expect(401);
    });
  });
});
