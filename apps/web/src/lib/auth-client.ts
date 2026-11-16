import {
  customerAuthResponseSchema,
  meResponseSchema,
  sessionAuthResponseSchema,
  type CustomerAuthResponse,
  type CustomerRegisterInput,
  type LoginInput,
  type MeResponse,
  type SessionAuthResponse,
} from "@dinego/shared";
import { ApiError, apiRequest } from "./api";
import { notifyAuthChanged } from "./auth";

function contractError(label: string): ApiError {
  return new ApiError(`The ${label} response did not match the shared contract.`, 0);
}

/** Single login for customers and staff. */
export async function loginSession(input: LoginInput): Promise<SessionAuthResponse> {
  const payload = await apiRequest<unknown>("/users/session-login", {
    method: "POST",
    body: input,
  });
  const parsed = sessionAuthResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw contractError("login");
  }

  notifyAuthChanged();

  return parsed.data;
}

export async function registerCustomer(
  input: CustomerRegisterInput,
): Promise<CustomerAuthResponse> {
  const payload = await apiRequest<unknown>("/users/register", { method: "POST", body: input });
  const parsed = customerAuthResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw contractError("registration");
  }

  notifyAuthChanged();

  return parsed.data;
}

export async function fetchMe(token?: string): Promise<MeResponse> {
  const payload = await apiRequest<unknown>("/users/me", { token });
  const parsed = meResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw contractError("profile");
  }

  return parsed.data;
}

export async function logout(): Promise<void> {
  try {
    await apiRequest("/users/logout", { method: "POST" });
  } finally {
    notifyAuthChanged();
  }
}
