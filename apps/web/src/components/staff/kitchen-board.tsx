"use client";

import { useCallback, useMemo, useState } from "react";
import {
  STATIONS,
  type OrderStatus,
  type OrderType,
  type StaffBoardOrder,
  type Station,
} from "@dinego/shared";
import { useNow } from "@/components/notifications/use-now";
import { ORDER_ACTION_LABELS, STATION_LABELS } from "@/lib/staff-orders";
import {
  BoardAlerts,
  BoardColumn,
  BoardColumns,
  BoardHeader,
  BoardSkeleton,
  FilterChips,
  MissingNotice,
  OrderTicket,
  PrimaryAction,
  useHighlight,
} from "./board";
import { useOrderBoard } from "./use-order-board";

/**
 * The kitchen's part of both flows. Dine-in: SENT → IN_PROGRESS → READY (the waiter serves).
 * Takeaway: PLACED → ACCEPTED → PREPARING → READY_FOR_PICKUP (the cashier hands it over).
 * The server decides which orders are on the board and what the kitchen may do with each; these
 * are only the columns.
 */
const TO_START: OrderStatus[] = ["SENT", "PLACED", "PAY_AT_PICKUP", "ACCEPTED"];
const COOKING: OrderStatus[] = ["IN_PROGRESS", "PREPARING"];
const READY: OrderStatus[] = ["READY", "READY_FOR_PICKUP"];

type TypeFilter = "all" | OrderType;
type StationFilter = "all" | Station;

export function KitchenBoard() {
  const board = useOrderBoard();
  const now = useNow(15_000);
  const [type, setType] = useState<TypeFilter>("all");
  const [station, setStation] = useState<StationFilter>("all");
  // An order opened from a notification must not be hidden by the filters.
  const showEverything = useCallback(() => {
    setType("all");
    setStation("all");
  }, []);
  const { highlightId, missing } = useHighlight(
    "order",
    board.orders?.map((order) => order.id) ?? null,
    board.refresh,
    showEverything,
  );

  /** Orders of the chosen type with the chosen station's items (orders without any are hidden). */
  const visible = useMemo(
    () =>
      (board.orders ?? [])
        .filter((order) => type === "all" || order.type === type)
        .map((order) => ({
          order,
          items:
            station === "all"
              ? order.items
              : order.items.filter((item) => item.station === station),
        }))
        .filter((entry) => entry.items.length > 0),
    [board.orders, station, type],
  );

  const column = (statuses: OrderStatus[]) =>
    visible.filter((entry) => statuses.includes(entry.order.status));

  const stationCounts = useMemo(() => {
    const counts = new Map<Station, number>();
    for (const order of board.orders ?? []) {
      if (type !== "all" && order.type !== type) continue;
      if (!TO_START.includes(order.status) && !COOKING.includes(order.status)) continue;
      for (const item of order.items) {
        counts.set(item.station, (counts.get(item.station) ?? 0) + item.quantity);
      }
    }
    return counts;
  }, [board.orders, type]);

  const ticket = (entry: { order: StaffBoardOrder; items: StaffBoardOrder["items"] }) => {
    const { order, items } = entry;
    // The usual next step comes first in `actions`.
    const next = order.actions[0];
    const ready = READY.includes(order.status);

    return (
      <OrderTicket
        key={order.id}
        order={order}
        now={now}
        items={items}
        hiddenItems={order.items.length - items.length}
        highlighted={highlightId === order.id}
        clock={
          ready
            ? { label: "Ready", since: order.updatedAt }
            : { label: "Placed", since: order.createdAt }
        }
        actions={
          next ? (
            <PrimaryAction
              busy={board.busyIds.has(order.id)}
              context={order.orderNo}
              onClick={() => void board.changeStatus(order, next)}
            >
              {ORDER_ACTION_LABELS[next] ?? next}
            </PrimaryAction>
          ) : (
            <p className="text-xs text-muted">
              {order.type === "DINE_IN"
                ? "Waiting for a waiter to serve it."
                : "Waiting for the customer to collect it at the counter."}
            </p>
          )
        }
      />
    );
  };

  return (
    <div>
      <BoardHeader
        eyebrow="Kitchen display"
        title="Kitchen board"
        description="Every dine-in and takeaway order from the moment it's placed until it's ready. Oldest orders first."
        lastSyncedAt={board.lastSyncedAt}
        onRefresh={board.refresh}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <FilterChips
            label="Order type"
            value={type}
            onChange={setType}
            options={[
              { value: "all", label: "All orders" },
              { value: "DINE_IN", label: "Dine in" },
              { value: "TAKEAWAY", label: "Takeaway" },
            ]}
          />
          <span className="hidden h-6 w-px bg-line-strong sm:block" aria-hidden />
          <FilterChips
            label="Station"
            value={station}
            onChange={setStation}
            options={[
              { value: "all", label: "All stations" },
              ...STATIONS.map((value) => ({
                value,
                label: STATION_LABELS[value],
                count: stationCounts.get(value) ?? 0,
              })),
            ]}
          />
        </div>
      </BoardHeader>

      <BoardAlerts
        loadError={board.loadError}
        actionError={board.actionError}
        onDismiss={board.dismissActionError}
      />
      <MissingNotice show={missing} what="order" />

      {board.orders === null ? (
        board.loadError ? null : (
          <BoardSkeleton />
        )
      ) : (
        <BoardColumns>
          <BoardColumn
            title="To start"
            hint="New dine-in orders and takeaway orders to accept"
            count={column(TO_START).length}
            attention
            empty="Nothing waiting. New orders appear here."
          >
            {column(TO_START).map(ticket)}
          </BoardColumn>
          <BoardColumn
            title="Cooking"
            hint="Mark each order ready when it leaves the pass"
            count={column(COOKING).length}
            attention
            empty="Nothing on the stove."
          >
            {column(COOKING).map(ticket)}
          </BoardColumn>
          <BoardColumn
            title="Ready"
            hint="Waiting for the waiter or the customer"
            count={column(READY).length}
            empty="No orders waiting to be handed over."
          >
            {column(READY).map(ticket)}
          </BoardColumn>
        </BoardColumns>
      )}
    </div>
  );
}
