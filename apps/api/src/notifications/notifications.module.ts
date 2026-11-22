import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UsersModule } from "../users/users.module.js";
import { Notification } from "./entities/notification.entity.js";
import { NotificationRetention } from "./notification-retention.js";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";

/** The notifications HTTP API and the retention purge. Writing lives in NotificationsCoreModule. */
@Module({
  imports: [TypeOrmModule.forFeature([Notification]), UsersModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationRetention],
})
export class NotificationsModule {}
