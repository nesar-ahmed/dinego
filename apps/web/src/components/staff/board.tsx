"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { StaffOrder, StaffOrderItem } from "@dinego/shared";
import { formatWait, minutesSince, STATION_LABELS } from "@/lib/staff-orders";

/** A ticket waiting longer than this shows its timer in red. */
export const LATE_AFTER_MINUTES = 15;

/* --------------------------------- Header -------------------------------- */

export function BoardHeader({
  eyebrow,
  title,
  description,
  lastSyncedAt,
  onRefresh,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  lastSyncedAt: number | null;
  onRefresh: () => Promise<void>;
  /** Filters or search, under the title. */
  children?: ReactNode;
}) {
  const [refreshing, setRefreshing] = useState(false);

  return (
    <header className="space-y-4 pb-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-soft">
            {eyebrow}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-fg">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          <SyncStatus lastSyncedAt={lastSyncedAt} />
          <button
            type="button"
            onClick={async () => {
              setRefreshing(true);
              try {
                await onRefresh();
              } finally {
                setRefreshing(false);
              }
            }}
            disabled={refreshing}
            className="rounded-xl border border-line-strong px-4 py-2 text-sm font-semibold text-fg transition hover:border-brand/50 disabled:opacity-60"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>
      {children}
    </header>
  );
}

const timeFormat = new Intl.DateTimeFormat("en-US", { timeStyle: "short" });

function SyncStatus({ lastSyncedAt }: { lastSyncedAt: number | null }) {
  if (lastSyncedAt === null) return null;

  return (
    <p className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className="size-1.5 rounded-full bg-ok" aria-hidden />
      Live · updated {timeFormat.format(lastSyncedAt)}
    </p>
  );
}

/* --------------------------------- Alerts -------------------------------- */

export function BoardAlerts({
  loadError,
  actionError,
  onDismiss,
}: {
  loadError: string | null;
  actionError: string | null;
  onDismiss: () => void;
}) {
  if (!loadError && !actionError) return null;

  return (
    <div className="mb-4 space-y-2">
      {actionError ? (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          <p>{actionError}</p>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 text-xs font-semibold underline-offset-2 hover:underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {loadError ? (
        <p
          role="status"
          className="rounded-xl border border-line-strong bg-surface-2/60 px-4 py-3 text-sm text-muted"
        >
          {loadError}
        </p>
      ) : null}
    </div>
  );
}

/* --------------------------------- Columns ------------------------------- */

export function BoardColumns({ children }: { children: ReactNode }) {
  return <div className="grid items-start gap-4 lg:grid-cols-3">{children}</div>;
}

export function BoardColumn({
  title,
  hint,
  count,
  attention = false,
  empty,
  children,
}: {
  title: string;
  hint: string;
  count: number;
  /** Orders here wait for this role's action: the count stands out. */
  attention?: boolean;
  empty: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={`${title}, ${count} ${count === 1 ? "order" : "orders"}`}
      className="rounded-3xl border border-line bg-surface/50"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-semibold tracking-tight text-fg">{title}</h2>
          <p className="text-xs text-muted">{hint}</p>
        </div>
        <span
          className={`grid h-7 min-w-7 place-items-center rounded-full px-2 text-xs font-bold tabular-nums ${
            attention && count > 0 ? "bg-brand text-brand-ink" : "bg-surface-2 text-fg"
          }`}
          aria-hidden
        >
          {count}
        </span>
      </div>
      {count === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted">{empty}</p>
      ) : (
        <ul className="space-y-3 p-3">{children}</ul>
      )}
    </section>
  );
}

export function BoardSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-3" role="status" aria-label="Loading orders">
      {[0, 1, 2].map((column) => (
        <div key={column} className="rounded-3xl border border-line bg-surface/50 p-3">
          <div className="h-10 animate-pulse rounded-xl bg-surface-2/70" />
          <div className="mt-3 h-40 animate-pulse rounded-2xl bg-surface-2/50" />
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- Ticket -------------------------------- */

export function OrderTicket({
  order,
  now,
  clock,
  items = order.items,
  hiddenItems = 0,
  highlighted = false,
  actions,
}: {
  order: StaffOrder;
  now: number;
  /**
   * What the timer measures, e.g. time since the order was placed, or since it became ready.
   * `waiting: false` for time that is not a wait (guests eating after being served): never late.
   */
  clock: { label: string; since: string; waiting?: boolean };
  /** The items to list (the kitchen can show one station's items). */
  items?: StaffOrderItem[];
  /** Items left out by a station filter. */
  hiddenItems?: number;
  highlighted?: boolean;
  actions?: ReactNode;
}) {
  const minutes = minutesSince(clock.since, now);
  const late = (clock.waiting ?? true) && minutes >= LATE_AFTER_MINUTES;
  const where =
    order.type === "DINE_IN"
      ? { label: "Table", value: order.table?.label ?? "—" }
      : { label: "Pickup", value: order.pickupCode ?? "—" };

  return (
    <li
      data-order-id={order.id}
      className={`scroll-mt-24 rounded-2xl border bg-surface p-4 shadow-sm transition ${
        highlighted ? "border-brand ring-2 ring-brand/40" : "border-line"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold tabular-nums text-fg">{order.orderNo}</p>
          <p className="truncate text-xs text-muted">
            {order.type === "DINE_IN" ? "Dine in" : "Takeaway"}
            {order.customer ? ` · ${order.customer.name}` : ""}
          </p>
        </div>
        <div className="shrink-0 rounded-xl border border-line-strong bg-surface-2/60 px-2.5 py-1 text-right">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">
            {where.label}
          </p>
          <p className="text-base font-black leading-tight tabular-nums text-fg">{where.value}</p>
        </div>
      </div>

      <p
        className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold ${
          late ? "text-danger" : "text-muted"
        }`}
      >
        <ClockIcon />
        {clock.label} {minutes < 1 ? "just now" : `${formatWait(minutes)} ago`}
        {late ? <span className="sr-only"> (late)</span> : null}
      </p>

      <ul className="mt-3 divide-y divide-line border-y border-line">
        {items.map((item) => (
          <li key={item.id} className="flex items-baseline gap-2.5 py-2 text-sm">
            <span className="w-7 shrink-0 font-black tabular-nums text-fg">{item.quantity}×</span>
            <span className="min-w-0 flex-1 font-medium text-fg">{item.name}</span>
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
              {STATION_LABELS[item.station]}
            </span>
          </li>
        ))}
      </ul>
      {hiddenItems > 0 ? (
        <p className="mt-2 text-xs text-muted">
          + {hiddenItems} {hiddenItems === 1 ? "item" : "items"} from other stations
        </p>
      ) : null}

      {order.notes ? (
        <p className="mt-3 rounded-xl border border-line-strong bg-surface-2/60 px-3 py-2 text-sm text-fg">
          <span className="font-semibold">Note: </span>
          {order.notes}
        </p>
      ) : null}

      {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
    </li>
  );
}

/**
 * Accessible name for a board button: the visible text plus what it acts on, e.g.
 * "Start cooking, DG-00042", so a list of identical buttons can be told apart.
 */
function actionLabel(text: ReactNode, context: string | undefined): string | undefined {
  return context && typeof text === "string" ? `${text}, ${context}` : undefined;
}

export function PrimaryAction({
  children,
  context,
  onClick,
  busy = false,
}: {
  children: ReactNode;
  /** What the button acts on, e.g. the order number. */
  context?: string;
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={actionLabel(busy ? "Saving…" : children, context)}
      className="min-h-11 flex-1 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-ink transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
    >
      {busy ? "Saving…" : children}
    </button>
  );
}

export function SecondaryAction({
  children,
  context,
  onClick,
  busy = false,
  danger = false,
}: {
  children: ReactNode;
  /** What the button acts on, e.g. the order number. */
  context?: string;
  onClick: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={actionLabel(children, context)}
      className={`min-h-11 rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
        danger
          ? "border-danger/30 text-danger hover:bg-danger/10"
          : "border-line-strong text-fg hover:border-brand/50"
      }`}
    >
      {children}
    </button>
  );
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className="size-3.5"
      aria-hidden
    >
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l2.5 1.5" />
    </svg>
  );
}

/* ------------------------------ Highlighting ----------------------------- */

/**
 * Opening a notification leads to `?order=<id>` (or `?table=<id>`). The board reloads first (the
 * notification may be newer than the board), then scrolls to that record and highlights it for a
 * few seconds, and drops the parameter so opening the same notification again works again.
 * `onFound` runs just before the highlight, e.g. to clear filters that would hide the record.
 */
export function useHighlight(
  param: "order" | "table",
  loadedIds: number[] | null,
  refresh: () => Promise<void>,
  onFound?: () => void,
): { highlightId: number | null; missing: boolean } {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = Number(searchParams.get(param)) || null;
  /** The requested id, once the board has been reloaded for it. */
  const [target, setTarget] = useState<number | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [missing, setMissing] = useState(false);
  const loaded = loadedIds !== null;
  const found = target !== null && (loadedIds?.includes(target) ?? false);

  useEffect(() => {
    if (requested === null) return;
    void refresh().finally(() => setTarget(requested));
  }, [refresh, requested]);

  useEffect(() => {
    if (target === null || !loaded) return;

    if (found) onFound?.();
    setHighlightId(found ? target : null);
    setMissing(!found);
    setTarget(null);
    router.replace(pathname, { scroll: false });
  }, [found, loaded, onFound, pathname, router, target]);

  useEffect(() => {
    if (highlightId === null) return;

    document
      .querySelector(`[data-${param}-id="${highlightId}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = setTimeout(() => setHighlightId(null), 4000);
    return () => clearTimeout(timer);
  }, [highlightId, param]);

  useEffect(() => {
    if (!missing) return;
    const timer = setTimeout(() => setMissing(false), 6000);
    return () => clearTimeout(timer);
  }, [missing]);

  return { highlightId, missing };
}

export function MissingNotice({ show, what }: { show: boolean; what: string }) {
  if (!show) return null;

  return (
    <p
      role="status"
      className="mb-4 rounded-xl border border-line-strong bg-surface-2/60 px-4 py-3 text-sm text-muted"
    >
      That {what} is no longer on this board: it may already be finished or cancelled.
    </p>
  );
}

/* ---------------------------------- Chips -------------------------------- */

/** Single-choice chips, styled like the notification filters. */
export function FilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string; count?: number }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5 sm:gap-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
              selected
                ? "border-fg bg-fg text-ink"
                : "border-line text-muted hover:border-line-strong hover:text-fg"
            }`}
          >
            {option.label}
            {option.count !== undefined ? (
              <span
                className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                  selected ? "bg-ink/15" : "bg-surface-2 text-fg"
                }`}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
