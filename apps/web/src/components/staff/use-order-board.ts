"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { OrderStatus, StaffBoardOrder } from "@dinego/shared";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { ApiError } from "@/lib/api";
import { fetchStaffBoard, orderActionError, updateOrderStatus } from "@/lib/staff-orders";

/** How often a board reloads while visible. Status changes by others rarely notify this role. */
export const BOARD_REFRESH_MS = 15_000;

export type OrderBoard = {
  /** The signed-in role's orders, oldest first, each with its `actions`. Null until loaded. */
  orders: StaffBoardOrder[] | null;
  /** The board could not be (re)loaded. The last loaded orders stay visible. */
  loadError: string | null;
  /** The last action failed (for example, someone else moved the order first). */
  actionError: string | null;
  dismissActionError: () => void;
  /** Orders with a change on its way: their buttons show "Saving…" until the board reloads. */
  busyIds: ReadonlySet<number>;
  lastSyncedAt: number | null;
  refresh: () => Promise<void>;
  /** Moves an order on (one of its `actions`). Resolves true when the server accepted it. */
  changeStatus: (order: StaffBoardOrder, status: OrderStatus, reason?: string) => Promise<boolean>;
};

/**
 * The signed-in staff member's board (`GET /staff/board`): which orders it shows and what may be
 * done with each come from the server. Reloads every BOARD_REFRESH_MS while the page is visible,
 * as soon as it becomes visible, when a notification arrives, and right after each change.
 */
export function useOrderBoard(): OrderBoard {
  const router = useRouter();
  const { subscribe } = useNotifications();
  const [orders, setOrders] = useState<StaffBoardOrder[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<ReadonlySet<number>>(new Set());
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  // Only the latest load may update the board: an older answer never replaces a newer one.
  const generation = useRef(0);

  const toLogin = useCallback(() => {
    router.replace(
      `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
    );
  }, [router]);

  const refresh = useCallback(async () => {
    const id = ++generation.current;

    try {
      const board = await fetchStaffBoard();
      if (id !== generation.current) return;

      setOrders(board.orders);
      setLoadError(
        board.hasMore ? "Only the oldest orders are shown: there are too many to list." : null,
      );
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
          : "We couldn't refresh the orders. Retrying shortly.",
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

  const changeStatus = useCallback(
    async (order: StaffBoardOrder, status: OrderStatus, reason?: string) => {
      setActionError(null);
      setBusyIds((current) => new Set(current).add(order.id));

      try {
        await updateOrderStatus(order.id, status, reason);
        // The order's new place and actions come from the server.
        await refresh();
        return true;
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          toLogin();
          return false;
        }
        setActionError(orderActionError(cause, order.orderNo));
        if (cause instanceof ApiError && (cause.status === 409 || cause.status === 404)) {
          void refresh();
        }
        return false;
      } finally {
        setBusyIds((current) => {
          const next = new Set(current);
          next.delete(order.id);
          return next;
        });
      }
    },
    [refresh, toLogin],
  );

  const dismissActionError = useCallback(() => setActionError(null), []);

  return {
    orders,
    loadError,
    actionError,
    dismissActionError,
    busyIds,
    lastSyncedAt,
    refresh,
    changeStatus,
  };
}
