import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Order } from "../orders/entities/order.entity.js";
import { DiningTable } from "../tables/entities/dining-table.entity.js";
import { UsersModule } from "../users/users.module.js";
import { StaffDashboardController } from "./staff-dashboard.controller.js";
import { StaffDashboardService } from "./staff-dashboard.service.js";

/** Read models for the kitchen, waiter, and cashier dashboards (and admins and managers). */
@Module({
  imports: [TypeOrmModule.forFeature([Order, DiningTable]), UsersModule],
  controllers: [StaffDashboardController],
  providers: [StaffDashboardService],
})
export class StaffModule {}
