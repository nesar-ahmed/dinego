import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CartModule } from "../cart/cart.module.js";
import { NotificationsCoreModule } from "../notifications/notifications-core.module.js";
import { DiningTable } from "../tables/entities/dining-table.entity.js";
import { UsersModule } from "../users/users.module.js";
import { Payment } from "./entities/payment.entity.js";
import { PaymentsController } from "./payments.controller.js";
import { PaymentsService } from "./payments.service.js";
import { PaymentProvider } from "./providers/payment-provider.js";
import { SimulatedPaymentProvider } from "./providers/simulated-payment.provider.js";

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, DiningTable]),
    UsersModule,
    CartModule,
    NotificationsCoreModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    // Dummy payments only: no real money is charged.
    { provide: PaymentProvider, useClass: SimulatedPaymentProvider },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
