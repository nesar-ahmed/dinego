import {
  customerAuthResponseSchema,
  customerResponseSchema,
  type ChangeEmailInput,
  type ChangePasswordInput,
  type Customer,
} from "@dinego/shared";
import { ApiError, apiRequest } from "./api";
import { notifyAuthChanged } from "./auth";

function contractError(label: string): ApiError {
  return new ApiError(`The ${label} response did not match the shared contract.`, 0);
}

/** Name and phone. An empty phone removes it. */
export async function updateProfile(input: {
  name?: string;
  phone?: string | null;
}): Promise<Customer> {
  const parsed = customerResponseSchema.safeParse(
    await apiRequest<unknown>("/users/me/profile", { method: "PATCH", body: input }),
  );
  if (!parsed.success) throw contractError("profile");

  notifyAuthChanged(); // The header shows the name.
  return parsed.data.customer;
}

export async function changeEmail(input: ChangeEmailInput): Promise<Customer> {
  const parsed = customerResponseSchema.safeParse(
    await apiRequest<unknown>("/users/me/email", { method: "PUT", body: input }),
  );
  if (!parsed.success) throw contractError("email");

  notifyAuthChanged();
  return parsed.data.customer;
}

/** The API signs out other sessions and sets a new cookie for this one. */
export async function changePassword(input: ChangePasswordInput): Promise<Customer> {
  const parsed = customerAuthResponseSchema.safeParse(
    await apiRequest<unknown>("/users/me/password", { method: "PUT", body: input }),
  );
  if (!parsed.success) throw contractError("password");

  return parsed.data.customer;
}

/** First message per field from a shared-schema validation error, for inline form errors. */
export function zodFieldErrors(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.map(String).join(".") || "form";
    errors[path] ??= issue.message;
  }
  return errors;
}
