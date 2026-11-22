"use client";

import { useEffect, useState } from "react";

/** The current time, refreshed every `intervalMs`, so relative times ("5 min. ago") stay current. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(handle);
  }, [intervalMs]);

  return now;
}
