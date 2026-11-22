import { HttpException, HttpStatus } from "@nestjs/common";
import type { CartErrorCode } from "@dinego/shared";

/** Error body matching the shared `apiErrorSchema`, with a machine-readable `code`. */
export function cartError(status: HttpStatus, code: CartErrorCode, message: string): HttpException {
  return new HttpException({ statusCode: status, code, message }, status);
}
