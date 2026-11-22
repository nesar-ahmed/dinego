import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import type { TokenPayload } from "@dinego/shared";
import { ACCESS_TOKEN_COOKIE } from "../auth-cookie.js";
import { UsersService } from "../users.service.js";

export interface AuthenticatedRequest extends Request {
  auth?: TokenPayload;
}

/**
 * Accepts a Bearer token or the HttpOnly session cookie. Besides the signature, every request
 * checks the account's current state, so these take effect immediately rather than when the
 * token expires:
 * - deactivated or deleted accounts are signed out;
 * - a password change (session version bump) signs out older tokens;
 * - the role comes from the database, so role changes apply at once.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, headerToken] = request.headers.authorization?.split(" ") ?? [];
    const cookieToken = (request.cookies as Record<string, string> | undefined)?.[
      ACCESS_TOKEN_COOKIE
    ];
    const token = scheme === "Bearer" && headerToken ? headerToken : cookieToken;

    if (!token) {
      throw new UnauthorizedException("Missing bearer token or session cookie");
    }

    let payload: TokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<TokenPayload>(token);
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }

    const user = await this.usersService.findSessionUser(payload.sub);
    const isCustomer = user?.role === "CUSTOMER";

    if (
      !user ||
      !user.active ||
      // Tokens issued before session versioning have no `ver` and count as version 0.
      (payload.ver ?? 0) !== user.tokenVersion ||
      (payload.type === "CUSTOMER") !== isCustomer
    ) {
      throw new UnauthorizedException("Your session has ended. Please sign in again.");
    }

    request.auth = { ...payload, role: user.role };
    return true;
  }
}
