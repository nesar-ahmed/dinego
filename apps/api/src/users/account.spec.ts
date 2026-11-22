import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import {
  changeEmailSchema,
  changePasswordSchema,
  customerRegisterSchema,
  updateProfileSchema,
  type TokenPayload,
  type UserRole,
} from "@dinego/shared";
import { describe, expect, it, vi } from "vitest";
import { JwtAuthGuard, type AuthenticatedRequest } from "./guards/jwt-auth.guard.js";
import type { UsersService } from "./users.service.js";

const messages = (result: {
  success: boolean;
  error?: { issues: Array<{ path: PropertyKey[]; message: string }> };
}) =>
  result.success
    ? []
    : result.error!.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);

describe("account request schemas", () => {
  it("updates name and phone only, with at least one field", () => {
    expect(updateProfileSchema.parse({ name: "  Sofia A.  " })).toEqual({ name: "Sofia A." });
    expect(updateProfileSchema.parse({ phone: " +1 555 0200 " })).toEqual({ phone: "+1 555 0200" });
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
    expect(updateProfileSchema.safeParse({ email: "x@y.z" }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ password: "Password123!" }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ name: "S" }).success).toBe(false);
  });

  it("treats an empty or null phone as removing it", () => {
    for (const phone of [null, "", "   "]) {
      expect(updateProfileSchema.parse({ phone })).toEqual({ phone: null });
    }
    expect(messages(updateProfileSchema.safeParse({ phone: "123" }))).toEqual([
      "phone: Enter at least 6 characters, or leave it empty to remove it",
    ]);
  });

  it("normalizes the new email and requires the current password", () => {
    expect(
      changeEmailSchema.parse({ newEmail: " New@Example.COM ", currentPassword: "x" }),
    ).toEqual({
      newEmail: "new@example.com",
      currentPassword: "x",
    });
    expect(
      changeEmailSchema.safeParse({ newEmail: "not-an-email", currentPassword: "x" }).success,
    ).toBe(false);
    expect(
      messages(changeEmailSchema.safeParse({ newEmail: "a@b.co", currentPassword: "" })),
    ).toEqual(["currentPassword: Enter your current password"]);
  });

  it("requires a new password that is valid and different", () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: "Old12345!", newPassword: "New12345!" })
        .success,
    ).toBe(true);
    expect(
      messages(
        changePasswordSchema.safeParse({ currentPassword: "Same1234!", newPassword: "Same1234!" }),
      ),
    ).toEqual(["newPassword: Choose a password that is different from your current one"]);
    expect(
      changePasswordSchema.safeParse({ currentPassword: "Old12345!", newPassword: "short" })
        .success,
    ).toBe(false);
    expect(changePasswordSchema.safeParse({ newPassword: "New12345!" }).success).toBe(false);
  });

  it("keeps registration rules unchanged", () => {
    expect(
      customerRegisterSchema.parse({ name: " Sam ", email: "s@x.io", password: "Password1!" }),
    ).toEqual({
      name: "Sam",
      email: "s@x.io",
      password: "Password1!",
    });
    expect(
      customerRegisterSchema.safeParse({
        name: "Sam",
        email: "s@x.io",
        phone: "123",
        password: "Password1!",
      }).success,
    ).toBe(false);
  });
});

describe("JwtAuthGuard session checks", () => {
  function setup(
    payload: TokenPayload,
    user: { role: UserRole; active: boolean; tokenVersion: number } | null,
  ) {
    const request = {
      headers: { authorization: "Bearer token" },
      cookies: {},
    } as unknown as AuthenticatedRequest;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const jwtService = { verifyAsync: vi.fn().mockResolvedValue(payload) } as unknown as JwtService;
    const usersService = {
      findSessionUser: vi.fn().mockResolvedValue(user ? { id: payload.sub, ...user } : null),
    } as unknown as UsersService;

    return { guard: new JwtAuthGuard(jwtService, usersService), context, request };
  }

  const customer = { sub: 6, type: "CUSTOMER", role: "CUSTOMER" } as const;

  it("accepts a current token and takes the role from the database", async () => {
    const { guard, context, request } = setup(
      { sub: 3, type: "STAFF", role: "WAITER", ver: 2 },
      { role: "MANAGER", active: true, tokenVersion: 2 },
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.auth).toMatchObject({ sub: 3, role: "MANAGER" });
  });

  it("treats tokens issued before session versioning as version 0", async () => {
    const fresh = setup(customer, { role: "CUSTOMER", active: true, tokenVersion: 0 });
    await expect(fresh.guard.canActivate(fresh.context)).resolves.toBe(true);

    const changed = setup(customer, { role: "CUSTOMER", active: true, tokenVersion: 1 });
    await expect(changed.guard.canActivate(changed.context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it.each([
    [
      "an older session version",
      { ...customer, ver: 1 },
      { role: "CUSTOMER", active: true, tokenVersion: 2 },
    ],
    [
      "a deactivated account",
      { ...customer, ver: 0 },
      { role: "CUSTOMER", active: false, tokenVersion: 0 },
    ],
    ["a deleted account", { ...customer, ver: 0 }, null],
    [
      "a customer token for a staff account",
      { ...customer, ver: 0 },
      { role: "WAITER", active: true, tokenVersion: 0 },
    ],
    [
      "a staff token for a customer account",
      { sub: 6, type: "STAFF", role: "ADMIN", ver: 0 },
      { role: "CUSTOMER", active: true, tokenVersion: 0 },
    ],
  ] as const)("rejects %s", async (_label, payload, user) => {
    const { guard, context } = setup(payload as TokenPayload, user as never);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
