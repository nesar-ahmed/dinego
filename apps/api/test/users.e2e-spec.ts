import "reflect-metadata";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DataSource } from "typeorm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildDataSourceOptions } from "../src/database/data-source.js";
import { seedUsers, userAccounts } from "../src/database/seeds/users.seed.js";
import { createE2eApp, type ServerLogs } from "./support/e2e-app.js";

const adminAccount = userAccounts.find((account) => account.role === "ADMIN");
const customerAccounts = userAccounts.filter((account) => account.role === "CUSTOMER");
const customerAccount = customerAccounts[0];
const secondCustomerAccount = customerAccounts[1];

if (!adminAccount || !customerAccount || !secondCustomerAccount) {
  throw new Error("E2E seed accounts are incomplete");
}

describe("Users API (e2e)", () => {
  let app: INestApplication;
  let logs: ServerLogs;
  let databaseDir: string;
  let originalDatabasePath: string | undefined;
  let originalJwtSecret: string | undefined;

  beforeAll(async () => {
    originalDatabasePath = process.env.DATABASE_PATH;
    originalJwtSecret = process.env.JWT_SECRET;
    databaseDir = mkdtempSync(join(tmpdir(), "dinego-e2e-"));
    process.env.DATABASE_PATH = join(databaseDir, "test.sqlite");
    process.env.JWT_SECRET = "dinego-e2e-secret";

    const dataSource = new DataSource(buildDataSourceOptions());
    await dataSource.initialize();

    try {
      await dataSource.runMigrations();
      await dataSource.transaction(async (manager) => {
        await seedUsers(manager);
      });
    } finally {
      await dataSource.destroy();
    }

    ({ app, logs } = await createE2eApp());
  });

  afterEach(() => {
    logs.assertNoUnexpectedErrors();
  });

  afterAll(async () => {
    await app?.close();
    rmSync(databaseDir, { recursive: true, force: true });

    if (originalDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = originalDatabasePath;
    }

    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  });

  it("reports API and database health", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/health").expect(200);

    expect(response.body).toMatchObject({ status: "ok", database: "up" });
  });

  it("authenticates customer and admin requests with the HttpOnly cookie", async () => {
    const agent = request.agent(app.getHttpServer());

    const customerLogin = await agent
      .post("/api/v1/users/login")
      .send({ email: customerAccount.email, password: customerAccount.password })
      .expect(200);

    const customerCookies = customerLogin.headers["set-cookie"] as unknown as string[];
    expect(customerCookies.join(";")).toContain("dinego_access_token=");
    expect(customerCookies.join(";").toLowerCase()).toContain("httponly");

    const customerMe = await agent.get("/api/v1/users/me").expect(200);
    expect(customerMe.body.type).toBe("CUSTOMER");
    expect(customerMe.body.customer.email).toBe(customerAccount.email);

    await agent.get("/api/v1/users").expect(403);

    const adminLogin = await agent
      .post("/api/v1/users/admin/login")
      .send({ email: adminAccount.email, password: adminAccount.password })
      .expect(200);
    expect(adminLogin.body.user.role).toBe("ADMIN");

    const staff = await agent.get("/api/v1/users").expect(200);
    expect(staff.body.users.length).toBeGreaterThanOrEqual(5);
    expect(staff.body.users.some((user: { role: string }) => user.role === "CUSTOMER")).toBe(false);

    const customers = await agent.get("/api/v1/users/customers").expect(200);
    expect(customers.body.customers.length).toBeGreaterThanOrEqual(2);

    await agent.post("/api/v1/users/logout").expect(200);
    await agent.get("/api/v1/users/me").expect(401);
  });

  it("registers a new customer and signs them in with the cookie", async () => {
    const agent = request.agent(app.getHttpServer());
    const email = `e2e-${Date.now()}@dinego.com`;

    const registration = await agent
      .post("/api/v1/users/register")
      .send({ name: "E2E Customer", email, password: "Password123!" })
      .expect(201);

    expect(registration.body.customer).toMatchObject({ name: "E2E Customer", email });

    const me = await agent.get("/api/v1/users/me").expect(200);
    expect(me.body.type).toBe("CUSTOMER");
    expect(me.body.customer.email).toBe(email);
  });

  it("logs in customers and staff through the unified session endpoint", async () => {
    const customer = await request(app.getHttpServer())
      .post("/api/v1/users/session-login")
      .send({ email: customerAccount.email, password: customerAccount.password })
      .expect(200);

    expect(customer.body.customer.email).toBe(customerAccount.email);
    expect(customer.body.user).toBeUndefined();

    const admin = await request(app.getHttpServer())
      .post("/api/v1/users/session-login")
      .send({ email: adminAccount.email, password: adminAccount.password })
      .expect(200);

    expect(admin.body.user.role).toBe("ADMIN");
    expect(admin.body.customer).toBeUndefined();
  });

  it("issues an OAuth2 password-flow token for the Swagger login form", async () => {
    const tokenResponse = await request(app.getHttpServer())
      .post("/api/v1/users/swagger-login")
      .type("form")
      .send({
        username: adminAccount.email,
        password: adminAccount.password,
        grant_type: "password",
      })
      .expect(200);

    expect(tokenResponse.body).toMatchObject({ token_type: "Bearer", scope: "api" });
    expect(typeof tokenResponse.body.access_token).toBe("string");

    const staff = await request(app.getHttpServer())
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${tokenResponse.body.access_token}`)
      .expect(200);

    expect(staff.body.users.length).toBeGreaterThanOrEqual(5);
  });

  it("accepts a Bearer token as an alternative to the cookie", async () => {
    const login = await request(app.getHttpServer())
      .post("/api/v1/users/login")
      .send({ email: secondCustomerAccount.email, password: secondCustomerAccount.password })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(response.body.type).toBe("CUSTOMER");
  });
});
