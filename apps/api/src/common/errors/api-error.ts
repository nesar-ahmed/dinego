import { HttpException, type HttpStatus } from "@nestjs/common";

/**
 * Error body matching the shared `apiErrorSchema`, with a machine-readable `code`.
 * `extra` adds context fields such as `paymentId` for the client.
 */
export function apiError<Code extends string>(
  status: HttpStatus,
  code: Code,
  message: string,
  extra: Record<string, unknown> = {},
): HttpException {
  return new HttpException({ statusCode: status, code, message, ...extra }, status);
}

/** True for SQLite UNIQUE / partial-unique index violations raised by better-sqlite3. */
export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { driverError?: { code?: string }; code?: string } | null)?.driverError
    ?.code;
  return (
    code === "SQLITE_CONSTRAINT_UNIQUE" ||
    (error as { code?: string } | null)?.code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}
