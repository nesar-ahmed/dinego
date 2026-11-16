import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import type { Repository } from "typeorm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { User } from "./entities/user.entity.js";
import { UsersService } from "./users.service.js";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    name: "Amina Rahman",
    email: "admin@dinego.com",
    phone: "+1 555 0100",
    passwordHash: null,
    pinHash: null,
    role: "ADMIN",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  } as User;
}

describe("UsersService", () => {
  let repository: {
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  let jwtService: { signAsync: ReturnType<typeof vi.fn> };
  let service: UsersService;

  beforeEach(() => {
    repository = {
      findOne: vi.fn(),
      create: vi.fn((input: Partial<User>) => input),
      save: vi.fn(),
      find: vi.fn(),
    };
    jwtService = {
      signAsync: vi.fn().mockResolvedValue("signed-token"),
    };

    service = new UsersService(
      repository as unknown as Repository<User>,
      jwtService as unknown as JwtService,
    );
  });

  it("registers a customer with the CUSTOMER role", async () => {
    const saved = makeUser({
      id: 9,
      name: "New Customer",
      email: "new@dinego.com",
      role: "CUSTOMER",
      passwordHash: "hashed",
    });

    repository.findOne.mockResolvedValue(null);
    repository.save.mockResolvedValue(saved);

    const result = await service.registerCustomer({
      name: "New Customer",
      email: "NEW@DINEGO.COM",
      phone: null,
      password: "Password123!",
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "new@dinego.com", role: "CUSTOMER" }),
    );
    expect(result.customer.email).toBe("new@dinego.com");
    expect(result.accessToken).toBe("signed-token");
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ type: "CUSTOMER", role: "CUSTOMER" }),
    );
  });

  it("rejects an admin login from a non-admin staff account", async () => {
    const passwordHash = await bcrypt.hash("Manager1234!", 4);

    repository.findOne.mockResolvedValue(
      makeUser({ role: "MANAGER", email: "manager@dinego.com", passwordHash }),
    );

    await expect(
      service.loginAdmin({ email: "manager@dinego.com", password: "Manager1234!" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects an unknown customer login", async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(
      service.loginCustomer({ email: "missing@dinego.com", password: "Password123!" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("returns a staff token for a valid admin login", async () => {
    const passwordHash = await bcrypt.hash("Admin1234!", 4);

    repository.findOne.mockResolvedValue(makeUser({ passwordHash }));

    const result = await service.loginAdmin({
      email: "ADMIN@DINEGO.COM",
      password: "Admin1234!",
    });

    expect(result.user.role).toBe("ADMIN");
    expect(result.accessToken).toBe("signed-token");
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ type: "STAFF", role: "ADMIN" }),
    );
  });
});
