"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StaffFloorTable, TableStatus } from "@dinego/shared";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { ApiError } from "@/lib/api";
import {
  fetchStaffFloor,
  TABLE_STATUS_LABELS,
  tableActionError,
  updateTableStatus,
} from "@/lib/floor";
import { STAFF_STATUS_LABELS } from "@/lib/staff-orders";
import { BoardHeader, FilterChips, MissingNotice, useHighlight } from "./board";
import { BOARD_REFRESH_MS } from "./use-order-board";

/**
 * Which of a table's allowed changes (`actions`, from the server) this screen offers as buttons,
 * and how they read. Cleaning a table with open orders is not allowed: its button stays, disabled.
 */
const OFFERED: Record<TableStatus, Array<{ to: TableStatus; label: string; primary?: boolean }>> = {
  FREE: [{ to: "OCCUPIED", label: "Seat guests" }],
  RESERVED: [
    { to: "OCCUPIED", label: "Seat guests", primary: true },
    { to: "FREE", label: "Release" },
  ],
  OCCUPIED: [{ to: "CLEANING", label: "Mark for cleaning" }],
  BILL_REQUESTED: [{ to: "CLEANING", label: "Mark for cleaning" }],
  CLEANING: [{ to: "FREE", label: "Ready for guests", primary: true }],
};

const STATUS_TONE: Record<TableStatus, string> = {
  FREE: "border-ok/30 bg-ok/10 text-ok",
  OCCUPIED: "border-line-strong bg-surface-2 text-fg",
  RESERVED: "border-line-strong bg-surface-2 text-fg",
  BILL_REQUESTED: "border-brand/40 bg-brand/10 text-brand-soft",
  CLEANING: "border-brand/40 bg-brand/10 text-brand-soft",
};

type Filter = "all" | TableStatus;

export function WaiterTables() {
  const router = useRouter();
  const { subscribe } = useNotifications();
  const [tables, setTables] = useState<StaffFloorTable[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const generation = useRef(0);

  const toLogin = useCallback(() => {
    router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
  }, [router]);

  const refresh = useCallback(async () => {
    const id = ++generation.current;
    try {
      const floor = await fetchStaffFloor();
      if (id !== generation.current) return;
      setTables(floor);
      setLoadError(null);
      setLastSyncedAt(Date.now());
    } catch (cause) {
      if (id !== generation.current) return;
      if (cause instanceof ApiError && cause.status === 401) {
        toLogin();
        return;
      }
      setLoadError(
        cause instanceof ApiError && cause.status === 0
          ? cause.message
          : "We couldn't refresh the floor. Retrying shortly.",
      );
    }
  }, [toLogin]);

  useEffect(() => {
    // First load is an external sync with the API, so setting state here is intended.
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(onVisible, BOARD_REFRESH_MS);
    document.addEventListener("visibilitychange", onVisible);
    const unsubscribe = subscribe((change) => {
      if (change.kind === "arrived") void refresh();
    });
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
    };
  }, [refresh, subscribe]);

  const { highlightId, missing } = useHighlight(
    "table",
    tables?.map((table) => table.id) ?? null,
    refresh,
  );

  async function change(table: StaffFloorTable, to: TableStatus) {
    setMessage(null);
    setBusyId(table.id);
    try {
      const updated = await updateTableStatus(table.id, to);
      // The table's new actions (and any order changes) come from the server.
      await refresh();
      setMessage({
        ok: true,
        text: `Table ${updated.label} is now ${TABLE_STATUS_LABELS[updated.status].toLowerCase()}.`,
      });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        toLogin();
        return;
      }
      setMessage({ ok: false, text: tableActionError(cause, table.label) });
      void refresh();
    } finally {
      setBusyId(null);
    }
  }

  const active = (tables ?? []).filter((table) => table.active);
  const count = (status: TableStatus) => active.filter((table) => table.status === status).length;
  const shown = (tables ?? []).filter(
    (table) => filter === "all" || (table.active && table.status === filter),
  );
  const zones = [...new Set(shown.map((table) => table.zone ?? "Other tables"))];

  return (
    <div>
      <BoardHeader
        eyebrow="Floor service"
        title="Tables"
        description="Seat walk-in guests, and turn tables over after a meal: mark them for cleaning, then ready for the next guests."
        lastSyncedAt={lastSyncedAt}
        onRefresh={refresh}
      >
        <FilterChips
          label="Table status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All tables" },
            { value: "CLEANING", label: "Needs cleaning", count: count("CLEANING") },
            { value: "OCCUPIED", label: "Occupied", count: count("OCCUPIED") },
            { value: "FREE", label: "Free", count: count("FREE") },
            { value: "RESERVED", label: "Reserved", count: count("RESERVED") },
          ]}
        />
      </BoardHeader>

      {message ? (
        <p
          role={message.ok ? "status" : "alert"}
          className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            message.ok
              ? "border-ok/30 bg-ok/10 text-ok"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {message.text}
        </p>
      ) : null}
      {loadError ? (
        <p
          role="status"
          className="mb-4 rounded-xl border border-line-strong bg-surface-2/60 px-4 py-3 text-sm text-muted"
        >
          {loadError}
        </p>
      ) : null}
      <MissingNotice show={missing} what="table" />

      {tables === null ? (
        loadError ? null : (
          <div
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            role="status"
            aria-label="Loading tables"
          >
            {[0, 1, 2, 3].map((key) => (
              <div
                key={key}
                className="h-40 animate-pulse rounded-2xl border border-line bg-surface/50"
              />
            ))}
          </div>
        )
      ) : shown.length === 0 ? (
        <p className="rounded-3xl border border-line bg-surface/50 px-4 py-12 text-center text-sm text-muted">
          No tables with this status.
        </p>
      ) : (
        <div className="space-y-6">
          {zones.map((zone) => (
            <section key={zone} aria-label={zone}>
              <h2 className="pb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                {zone}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {shown
                  .filter((table) => (table.zone ?? "Other tables") === zone)
                  .map((table) => (
                    <TableCard
                      key={table.id}
                      table={table}
                      busy={busyId === table.id}
                      highlighted={highlightId === table.id}
                      onChange={(to) => void change(table, to)}
                    />
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function TableCard({
  table,
  busy,
  highlighted,
  onChange,
}: {
  table: StaffFloorTable;
  busy: boolean;
  highlighted: boolean;
  onChange: (to: TableStatus) => void;
}) {
  const orders = table.openOrders;
  // Offered changes the server allows; cleaning or freeing waits for the open orders to close.
  const actions = (table.active ? OFFERED[table.status] : []).filter(
    (action) => table.actions.includes(action.to) || orders.length > 0,
  );
  const blocked = actions.some((action) => !table.actions.includes(action.to));

  return (
    <li
      data-table-id={table.id}
      className={`scroll-mt-24 rounded-2xl border bg-surface p-4 transition ${
        highlighted ? "border-brand ring-2 ring-brand/40" : "border-line"
      } ${table.active ? "" : "opacity-60"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-black tracking-tight text-fg">{table.label}</p>
          <p className="text-xs text-muted">
            {table.seats} {table.seats === 1 ? "seat" : "seats"}
          </p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
            table.active ? STATUS_TONE[table.status] : "border-line text-muted"
          }`}
        >
          {table.active ? TABLE_STATUS_LABELS[table.status] : "Out of service"}
        </span>
      </div>

      {orders.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs">
          {orders.map((order) => (
            <li key={order.id} className="flex justify-between gap-2">
              <span className="font-semibold tabular-nums text-fg">{order.orderNo}</span>
              <span className="text-muted">
                {STAFF_STATUS_LABELS[order.status] ?? order.status}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {actions.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {actions.map((action) => {
            const needsClosedOrders = !table.actions.includes(action.to);
            return (
              <button
                key={action.to}
                type="button"
                disabled={busy || needsClosedOrders}
                title={needsClosedOrders ? "Close this table's orders first" : undefined}
                aria-label={`${busy ? "Saving…" : action.label}, table ${table.label}`}
                onClick={() => onChange(action.to)}
                className={`min-h-10 flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  action.primary
                    ? "bg-brand font-bold text-brand-ink hover:opacity-90"
                    : "border border-line-strong text-fg hover:border-brand/50"
                }`}
              >
                {busy ? "Saving…" : action.label}
              </button>
            );
          })}
        </div>
      ) : null}
      {blocked ? (
        <p className="mt-2 text-[11px] text-muted">Close its orders before cleaning.</p>
      ) : null}
    </li>
  );
}
