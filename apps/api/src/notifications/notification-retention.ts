import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { NOTIFICATION_RETENTION_DAYS } from "@dinego/shared";
import { RETENTION_WINDOW } from "./notifications.service.js";

/** How often expired notifications are deleted while the API runs. */
export const NOTIFICATION_PURGE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Deletes notifications older than the 7-day retention window: once at startup, then hourly.
 * Reads already hide expired rows, so the purge only reclaims space and timing is not critical.
 */
@Injectable()
export class NotificationRetention implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(NotificationRetention.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.purgeExpired();
    this.timer = setInterval(() => void this.purgeExpired(), NOTIFICATION_PURGE_INTERVAL_MS);
    // Never keep the process alive just for the purge.
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One DELETE statement. Returns how many notifications were removed; never throws. */
  async purgeExpired(): Promise<number> {
    try {
      const rows: unknown[] = await this.dataSource.query(
        `DELETE FROM "notifications" WHERE "created_at" <= datetime('now', ?) RETURNING "id"`,
        [RETENTION_WINDOW],
      );

      if (rows.length > 0) {
        this.logger.log(
          `Deleted ${rows.length} notification(s) older than ${NOTIFICATION_RETENTION_DAYS} days`,
        );
      }

      return rows.length;
    } catch (error) {
      this.logger.error(
        "Could not delete expired notifications; will retry at the next purge.",
        error instanceof Error ? error.stack : String(error),
      );
      return 0;
    }
  }
}
