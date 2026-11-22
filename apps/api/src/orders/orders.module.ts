import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Payment } from "../payments/entities/payment.entity.js";
import { NotificationsCoreModule } from "../notifications/notifications-core.module.js";
import { PaymentsModule } from "../payments/payments.module.js";
import { UsersModule } from "../users/users.module.js";
import { OrderItem } from "./entities/order-item.entity.js";
import { Order } from "./entities/order.entity.js";
import { OrderEscalation } from "./order-escalation.js";
import { OrdersController } from "./orders.controller.js";
import { OrdersService } from "./orders.service.js";
import { StaffOrdersController } from "./staff-orders.controller.js";
import { StaffOrdersService } from "./staff-orders.service.js";

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Payment]),
    UsersModule,
    PaymentsModule,
    NotificationsCoreModule,
  ],
  controllers: [OrdersController, StaffOrdersController],
  providers: [OrdersService, StaffOrdersService, OrderEscalation],
})
export class OrdersModule {}
