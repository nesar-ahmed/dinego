import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CartModule } from "./cart/cart.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./health/health.module.js";
import { MenuModule } from "./menu/menu.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { OrdersModule } from "./orders/orders.module.js";
import { PaymentsModule } from "./payments/payments.module.js";
import { StaffModule } from "./staff/staff.module.js";
import { TablesModule } from "./tables/tables.module.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    UsersModule,
    MenuModule,
    CartModule,
    TablesModule,
    PaymentsModule,
    OrdersModule,
    StaffModule,
    NotificationsModule,
    HealthModule,
  ],
})
export class AppModule {}
