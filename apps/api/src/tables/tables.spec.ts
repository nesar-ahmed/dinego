import {
  canChangeTableStatus,
  createTableSchema,
  TABLE_MAX_SEATS,
  TABLE_STATUSES,
  updateTableSchema,
} from "@dinego/shared";
import { describe, expect, it } from "vitest";
import { DiningTable } from "./entities/dining-table.entity.js";
import { compareTables, isOrderable, toPublicTable } from "./tables.mapper.js";

function table(overrides: Partial<DiningTable>): DiningTable {
  return Object.assign(new DiningTable(), {
    id: 1,
    label: "T1",
    seats: 4,
    zone: null,
    status: "FREE",
    active: true,
    createdAt: new Date("2026-11-16T09:00:00Z"),
    updatedAt: new Date("2026-11-16T09:00:00Z"),
    ...overrides,
  });
}

describe("table status rules", () => {
  it("allows the floor transitions and repeating the current status", () => {
    expect(canChangeTableStatus("FREE", "OCCUPIED")).toBe(true);
    expect(canChangeTableStatus("OCCUPIED", "BILL_REQUESTED")).toBe(true);
    expect(canChangeTableStatus("BILL_REQUESTED", "CLEANING")).toBe(true);
    expect(canChangeTableStatus("CLEANING", "FREE")).toBe(true);
    expect(canChangeTableStatus("RESERVED", "OCCUPIED")).toBe(true);
    for (const status of TABLE_STATUSES) {
      expect(canChangeTableStatus(status, status)).toBe(true);
    }
  });

  it("rejects transitions that skip the floor flow", () => {
    expect(canChangeTableStatus("CLEANING", "OCCUPIED")).toBe(false);
    expect(canChangeTableStatus("OCCUPIED", "RESERVED")).toBe(false);
    expect(canChangeTableStatus("FREE", "BILL_REQUESTED")).toBe(false);
  });

  it("lets customers choose only active FREE or OCCUPIED tables", () => {
    expect(isOrderable(table({ status: "FREE" }))).toBe(true);
    expect(isOrderable(table({ status: "OCCUPIED" }))).toBe(true);
    for (const status of ["RESERVED", "CLEANING", "BILL_REQUESTED"] as const) {
      expect(isOrderable(table({ status }))).toBe(false);
    }
    expect(isOrderable(table({ status: "FREE", active: false }))).toBe(false);
  });

  it("hides the floor status from customers", () => {
    expect(toPublicTable(table({ status: "CLEANING", zone: "Window" }))).toEqual({
      id: 1,
      label: "T1",
      seats: 4,
      zone: "Window",
      orderable: false,
    });
  });

  it("sorts labels naturally", () => {
    const sorted = [table({ id: 3, label: "T10" }), table({ id: 2, label: "T2" })]
      .sort(compareTables)
      .map((entry) => entry.label);
    expect(sorted).toEqual(["T2", "T10"]);
  });
});

describe("table request schemas", () => {
  it("trims input, defaults the zone, and turns an empty zone into null", () => {
    expect(createTableSchema.parse({ label: " T9 ", seats: 4 })).toEqual({
      label: "T9",
      seats: 4,
      zone: null,
    });
    expect(createTableSchema.parse({ label: "T9", seats: 4, zone: "  " }).zone).toBeNull();
  });

  it("rejects invalid labels and seat counts", () => {
    for (const label of ["", "   ", "-T1", "T1!", "x".repeat(21)]) {
      expect(createTableSchema.safeParse({ label, seats: 2 }).success).toBe(false);
    }
    for (const seats of [0, -1, 2.5, TABLE_MAX_SEATS + 1, "4"]) {
      expect(createTableSchema.safeParse({ label: "T1", seats }).success).toBe(false);
    }
    expect(createTableSchema.safeParse({ label: "T1", seats: 2, status: "FREE" }).success).toBe(
      false,
    );
  });

  it("requires at least one field when updating", () => {
    expect(updateTableSchema.safeParse({}).success).toBe(false);
    expect(updateTableSchema.parse({ active: false })).toEqual({ active: false });
    expect(updateTableSchema.safeParse({ status: "FREE" }).success).toBe(false);
  });
});
