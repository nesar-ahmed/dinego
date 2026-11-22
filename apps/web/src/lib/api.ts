import { apiErrorSchema } from "@dinego/shared";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export type ApiIssue = {
  path: string;
  message: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details: ApiIssue[];

  constructor(message: string, status: number, code?: string, details: ApiIssue[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
  /** Lets callers cancel stale requests, for example while typing in a search box. */
  signal?: AbortSignal;
  /** Extra request headers, e.g. `Idempotency-Key` for checkout. */
  headers?: Record<string, string>;
};

/**
 * Small typed fetch wrapper for the DineGo API.
 * Responses are parsed with the matching Zod schema by the caller.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  for (const [name, value] of Object.entries(options.headers ?? {})) {
    headers.set(name, value);
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      credentials: "include",
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    throw new ApiError(
      `Could not reach the API at ${API_BASE_URL}. Start it with "npm run dev".`,
      0,
    );
  }

  const text = await response.text();
  const payload: unknown = text ? safeJson(text) : null;

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);

    if (parsed.success) {
      const message =
        typeof parsed.data.message === "string"
          ? parsed.data.message
          : parsed.data.message.join(", ");

      throw new ApiError(message, response.status, parsed.data.code, parsed.data.details ?? []);
    }

    throw new ApiError(`The API responded with HTTP ${response.status}.`, response.status);
  }

  return payload as T;
}

/** Maps API field errors to a `{ fieldName: message }` object for form inputs. */
export function getFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) {
    return {};
  }

  return Object.fromEntries(error.details.map((detail) => [detail.path, detail.message]));
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
