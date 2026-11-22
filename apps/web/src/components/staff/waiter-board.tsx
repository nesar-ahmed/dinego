"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OrderStatus, StaffBoardOrder } from "@dinego/shared";
import { useNow } from "@/components/notifications/use-now";
import { ApiError } from "@/lib/api";
import { tableActionError, updateTableStatus } from "@/lib/floor";
import { ORDER_ACTION_LABELS } from "@/lib/staff-orders";
import {
  BoardAlerts,
  BoardColumn,
  BoardColumns,
  BoardHeader,
  BoardSkeleton,
  MissingNotice,
  OrderTicket,
  PrimaryAction,
  useHighlight,
} from "./board";
import { WAITER_TABLES_HREF } from "./staff-console";
import { useOrderBoard } from "./use-order-board";

/**
 * The waiter's part of the dine-in flow: READY → SERVED → CLOSED, then the table is turned over.
 * The server decides which orders are on the board and what the waiter may do; these are only
 * the columns.
 */
const IN_KITCHEN: OrderStatus[] = ["SENT", "IN_PROGRESS"];
const TO_SERVE: OrderStatus[] = ["READY"];
const SERVED: OrderStatus[] = ["SERVED"];

type ClosedTable = { tableId: number; label: string; orderNo: string };

export function WaiterBoard() {
  const router = useRouter();
  const board = useOrderBoard();
  const now = useNow(15_000);
  const [closedTable, setClosedTable] = useState<ClosedTable | null>(null);
  const [tableBusy, setTableBusy] = useState(false);
  const [tableMessage, setTableMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const { highlightId, missing } = useHighlight(
    "order",
    board.orders?.map((order) => order.id) ?? null,
    board.refresh,
  );

  const orders = board.orders ?? [];
  const column = (statuses: OrderStatus[]) =>
    orders.filter((order) => statuses.includes(order.status));

  async function closeOrder(order: StaffBoardOrder) {
    setTableMessage(null);
    const closed = await board.changeStatus(order, "CLOSED");
    const table = order.table;
    // Offer to turn the table over once its last open order is closed.
    if (closed && table && !orders.some((o) => o.id !== order.id && o.table?.id === table.id)) {
      setClosedTable({ tableId: table.id, label: table.label, orderNo: order.orderNo });
    }
  }

  async function markForCleaning(target: ClosedTable) {
    setTableBusy(true);
    try {
      await updateTableStatus(target.tableId, "CLEANING");
      setTableMessage({ ok: true, text: `Table ${target.label} is marked for cleaning.` });
      setClosedTable(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      setTableMessage({ ok: false, text: tableActionError(cause, target.label) });
      setClosedTable(null);
    } finally {
      setTableBusy(false);
    }
  }

  const ticket = (order: StaffBoardOrder) => {
    const busy = board.busyIds.has(order.id);
    const next = order.actions[0];
    const clock =
      order.status === "READY"
        ? { label: "Ready", since: order.updatedAt }
        : order.status === "SERVED"
          ? { label: "Served", since: order.updatedAt, waiting: false }
          : { label: "Placed", since: order.createdAt };

    return (
      <OrderTicket
        key={order.id}
        order={order}
        now={now}
        clock={clock}
        highlighted={highlightId === order.id}
        actions={
          next ? (
            <PrimaryAction
              busy={busy}
              context={order.orderNo}
              // Closing also offers to turn the table over.
              onClick={() =>
                void (next === "CLOSED" ? closeOrder(order) : board.changeStatus(order, next))
              }
            >
              {ORDER_ACTION_LABELS[next] ?? next}
            </PrimaryAction>
          ) : (
            <p className="text-xs text-muted">
              {order.status === "SENT" ? "The kitchen hasn't started yet." : "Being cooked."}
            </p>
          )
        }
      />
    );
  };

  return (
    <div>
      <BoardHeader
        eyebrow="Floor service"
        title="Service board"
        description="Dine-in orders from the kitchen to the table. Serve ready orders first, and close each order when the guests are done."
        lastSyncedAt={board.lastSyncedAt}
        onRefresh={board.refresh}
      />

      <BoardAlerts
        loadError={board.loadError}
        actionError={board.actionError}
        onDismiss={board.dismissActionError}
      />
      <MissingNotice show={missing} what="order" />

      {closedTable ? (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line-strong bg-surface px-4 py-3"
        >
          <p className="text-sm text-fg">
            <span className="font-semibold">{closedTable.orderNo} is closed.</span> Table{" "}
            {closedTable.label} has no open orders left. Mark it for cleaning?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void markForCleaning(closedTable)}
              disabled={tableBusy}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-brand-ink transition hover:opacity-90 disabled:opacity-60"
            >
              {tableBusy ? "Saving…" : "Mark for cleaning"}
            </button>
            <button
              type="button"
              onClick={() => setClosedTable(null)}
              className="rounded-xl border border-line-strong px-4 py-2 text-sm font-semibold text-fg transition hover:border-brand/50"
            >
              Not now
            </button>
          </div>
        </div>
      ) : null}
      {tableMessage ? (
        <p
          role={tableMessage.ok ? "status" : "alert"}
          className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            tableMessage.ok
              ? "border-ok/30 bg-ok/10 text-ok"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {tableMessage.text}{" "}
          <Link href={WAITER_TABLES_HREF} className="font-semibold underline underline-offset-2">
            Open tables
          </Link>
        </p>
      ) : null}

      {board.orders === null ? (
        board.loadError ? null : (
          <BoardSkeleton />
        )
      ) : (
        <BoardColumns>
          <BoardColumn
            title="In the kitchen"
            hint="Placed and being cooked"
            count={column(IN_KITCHEN).length}
            empty="No dine-in orders in the kitchen."
          >
            {column(IN_KITCHEN).map(ticket)}
          </BoardColumn>
          <BoardColumn
            title="Ready to serve"
            hint="Take these to the table now"
            count={column(TO_SERVE).length}
            attention
            empty="Nothing to serve right now."
          >
            {column(TO_SERVE).map(ticket)}
          </BoardColumn>
          <BoardColumn
            title="Served"
            hint="Close each order when the guests are done"
            count={column(SERVED).length}
            attention
            empty="No served orders to close."
          >
            {column(SERVED).map(ticket)}
          </BoardColumn>
        </BoardColumns>
      )}
    </div>
  );
}
