import { HttpStatus, Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, type Repository } from "typeorm";
import {
  canChangeTableStatus,
  type CreateTableInput,
  type FloorTablesResponse,
  type PublicTablesResponse,
  type TableErrorCode,
  type TableResponse,
  type TableStatus,
  type UpdateTableInput,
} from "@dinego/shared";
import { runAtomically, type AtomicDatabase } from "../common/database/atomic.js";
import { apiError, isUniqueViolation } from "../common/errors/api-error.js";
import { NotificationPublisher } from "../notifications/notification-publisher.js";
import { floorNotifications, type TableFacts } from "../notifications/notifications.catalog.js";
import { DiningTable } from "./entities/dining-table.entity.js";
import { compareTables, toPublicTable, toTableDto } from "./tables.mapper.js";

const tableError = (status: HttpStatus, code: TableErrorCode, message: string) =>
  apiError(status, code, message);

interface TableRow {
  id: number;
  label: string;
  seats: number;
  zone: string | null;
  status: TableStatus;
  active: number;
}

const SELECT_TABLE = `SELECT "id", "label", "seats", "zone", "status", "active" FROM "dining_tables" WHERE "id" = ?`;

function factsOf(table: Pick<TableRow, "id" | "label" | "seats" | "zone">): TableFacts {
  return { tableId: table.id, label: table.label, seats: table.seats, zone: table.zone };
}

/**
 * Dining tables: the public list customers choose from, and floor management for staff.
 *
 * Concurrency: the better-sqlite3 driver shares one query runner across requests, so every write
 * is either ONE SQL statement with its rule in the WHERE clause (create, delete), or a synchronous
 * `runAtomically` transaction that reads the table, applies the rule, writes, and notifies staff
 * (status changes and edits, which need the previous state to know what changed).
 *
 * Staff are notified of bill requests (CASHIER, WAITER), tables to clean (WAITER), and layout
 * changes (ADMIN, MANAGER); the person who made the change is never notified.
 */
@Injectable()
export class TablesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(DiningTable) private readonly tables: Repository<DiningTable>,
    private readonly notifications: NotificationPublisher,
  ) {}

  /** Active tables for the dine-in picker, with whether each can be chosen right now. */
  async listPublic(): Promise<PublicTablesResponse> {
    const tables = await this.tables.find({ where: { active: true } });
    return { tables: tables.sort(compareTables).map(toPublicTable) };
  }

  /** Every table, including inactive ones, for the staff floor view. */
  async listFloor(): Promise<FloorTablesResponse> {
    const tables = await this.tables.find();
    return { tables: tables.sort(compareTables).map(toTableDto) };
  }

  async getTable(id: number): Promise<TableResponse> {
    return { table: toTableDto(await this.findOrThrow(id)) };
  }

  /** Adds a FREE, active table. Labels are unique regardless of case, checked atomically. */
  async create(input: CreateTableInput, actorId: number): Promise<TableResponse> {
    let rows: Array<{ id: number }>;

    try {
      rows = await this.dataSource.query(
        `INSERT INTO "dining_tables" ("label", "seats", "zone")
         SELECT ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM "dining_tables" WHERE "label" = ? COLLATE NOCASE)
         RETURNING "id"`,
        [input.label, input.seats, input.zone, input.label],
      );
    } catch (error) {
      throw this.mapUniqueLabel(error, input.label);
    }

    if (rows.length === 0) {
      throw this.labelTaken(input.label);
    }

    await this.notifications.publish(
      floorNotifications.layoutChanged(
        { tableId: rows[0].id, label: input.label, seats: input.seats, zone: input.zone },
        "ADDED",
        actorId,
      ),
    );

    return this.getTable(rows[0].id);
  }

  /**
   * Updates details. Deactivating requires the table to be FREE, and labels stay unique
   * regardless of case, both checked in the same transaction. Taking a table out of service, or
   * back, notifies ADMIN and MANAGER.
   */
  async update(id: number, input: UpdateTableInput, actorId: number): Promise<TableResponse> {
    const assignments: string[] = [];
    const values: unknown[] = [];

    if (input.label !== undefined) {
      assignments.push(`"label" = ?`);
      values.push(input.label);
    }
    if (input.seats !== undefined) {
      assignments.push(`"seats" = ?`);
      values.push(input.seats);
    }
    if (input.zone !== undefined) {
      assignments.push(`"zone" = ?`);
      values.push(input.zone);
    }
    if (input.active !== undefined) {
      assignments.push(`"active" = ?`);
      values.push(input.active ? 1 : 0);
    }

    const deactivating = input.active === false;
    const label = input.label ?? null;

    await runAtomically(this.dataSource, (db) => {
      const before = db.prepare(SELECT_TABLE).get(id) as TableRow | undefined;

      if (!before) {
        throw this.notFound();
      }

      let rows: unknown[];

      try {
        rows = db
          .prepare(
            `UPDATE "dining_tables"
             SET ${assignments.join(", ")}, "updated_at" = datetime('now')
             WHERE "id" = ?
               AND (? = 0 OR "active" = 0 OR "status" = 'FREE')
               AND (? IS NULL OR NOT EXISTS (
                 SELECT 1 FROM "dining_tables" AS "other"
                 WHERE "other"."label" = ? COLLATE NOCASE AND "other"."id" <> ?
               ))
             RETURNING "id"`,
          )
          .all(...values, id, deactivating ? 1 : 0, label, label, id);
      } catch (error) {
        throw this.mapUniqueLabel(error, input.label ?? "");
      }

      if (rows.length === 0) {
        if (label !== null && this.labelInUseSync(db, label, id)) {
          throw this.labelTaken(label);
        }

        throw tableError(
          HttpStatus.CONFLICT,
          "TABLE_IN_USE",
          `Table ${before.label} is ${before.status}; set it to FREE before taking it out of service`,
        );
      }

      if (input.active !== undefined && Boolean(before.active) !== input.active) {
        const after = db.prepare(SELECT_TABLE).get(id) as TableRow;
        this.notifications.writeAlongside(
          db,
          floorNotifications.layoutChanged(
            factsOf(after),
            input.active ? "BACK_IN_SERVICE" : "OUT_OF_SERVICE",
            actorId,
          ),
        );
      }
    });

    return this.getTable(id);
  }

  /**
   * Manual status change by staff, e.g. seating a walk-in or marking a table for cleaning.
   * Only transitions in TABLE_STATUS_TRANSITIONS are allowed; repeating the current status is a
   * no-op, so double taps are safe. A bill request notifies CASHIER and WAITER staff; a table to
   * clean notifies WAITER staff.
   */
  async changeStatus(id: number, status: TableStatus, actorId: number): Promise<TableResponse> {
    await runAtomically(this.dataSource, (db) => {
      const table = db.prepare(SELECT_TABLE).get(id) as TableRow | undefined;

      if (!table) {
        throw this.notFound();
      }

      if (!table.active) {
        throw tableError(
          HttpStatus.CONFLICT,
          "TABLE_INACTIVE",
          `Table ${table.label} is out of service; reactivate it first`,
        );
      }

      if (!canChangeTableStatus(table.status, status)) {
        throw tableError(
          HttpStatus.CONFLICT,
          "INVALID_STATUS_TRANSITION",
          `Table ${table.label} cannot change from ${table.status} to ${status}`,
        );
      }

      if (table.status === status) {
        return;
      }

      db.prepare(
        `UPDATE "dining_tables" SET "status" = ?, "updated_at" = datetime('now') WHERE "id" = ?`,
      ).run(status, id);

      if (status === "BILL_REQUESTED") {
        this.notifications.writeAlongside(
          db,
          floorNotifications.billRequested(factsOf(table), actorId),
        );
      } else if (status === "CLEANING") {
        this.notifications.writeAlongside(
          db,
          floorNotifications.needsCleaning(factsOf(table), actorId),
        );
      }
    });

    return this.getTable(id);
  }

  /**
   * Deletes a table created by mistake. Tables that are not FREE or that have order or payment
   * history cannot be deleted; deactivate them instead so their history is kept.
   */
  async remove(id: number, actorId: number): Promise<void> {
    const rows: Array<Pick<TableRow, "id" | "label" | "seats" | "zone">> =
      await this.dataSource.query(
        `DELETE FROM "dining_tables"
       WHERE "id" = ?
         AND "status" = 'FREE'
         AND NOT EXISTS (SELECT 1 FROM "orders" WHERE "table_id" = "dining_tables"."id")
         AND NOT EXISTS (SELECT 1 FROM "payments" WHERE "table_id" = "dining_tables"."id")
       RETURNING "id", "label", "seats", "zone"`,
        [id],
      );

    if (rows.length === 0) {
      const table = await this.findOrThrow(id);
      throw tableError(
        HttpStatus.CONFLICT,
        "TABLE_IN_USE",
        table.status === "FREE"
          ? `Table ${table.label} has order or payment history; deactivate it instead`
          : `Table ${table.label} is ${table.status}; only FREE tables can be deleted`,
      );
    }

    await this.notifications.publish(
      floorNotifications.layoutChanged(factsOf(rows[0]), "REMOVED", actorId),
    );
  }

  private async findOrThrow(id: number): Promise<DiningTable> {
    const table = await this.tables.findOne({ where: { id } });

    if (!table) {
      throw this.notFound();
    }

    return table;
  }

  private notFound() {
    return tableError(HttpStatus.NOT_FOUND, "TABLE_NOT_FOUND", "Table not found");
  }

  private labelInUseSync(db: AtomicDatabase, label: string, exceptId: number): boolean {
    return (
      db
        .prepare(
          `SELECT 1 FROM "dining_tables" WHERE "label" = ? COLLATE NOCASE AND "id" <> ? LIMIT 1`,
        )
        .get(label, exceptId) !== undefined
    );
  }

  private labelTaken(label: string) {
    return tableError(
      HttpStatus.CONFLICT,
      "TABLE_LABEL_TAKEN",
      `A table labelled ${label} already exists`,
    );
  }

  /** The exact-match unique index is the safety net behind the case-insensitive check. */
  private mapUniqueLabel(error: unknown, label: string): unknown {
    return isUniqueViolation(error) ? this.labelTaken(label) : error;
  }
}
