import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

/**
 * Validates a request payload against a Zod schema from @dinego/shared.
 * Returns the parsed value, so defaults and coercions are applied.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        // Nest does not add statusCode when the exception body is an object; the shared
        // apiErrorSchema (used by the web client) requires it.
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    return result.data;
  }
}
