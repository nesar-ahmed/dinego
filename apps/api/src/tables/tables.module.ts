import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { NotificationsCoreModule } from "../notifications/notifications-core.module.js";
import { UsersModule } from "../users/users.module.js";
import { DiningTable } from "./entities/dining-table.entity.js";
import { FloorController } from "./floor.controller.js";
import { TablesController } from "./tables.controller.js";
import { TablesService } from "./tables.service.js";

@Module({
  imports: [TypeOrmModule.forFeature([DiningTable]), UsersModule, NotificationsCoreModule],
  controllers: [TablesController, FloorController],
  providers: [TablesService],
  exports: [TablesService],
})
export class TablesModule {}
