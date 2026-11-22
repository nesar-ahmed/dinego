import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { runAtomically } from "../common/database/atomic.js";
import { NotificationPublisher } from "../notifications/notification-publisher.js";
import {
  ORDER_ACCEPTANCE_OVERDUE_MINUTES,
  orderStatusNotifications,
} from "../notifications/notifications.catalog.js";

/** How often waiting takeaway orders are checked. */
export const ORDER_ESCALATION_INTERVAL_MS = 60 * 1000;

/**
 * Alerts ADMIN and MANAGER when a takeaway order has waited more than 10 minutes to be accepted,
 * once per order (the dedupe key). Checked at startup and then every minute. Only orders from the
 * last day are checked, so an old order never alerts again after its notification expired.
 */
@Injectable()
export class OrderEscalation implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OrderEscalation.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notifications: NotificationPublisher,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.checkOverdue();
    this.timer = setInterval(() => void this.checkOverdue(), ORDER_ESCALATION_INTERVAL_MS);
    // Never keep the process alive just for this check.
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Alerts about every overdue order not alerted yet. Returns the notifications created. */
  async checkOverdue(): Promise<number> {
    try {
      const created = await runAtomically(this.dataSource, (db) => {
        const overdue = db
          .prepare(
            `SELECT o."id", o."order_no", o."pickup_code", o."total_cents",
                    CAST((julianday('now') - julianday(o."created_at")) * 1440 AS INTEGER) AS "minutes",
                    (SELECT COALESCE(SUM(i."quantity"), 0) FROM "order_items" AS i
                     WHERE i."order_id" = o."id") AS "items"
             FROM "orders" AS o
             WHERE o."type" = 'TAKEAWAY' AND o."status" IN ('PLACED', 'PAY_AT_PICKUP')
               AND o."created_at" <= datetime('now', ?)
               AND o."created_at" > datetime('now', '-1 day')`,
          )
          .all(`-${ORDER_ACCEPTANCE_OVERDUE_MINUTES} minutes`) as Array<{
          id: number;
          order_no: string;
          pickup_code: string | null;
          total_cents: number;
          minutes: number;
          items: number;
        }>;

        return this.notifications.writeAlongside(
          db,
          overdue.flatMap((order) =>
            orderStatusNotifications.acceptanceOverdue({
              orderId: order.id,
              orderNo: order.order_no,
              pickupCode: order.pickup_code,
              itemCount: Number(order.items),
              totalCents: order.total_cents,
              minutesWaiting: Number(order.minutes),
            }),
          ),
        );
      });

      if (created > 0) {
        this.logger.log(`Alerted staff about takeaway orders waiting to be accepted (${created})`);
      }

      return created;
    } catch (error) {
      this.logger.error(
        "Could not check for takeaway orders waiting to be accepted; will retry.",
        error instanceof Error ? error.stack : String(error),
      );
      return 0;
    }
  }
}
