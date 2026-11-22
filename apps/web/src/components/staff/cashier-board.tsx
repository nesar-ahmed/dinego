"use client";

import { useId, useState } from "react";
import type { OrderStatus, StaffBoardOrder } from "@dinego/shared";
import { useNow } from "@/components/notifications/use-now";
import {
  BoardAlerts,
  BoardColumn,
  BoardColumns,
  BoardHeader,
  BoardSkeleton,
  MissingNotice,
  OrderTicket,
  PrimaryAction,
  SecondaryAction,
  useHighlight,
} from "./board";
import { useOrderBoard } from "./use-order-board";

/**
 * The cashier's part of the takeaway flow: accept new orders (the kitchen may too), then hand
 * ready orders over against the pickup code: READY_FOR_PICKUP → COLLECTED, or NO_SHOW.
 * The server decides which orders are on the board and what the cashier may do with each; these
 * are only the columns.
 */
const NEW: OrderStatus[] = ["PLACED", "PAY_AT_PICKUP"];
const IN_KITCHEN: OrderStatus[] = ["ACCEPTED", "PREPARING"];
const READY: OrderStatus[] = ["READY_FOR_PICKUP"];

type Confirming = { orderId: number; kind: "handover" | "noshow" };

export function CashierBoard() {
  const board = useOrderBoard();
  const now = useNow(15_000);
  const searchId = useId();
  const [code, setCode] = useState("");
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const { highlightId, missing } = useHighlight(
    "order",
    board.orders?.map((order) => order.id) ?? null,
    board.refresh,
  );

  const search = code.trim();
  const orders = (board.orders ?? []).filter(
    (order) => search === "" || (order.pickupCode ?? "").startsWith(search),
  );
  const column = (statuses: OrderStatus[]) =>
    orders.filter((order) => statuses.includes(order.status));
  const readyMatch = search !== "" && column(READY).length === 1 ? column(READY)[0] : null;

  function startConfirm(next: Confirming) {
    setDone(null);
    setReason("");
    setConfirming(next);
  }

  async function finish(order: StaffBoardOrder, status: "COLLECTED" | "NO_SHOW") {
    const note = reason.trim();
    const ok = await board.changeStatus(
      order,
      status,
      status === "NO_SHOW" && note !== "" ? note : undefined,
    );
    if (ok) {
      setConfirming(null);
      setCode("");
      setDone(
        status === "COLLECTED"
          ? `${order.orderNo} was handed over.`
          : `${order.orderNo} was marked as not collected.`,
      );
    }
  }

  const ticket = (order: StaffBoardOrder) => {
    const busy = board.busyIds.has(order.id);
    const active = confirming?.orderId === order.id ? confirming.kind : null;
    const ready = order.status === "READY_FOR_PICKUP";
    const canAccept = order.actions.includes("ACCEPTED");
    const canHandOver = order.actions.includes("COLLECTED");
    const canNoShow = order.actions.includes("NO_SHOW");

    let actions;
    if (canAccept) {
      actions = (
        <PrimaryAction
          busy={busy}
          context={order.orderNo}
          onClick={() => void board.changeStatus(order, "ACCEPTED")}
        >
          Accept order
        </PrimaryAction>
      );
    } else if (canHandOver && active === "handover") {
      actions = (
        <div className="w-full space-y-3 rounded-xl border border-line-strong bg-surface-2/60 p-3">
          <p className="text-sm text-fg">
            Ask for the pickup code. It must be{" "}
            <span className="font-black tabular-nums">{order.pickupCode}</span>.
          </p>
          <div className="flex flex-wrap gap-2">
            <PrimaryAction busy={busy} onClick={() => void finish(order, "COLLECTED")}>
              Code matches, hand over
            </PrimaryAction>
            <SecondaryAction onClick={() => setConfirming(null)}>Cancel</SecondaryAction>
          </div>
        </div>
      );
    } else if (canNoShow && active === "noshow") {
      const reasonId = `${searchId}-reason-${order.id}`;
      const tooShort = reason.trim().length > 0 && reason.trim().length < 3;
      actions = (
        <div className="w-full space-y-3 rounded-xl border border-danger/25 bg-danger/5 p-3">
          <label htmlFor={reasonId} className="block text-sm font-semibold text-fg">
            Reason <span className="font-normal text-muted">(optional, shown to the customer)</span>
          </label>
          <input
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={300}
            placeholder="e.g. Not collected by closing time"
            aria-invalid={tooShort}
            className="w-full rounded-xl border border-line bg-ink/50 px-3 py-2 text-sm text-fg outline-none placeholder:text-muted/60 focus:border-brand/60"
          />
          {tooShort ? (
            <p className="text-xs text-danger">Use at least 3 characters, or leave it empty.</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <SecondaryAction
              danger
              busy={busy || tooShort}
              onClick={() => void finish(order, "NO_SHOW")}
            >
              {busy ? "Saving…" : "Mark not collected"}
            </SecondaryAction>
            <SecondaryAction onClick={() => setConfirming(null)}>Cancel</SecondaryAction>
          </div>
        </div>
      );
    } else if (canHandOver || canNoShow) {
      actions = (
        <>
          {canHandOver ? (
            <PrimaryAction
              busy={busy}
              context={order.orderNo}
              onClick={() => startConfirm({ orderId: order.id, kind: "handover" })}
            >
              Hand over
            </PrimaryAction>
          ) : null}
          {canNoShow ? (
            <SecondaryAction
              context={order.orderNo}
              onClick={() => startConfirm({ orderId: order.id, kind: "noshow" })}
            >
              No-show
            </SecondaryAction>
          ) : null}
        </>
      );
    } else {
      actions = (
        <p className="text-xs text-muted">
          {order.status === "ACCEPTED" ? "Accepted. The kitchen will start it." : "Being cooked."}
        </p>
      );
    }

    return (
      <OrderTicket
        key={order.id}
        order={order}
        now={now}
        clock={
          ready
            ? { label: "Ready", since: order.updatedAt }
            : { label: "Placed", since: order.createdAt }
        }
        highlighted={highlightId === order.id || readyMatch?.id === order.id}
        actions={actions}
      />
    );
  };

  return (
    <div>
      <BoardHeader
        eyebrow="Takeaway counter"
        title="Pickup counter"
        description="Takeaway orders from acceptance to hand-over. Check the customer's pickup code before you hand an order over."
        lastSyncedAt={board.lastSyncedAt}
        onRefresh={board.refresh}
      >
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor={searchId}
            className="flex w-full max-w-xs items-center gap-2 rounded-xl border border-line bg-surface/60 px-3 py-2"
          >
            <span className="sr-only">Find an order by pickup code</span>
            <SearchIcon />
            <input
              id={searchId}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="Find by pickup code"
              className="w-full bg-transparent text-sm tabular-nums text-fg outline-none placeholder:text-muted/60"
            />
          </label>
          {search !== "" ? (
            <p className="text-sm text-muted" aria-live="polite">
              {orders.length === 0
                ? `No order with pickup code ${search}.`
                : readyMatch
                  ? `${readyMatch.orderNo} is ready for this code.`
                  : `${orders.length} ${orders.length === 1 ? "order matches" : "orders match"}.`}
            </p>
          ) : null}
        </div>
      </BoardHeader>

      <BoardAlerts
        loadError={board.loadError}
        actionError={board.actionError}
        onDismiss={board.dismissActionError}
      />
      <MissingNotice show={missing} what="order" />
      {done ? (
        <p
          role="status"
          className="mb-4 rounded-xl border border-ok/30 bg-ok/10 px-4 py-3 text-sm text-ok"
        >
          {done}
        </p>
      ) : null}

      {board.orders === null ? (
        board.loadError ? null : (
          <BoardSkeleton />
        )
      ) : (
        <BoardColumns>
          <BoardColumn
            title="New orders"
            hint="Accept so the kitchen can start"
            count={column(NEW).length}
            attention
            empty="No new takeaway orders."
          >
            {column(NEW).map(ticket)}
          </BoardColumn>
          <BoardColumn
            title="In the kitchen"
            hint="Accepted and being cooked"
            count={column(IN_KITCHEN).length}
            empty="Nothing in the kitchen."
          >
            {column(IN_KITCHEN).map(ticket)}
          </BoardColumn>
          <BoardColumn
            title="Ready for pickup"
            hint="Hand over when the customer shows the code"
            count={column(READY).length}
            attention
            empty="No orders waiting for pickup."
          >
            {column(READY).map(ticket)}
          </BoardColumn>
        </BoardColumns>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 shrink-0 text-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}
