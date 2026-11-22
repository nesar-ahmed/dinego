import {
  ORDERABLE_TABLE_STATUSES,
  type DiningTable as DiningTableDto,
  type PublicTable,
  type TableStatus,
} from "@dinego/shared";
import { DiningTable } from "./entities/dining-table.entity.js";

/** A customer can check out to a table only while it is active and FREE or OCCUPIED. */
export function isOrderable(table: Pick<DiningTable, "active" | "status">): boolean {
  return (
    table.active && (ORDERABLE_TABLE_STATUSES as readonly TableStatus[]).includes(table.status)
  );
}

export function toTableDto(table: DiningTable): DiningTableDto {
  return {
    id: table.id,
    label: table.label,
    seats: table.seats,
    zone: table.zone,
    status: table.status,
    active: table.active,
    createdAt: table.createdAt.toISOString(),
    updatedAt: table.updatedAt.toISOString(),
  };
}

/** Customer view: no raw floor status, only whether the table can be chosen. */
export function toPublicTable(table: DiningTable): PublicTable {
  return {
    id: table.id,
    label: table.label,
    seats: table.seats,
    zone: table.zone,
    orderable: isOrderable(table),
  };
}

const labelCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** Natural label order (T2 before T10), so lists read like the floor plan. */
export function compareTables(a: DiningTable, b: DiningTable): number {
  return labelCollator.compare(a.label, b.label) || a.id - b.id;
}
