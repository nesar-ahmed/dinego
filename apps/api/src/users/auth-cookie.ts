import type { Response } from "express";

export const ACCESS_TOKEN_COOKIE = "dinego_access_token";

type SameSite = "lax" | "strict" | "none";

function cookieOptions() {
  const secure = process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
  const sameSite = (process.env.COOKIE_SAME_SITE ?? "lax") as SameSite;
  const domain = process.env.COOKIE_DOMAIN;

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    ...(domain ? { domain } : {}),
  };
}

/** Stores the JWT in an HttpOnly cookie so browser clients never expose it to JavaScript. */
export function setAccessTokenCookie(response: Response, token: string): void {
  const maxAgeSeconds = Number(process.env.JWT_EXPIRES_IN_SECONDS ?? 604800);

  response.cookie(ACCESS_TOKEN_COOKIE, token, {
    ...cookieOptions(),
    maxAge: maxAgeSeconds * 1000,
  });
}

export function clearAccessTokenCookie(response: Response): void {
  response.clearCookie(ACCESS_TOKEN_COOKIE, cookieOptions());
}
