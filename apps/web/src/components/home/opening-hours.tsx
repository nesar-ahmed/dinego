"use client";

import { useEffect, useState } from "react";
import { openingHours } from "@/lib/restaurant";

/**
 * Weekly hours with today's row highlighted. The weekday is read after mount, in the visitor's
 * own time zone, so server and client HTML always match.
 */
export function OpeningHours({ tone = "default" }: { tone?: "default" | "inverse" }) {
  const [today, setToday] = useState<number | null>(null);

  useEffect(() => {
    setToday(new Date().getDay());
  }, []);

  const inverse = tone === "inverse";

  return (
    <dl className="text-sm">
      {openingHours.map((entry) => {
        const isToday = today !== null && (entry.days as readonly number[]).includes(today);

        return (
          <div
            key={entry.label}
            className={`flex items-baseline justify-between gap-4 border-b py-3 last:border-b-0 ${
              inverse ? "border-inverse-line" : "border-line"
            }`}
          >
            <dt
              className={`flex items-center gap-2 ${inverse ? "text-inverse-muted" : "text-muted"}`}
            >
              {entry.label}
              {isToday && inverse ? (
                <span className="size-1.5 rounded-full bg-brand" aria-label="Today" role="img" />
              ) : null}
              {isToday && !inverse ? (
                <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-brand">
                  Today
                </span>
              ) : null}
            </dt>
            <dd
              className={`whitespace-nowrap tabular-nums ${isToday ? "font-semibold" : "font-medium"} ${
                inverse ? "text-inverse-fg" : "text-fg"
              }`}
            >
              {entry.opens} – {entry.closes}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
