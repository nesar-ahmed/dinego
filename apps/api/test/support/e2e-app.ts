import type { INestApplication, LoggerService } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { AppModule } from "../../src/app.module.js";

type Level = "error" | "warn";
type LogEntry = { level: Level; text: string };

function describeParam(param: unknown): string {
  if (param instanceof Error) return param.stack ?? param.message;
  return typeof param === "string" ? param : JSON.stringify(param);
}

/**
 * Captures everything the API logs during e2e tests instead of printing it.
 *
 * Errors must be expected explicitly with `expectError(...)`; any other error logged by the API
 * (a 500, a failed background job, a provider bug) fails the test in `afterEach`. This keeps the
 * output clean and makes "the test passed but the server logged an error" impossible.
 */
export class ServerLogs implements LoggerService {
  private entries: LogEntry[] = [];

  log(): void {}
  debug(): void {}
  verbose(): void {}

  error(message: unknown, ...params: unknown[]): void {
    this.record("error", message, params);
  }

  fatal(message: unknown, ...params: unknown[]): void {
    this.record("error", message, params);
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.record("warn", message, params);
  }

  /** Asserts that the API logged a matching error, and marks it as expected. */
  expectError(pattern: RegExp): string {
    return this.take("error", pattern);
  }

  /** Asserts that the API logged a matching warning. */
  expectWarning(pattern: RegExp): string {
    return this.take("warn", pattern);
  }

  /** Fails when the API logged errors that no test expected. Clears the log for the next test. */
  assertNoUnexpectedErrors(): void {
    const unexpected = this.entries.filter((entry) => entry.level === "error");
    this.entries = [];

    if (unexpected.length > 0) {
      throw new Error(
        `The API logged ${unexpected.length} unexpected error(s):\n\n${unexpected
          .map((entry) => entry.text)
          .join("\n\n")}`,
      );
    }
  }

  private record(level: Level, message: unknown, params: unknown[]): void {
    this.entries.push({ level, text: [message, ...params].map(describeParam).join(" ") });
  }

  private take(level: Level, pattern: RegExp): string {
    const index = this.entries.findIndex(
      (entry) => entry.level === level && pattern.test(entry.text),
    );

    if (index === -1) {
      const logged = this.entries.map((entry) => `  [${entry.level}] ${entry.text}`).join("\n");
      throw new Error(
        `Expected the API to log a ${level} matching ${pattern}. Logged:\n${logged || "  (nothing)"}`,
      );
    }

    return this.entries.splice(index, 1)[0].text;
  }
}

/**
 * Boots the real Nest application the way main.ts does (cookies, `/api/v1` prefix), with its logs
 * captured by `ServerLogs`. Call `logs.assertNoUnexpectedErrors()` in `afterEach`.
 */
export async function createE2eApp(): Promise<{ app: INestApplication; logs: ServerLogs }> {
  const logs = new ServerLogs();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: logs });

  app.use(cookieParser());
  app.setGlobalPrefix("api/v1");
  await app.init();

  return { app, logs };
}
