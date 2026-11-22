import {
  staffFloorResponseSchema,
  tableResponseSchema,
  type DiningTable,
  type StaffFloorTable,
  type TableStatus,
} from "@dinego/shared";
import { ApiError, apiRequest } from "./api";

/**
 * `GET /staff/floor`: every table with its open dine-in orders and the status changes allowed
 * now (`actions`: no cleaning or freeing while guests have open orders).
 */
export async function fetchStaffFloor(signal?: AbortSignal): Promise<StaffFloorTable[]> {
  const parsed = staffFloorResponseSchema.safeParse(
    await apiRequest<unknown>("/staff/floor", { signal }),
  );
  if (!parsed.success) {
    throw new ApiError("The floor response did not match the shared contract.", 0);
  }
  return parsed.data.tables;
}

/** `PATCH /floor/tables/:id/status`. Setting CLEANING notifies the other waiters. */
export async function updateTableStatus(id: number, status: TableStatus): Promise<DiningTable> {
  const parsed = tableResponseSchema.safeParse(
    await apiRequest<unknown>(`/floor/tables/${id}/status`, { method: "PATCH", body: { status } }),
  );
  if (!parsed.success) {
    throw new ApiError("The table response did not match the shared contract.", 0);
  }
  return parsed.data.table;
}

export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  FREE: "Free",
  OCCUPIED: "Occupied",
  BILL_REQUESTED: "Bill requested",
  CLEANING: "Needs cleaning",
  RESERVED: "Reserved",
};

export function tableActionError(error: unknown, label: string): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return error.message;
    if (error.code === "INVALID_STATUS_TRANSITION") {
      return `Table ${label} was already changed by someone else. The floor has been refreshed.`;
    }
    if (error.code === "TABLE_INACTIVE") return `Table ${label} is out of service.`;
    if (error.code === "TABLE_NOT_FOUND") return `Table ${label} no longer exists.`;
  }
  return `We couldn't update table ${label}. Please try again.`;
}
