import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { UserRole } from "@dinego/shared";
import { ROLES_KEY } from "../decorators/roles.decorator.js";
import type { AuthenticatedRequest } from "./jwt-auth.guard.js";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { auth } = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!auth || auth.type !== "STAFF" || !auth.role) {
      throw new ForbiddenException("Staff access is required");
    }

    if (!requiredRoles.includes(auth.role)) {
      throw new ForbiddenException("You do not have permission to access this resource");
    }

    return true;
  }
}
