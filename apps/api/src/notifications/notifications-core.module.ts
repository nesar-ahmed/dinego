import { Module } from "@nestjs/common";
import { NotificationPublisher } from "./notification-publisher.js";

/**
 * The notification writer, with no dependencies of its own, so any feature module (users,
 * orders, payments, tables) can import it without an import cycle. The HTTP API lives in
 * NotificationsModule, which needs UsersModule for its guards.
 */
@Module({
  providers: [NotificationPublisher],
  exports: [NotificationPublisher],
})
export class NotificationsCoreModule {}
