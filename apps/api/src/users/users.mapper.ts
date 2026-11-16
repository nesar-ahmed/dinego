import type { Customer as CustomerDto, User as UserDto } from "@dinego/shared";
import { User } from "./entities/user.entity.js";

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt.toISOString(),
  };
}

/** Customer responses intentionally hide staff fields such as role and active. */
export function toCustomerDto(user: User): CustomerDto {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}
