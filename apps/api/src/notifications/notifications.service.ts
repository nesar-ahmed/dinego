import { HttpStatus, Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, type Repository } from "typeorm";
import {
  NOTIFICATION_RETENTION_DAYS,
  type MarkAllNotificationsReadInput,
  type MarkAllNotificationsReadResponse,
  type NotificationDeleteResponse,
  type NotificationErrorCode,
  type NotificationReadResponse,
  type NotificationsQuery,
  type NotificationsResponse,
  type NotificationUnreadCountResponse,
} from "@dinego/shared";
import { apiError } from "../common/errors/api-error.js";
import { Notification } from "./entities/notification.entity.js";
import { toNotificationItem } from "./notifications.mapper.js";

/** SQLite `datetime('now', ?)` modifier for the start of the retention window. */
export const RETENTION_WINDOW = `-${NOTIFICATION_RETENTION_DAYS} days`;

const notificationError = (status: HttpStatus, code: NotificationErrorCode, message: string) =>
  apiError(status, code, message);

const notFound = () =>
  notificationError(HttpStatus.NOT_FOUND, "NOTIFICATION_NOT_FOUND", "Notification not found");

/**
 * The signed-in user's notifications, for every account type (customers and all staff roles).
 *
 * Every query is limited to the user's own rows and to the retention window, so notifications
 * older than 7 days disappear immediately, even before the periodic purge deletes them. Writes
 * are single conditional statements (the SQLite connection is shared across requests).
 */
@Injectable()
export class NotificationsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
  ) {}

  /**
   * Newest first, with optional read-state and category filters. `beforeId` is a cursor for
   * "Show more"; the total counts every match regardless of it.
   */
  async list(userId: number, query: NotificationsQuery): Promise<NotificationsResponse> {
    const { page, pageSize } = query;
    const builder = this.notifications
      .createQueryBuilder("notification")
      .where("notification.recipientId = :userId", { userId })
      .andWhere("notification.createdAt > datetime('now', :window)", {
        window: RETENTION_WINDOW,
      });

    if (query.unread !== undefined) {
      builder.andWhere(
        query.unread ? "notification.readAt IS NULL" : "notification.readAt IS NOT NULL",
      );
    }

    if (query.category !== undefined) {
      builder.andWhere("notification.category = :category", { category: query.category });
    }

    if (query.entityType !== undefined && query.entityId !== undefined) {
      builder
        .andWhere("notification.entityType = :entityType", { entityType: query.entityType })
        .andWhere("notification.entityId = :entityId", { entityId: query.entityId });
    }

    const total = await builder.getCount();

    if (query.beforeId !== undefined) {
      builder.andWhere("notification.id < :beforeId", { beforeId: query.beforeId });
    }

    const rows = await builder
      .orderBy("notification.id", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();
    const { unreadCount } = await this.unreadCount(userId);

    return {
      notifications: rows.map(toNotificationItem),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      unreadCount,
    };
  }

  /** The badge count, and the newest id so clients can tell when something new arrived. */
  async unreadCount(userId: number): Promise<NotificationUnreadCountResponse> {
    const [row]: Array<{ unread: number | null; latest: number | null }> =
      await this.dataSource.query(
        `SELECT SUM(CASE WHEN "read_at" IS NULL THEN 1 ELSE 0 END) AS "unread",
                MAX("id") AS "latest"
         FROM "notifications"
         WHERE "recipient_id" = ? AND "created_at" > datetime('now', ?)`,
        [userId, RETENTION_WINDOW],
      );

    return {
      unreadCount: Number(row?.unread ?? 0),
      latestId: row?.latest === null || row?.latest === undefined ? null : Number(row.latest),
    };
  }

  /**
   * Marks one notification as read (the user opened it). Idempotent: the first read time is
   * kept. Another user's notification, or an expired one, is 404.
   */
  async markRead(userId: number, id: number): Promise<NotificationReadResponse> {
    const rows: Array<{ id: number }> = await this.dataSource.query(
      `UPDATE "notifications" SET "read_at" = COALESCE("read_at", datetime('now'))
       WHERE "id" = ? AND "recipient_id" = ? AND "created_at" > datetime('now', ?)
       RETURNING "id"`,
      [id, userId, RETENTION_WINDOW],
    );

    if (rows.length === 0) {
      throw notFound();
    }

    return this.readResponse(userId, id);
  }

  /**
   * Marks one notification as unread again, so it counts in the badge until the user opens it.
   * Idempotent. Another user's notification, or an expired one, is 404.
   */
  async markUnread(userId: number, id: number): Promise<NotificationReadResponse> {
    const rows: Array<{ id: number }> = await this.dataSource.query(
      `UPDATE "notifications" SET "read_at" = NULL
       WHERE "id" = ? AND "recipient_id" = ? AND "created_at" > datetime('now', ?)
       RETURNING "id"`,
      [id, userId, RETENTION_WINDOW],
    );

    if (rows.length === 0) {
      throw notFound();
    }

    return this.readResponse(userId, id);
  }

  /** Deletes one of the user's notifications for good. Another user's, or an expired one, is 404. */
  async remove(userId: number, id: number): Promise<NotificationDeleteResponse> {
    const rows: Array<{ id: number }> = await this.dataSource.query(
      `DELETE FROM "notifications"
       WHERE "id" = ? AND "recipient_id" = ? AND "created_at" > datetime('now', ?)
       RETURNING "id"`,
      [id, userId, RETENTION_WINDOW],
    );

    if (rows.length === 0) {
      throw notFound();
    }

    const { unreadCount } = await this.unreadCount(userId);
    return { unreadCount };
  }

  /**
   * Marks every unread notification as read, up to `upToId` when given, so one that arrived
   * after the user looked at the list stays unread.
   */
  async markAllRead(
    userId: number,
    input: MarkAllNotificationsReadInput,
  ): Promise<MarkAllNotificationsReadResponse> {
    const upToId = input.upToId ?? null;
    const rows: Array<{ id: number }> = await this.dataSource.query(
      `UPDATE "notifications" SET "read_at" = datetime('now')
       WHERE "recipient_id" = ? AND "read_at" IS NULL AND "created_at" > datetime('now', ?)
         AND (? IS NULL OR "id" <= ?)
       RETURNING "id"`,
      [userId, RETENTION_WINDOW, upToId, upToId],
    );
    const { unreadCount } = await this.unreadCount(userId);

    return { updated: rows.length, unreadCount };
  }

  /** The notification after a read-state change, with the new badge count. */
  private async readResponse(userId: number, id: number): Promise<NotificationReadResponse> {
    const notification = await this.notifications.findOneByOrFail({ id, recipientId: userId });
    const { unreadCount } = await this.unreadCount(userId);

    return { notification: toNotificationItem(notification), unreadCount };
  }
}
