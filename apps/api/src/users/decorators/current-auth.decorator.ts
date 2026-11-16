import { createParamDecorator, type ExecutionContext, UnauthorizedException } from "@nestjs/common";
import type { TokenPayload } from "@dinego/shared";
import type { AuthenticatedRequest } from "../guards/jwt-auth.guard.js";

/** Reads the verified JWT payload placed on the request by JwtAuthGuard. */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TokenPayload => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.auth) {
      throw new UnauthorizedException("Missing authentication context");
    }

    return request.auth;
  },
);
