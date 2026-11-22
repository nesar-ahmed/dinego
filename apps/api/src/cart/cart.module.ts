import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MenuItem } from "../menu/entities/menu-item.entity.js";
import { User } from "../users/entities/user.entity.js";
import { UsersModule } from "../users/users.module.js";
import { CartController } from "./cart.controller.js";
import { CartService } from "./cart.service.js";
import { CartItem } from "./entities/cart-item.entity.js";
import { Cart } from "./entities/cart.entity.js";

@Module({
  imports: [TypeOrmModule.forFeature([Cart, CartItem, MenuItem, User]), UsersModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
