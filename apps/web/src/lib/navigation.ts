/**
 * Reads the `next` query parameter and only allows internal paths.
 * Falls back when the value is missing or could be an open redirect.
 */
export function getSafeNextPath(fallback: string, requiredPrefix?: string): string {
  if (typeof window === "undefined") {
    return fallback;
  }

  const next = new URLSearchParams(window.location.search).get("next");

  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return fallback;
  }

  if (requiredPrefix && !next.startsWith(requiredPrefix)) {
    return fallback;
  }

  return next;
}
