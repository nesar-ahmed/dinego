import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { AuthenticatedRequest } from "./jwt-auth.guard.js";

/** Allows only customer sessions. Use after JwtAuthGuard. */
@Injectable()
export class CustomerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { auth } = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (auth?.type !== "CUSTOMER") {
      throw new ForbiddenException({
        statusCode: 403,
        code: "CUSTOMER_ONLY",
        message: "Only customer accounts can use this endpoint",
      });
    }

    return true;
  }
}
