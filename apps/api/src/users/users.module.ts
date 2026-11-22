import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { NotificationsCoreModule } from "../notifications/notifications-core.module.js";
import { User } from "./entities/user.entity.js";
import { CustomerGuard } from "./guards/customer.guard.js";
import { JwtAuthGuard } from "./guards/jwt-auth.guard.js";
import { RolesGuard } from "./guards/roles.guard.js";
import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    NotificationsCoreModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_SECRET") ?? "dinego-local-dev-secret",
        signOptions: {
          expiresIn: Number(config.get<string>("JWT_EXPIRES_IN_SECONDS") ?? 604800),
        },
      }),
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService, JwtAuthGuard, RolesGuard, CustomerGuard],
  exports: [UsersService, JwtAuthGuard, RolesGuard, CustomerGuard, JwtModule],
})
export class UsersModule {}
