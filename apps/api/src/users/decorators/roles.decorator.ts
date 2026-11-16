import { SetMetadata } from "@nestjs/common";
import type { UserRole } from "@dinego/shared";

export const ROLES_KEY = "roles";

/** Restrict a route to one or more restaurant staff roles. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
