import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

/**
 * Reads the `Idempotency-Key` request header. Unlike `@Headers()`, custom param decorators accept
 * pipes, so the key can be validated with the shared schema.
 */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined =>
    context.switchToHttp().getRequest<Request>().header("idempotency-key"),
);
