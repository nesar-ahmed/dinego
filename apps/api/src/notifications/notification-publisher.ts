import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { runAtomically, type AtomicDatabase } from "../common/database/atomic.js";
import { NOTIFICATION_TYPE_META, type NotificationDraft } from "./notifications.catalog.js";

const COLUMNS = `"recipient_id", "type", "category", "priority", "title", "body", "link",
  "entity_type", "entity_id", "data", "dedupe_key"`;

/**
 * One statement per draft. Recipients are selected from `users` inside the INSERT, so the fan-out
 * to every matching account is atomic, only ACTIVE accounts are notified, and a duplicate event
 * (same recipient and dedupe key) is skipped by ON CONFLICT. Roles arrive as a JSON array
 * (`json_each`), which keeps the SQL static for the prepared-statement cache. (SQLite needs the
 * WHERE on a SELECT that is followed by ON CONFLICT.)
 */
const INSERT_FOR_USER = `
  INSERT INTO "notifications" (${COLUMNS})
  SELECT "id", ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  FROM "users"
  WHERE "id" = ? AND "active" = 1
  ON CONFLICT ("recipient_id", "dedupe_key") DO NOTHING`;

const INSERT_FOR_ROLES = `
  INSERT INTO "notifications" (${COLUMNS})
  SELECT "id", ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  FROM "users"
  WHERE "active" = 1
    AND "role" IN (SELECT "value" FROM json_each(?))
    AND (? IS NULL OR "id" <> ?)
  ON CONFLICT ("recipient_id", "dedupe_key") DO NOTHING`;

/**
 * Creates in-app notifications. The only writer of the `notifications` table.
 *
 * - `writeAlongside` runs inside a transaction the caller already holds (`runAtomically`), in a
 *   SAVEPOINT: the notifications commit exactly when the caller's change does (an order and its
 *   "order placed" notifications), yet a notification failure never undoes that change.
 * - `publish` runs after the change was saved, in a transaction of its own (a welcome message
 *   after registration, a payment-provider alert).
 * - `write` is the strict building block: it throws, so the caller's transaction rolls back.
 */
@Injectable()
export class NotificationPublisher {
  private readonly logger = new Logger(NotificationPublisher.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Writes the drafts with the caller's transaction. Synchronous; throws on failure so the
   * caller's whole transaction rolls back. Returns the number of notifications created.
   */
  write(db: AtomicDatabase, drafts: readonly NotificationDraft[]): number {
    let created = 0;

    for (const draft of drafts) {
      const { category, priority } = NOTIFICATION_TYPE_META[draft.type];
      const values = [
        draft.type,
        category,
        priority,
        draft.title,
        draft.body,
        draft.link,
        draft.entity?.type ?? null,
        draft.entity?.id ?? null,
        draft.data === null ? null : JSON.stringify(draft.data),
        draft.dedupeKey,
      ];
      const { audience } = draft;

      created +=
        audience.kind === "user"
          ? db.prepare(INSERT_FOR_USER).run(...values, audience.userId).changes
          : db
              .prepare(INSERT_FOR_ROLES)
              .run(
                ...values,
                JSON.stringify(audience.roles),
                audience.excludeUserId ?? null,
                audience.excludeUserId ?? null,
              ).changes;
    }

    return created;
  }

  /**
   * Writes the drafts with the caller's transaction, inside a SAVEPOINT. They commit (or roll back)
   * with the caller's work; if writing them fails, only the notifications are rolled back and the
   * error is logged, so the caller's change (for example a paid order) always goes through.
   * Synchronous, for use inside `runAtomically`. Returns the number of notifications created.
   */
  writeAlongside(db: AtomicDatabase, drafts: readonly NotificationDraft[]): number {
    if (drafts.length === 0) {
      return 0;
    }

    db.prepare(`SAVEPOINT "notifications"`).run();

    try {
      const created = this.write(db, drafts);
      db.prepare(`RELEASE "notifications"`).run();
      return created;
    } catch (error) {
      db.prepare(`ROLLBACK TO "notifications"`).run();
      db.prepare(`RELEASE "notifications"`).run();
      this.logFailure(drafts, error);
      return 0;
    }
  }

  /**
   * Writes the drafts in one atomic transaction of their own, after the triggering change was
   * saved. Never throws: a failure is logged and the user's request still succeeds.
   */
  async publish(drafts: readonly NotificationDraft[]): Promise<number> {
    if (drafts.length === 0) {
      return 0;
    }

    try {
      return await runAtomically(this.dataSource, (db) => this.write(db, drafts));
    } catch (error) {
      this.logFailure(drafts, error);
      return 0;
    }
  }

  private logFailure(drafts: readonly NotificationDraft[], error: unknown): void {
    const types = [...new Set(drafts.map((draft) => draft.type))].join(", ");
    this.logger.error(
      `Could not create ${types} notification(s); the triggering change was kept.`,
      error instanceof Error ? error.stack : String(error),
    );
  }
}
