import bcrypt from "bcryptjs";
import type { EntityManager } from "typeorm";
import type { UserRole } from "@dinego/shared";
import { User } from "../../users/entities/user.entity.js";

export const userAccounts: Array<{
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  password: string;
  pin?: string;
}> = [
  {
    name: "Amina Rahman",
    email: "admin@dinego.com",
    phone: "+1 555 0100",
    role: "ADMIN",
    password: "Admin1234!",
    pin: "1000",
  },
  {
    name: "Marco Silva",
    email: "manager@dinego.com",
    phone: "+1 555 0101",
    role: "MANAGER",
    password: "Manager1234!",
    pin: "2000",
  },
  {
    name: "Jamie Chen",
    email: "waiter@dinego.com",
    phone: "+1 555 0102",
    role: "WAITER",
    password: "Waiter1234!",
    pin: "3000",
  },
  {
    name: "Priya Patel",
    email: "cashier@dinego.com",
    phone: "+1 555 0103",
    role: "CASHIER",
    password: "Cashier1234!",
    pin: "4000",
  },
  {
    name: "Tomas Novak",
    email: "kitchen@dinego.com",
    phone: "+1 555 0104",
    role: "KITCHEN",
    password: "Kitchen1234!",
    pin: "5000",
  },
  {
    name: "Sofia Alvarez",
    email: "customer@dinego.com",
    phone: "+1 555 0200",
    role: "CUSTOMER",
    password: "Customer1234!",
  },
  {
    name: "Alex Morgan",
    email: "alex@dinego.com",
    phone: "+1 555 0201",
    role: "CUSTOMER",
    password: "Customer1234!",
  },
];

/** Seeds every demo account into the single users table. */
export async function seedUsers(manager: EntityManager): Promise<Map<string, User>> {
  const repository = manager.getRepository(User);
  const users = new Map<string, User>();

  for (const account of userAccounts) {
    const passwordHash = await bcrypt.hash(account.password, 10);
    const pinHash = account.pin ? await bcrypt.hash(account.pin, 10) : null;
    const existing = await repository.findOne({ where: { email: account.email } });

    if (existing) {
      existing.name = account.name;
      existing.phone = account.phone;
      existing.passwordHash = passwordHash;
      existing.pinHash = pinHash;
      existing.role = account.role;
      existing.active = true;
      users.set(account.email, await repository.save(existing));
      continue;
    }

    const user = repository.create({
      name: account.name,
      email: account.email,
      phone: account.phone,
      passwordHash,
      pinHash,
      role: account.role,
      active: true,
    });

    users.set(account.email, await repository.save(user));
  }

  return users;
}
