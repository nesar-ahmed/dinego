import type { NotificationItem } from "@dinego/shared";
import type { Notification } from "./entities/notification.entity.js";

/** The recipient's view of a notification. The recipient id and dedupe key stay internal. */
export function toNotificationItem(notification: Notification): NotificationItem {
  return {
    id: notification.id,
    type: notification.type,
    category: notification.category,
    priority: notification.priority,
    title: notification.title,
    body: notification.body,
    link: notification.link,
    entityType: notification.entityType,
    entityId: notification.entityId,
    data: notification.data,
    read: notification.readAt !== null,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}
