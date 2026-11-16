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

export interface AuthenticatedRequest extends Request {
  auth?: TokenPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

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

    try {
      request.auth = await this.jwtService.verifyAsync<TokenPayload>(token);
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}
