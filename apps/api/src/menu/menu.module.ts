import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MenuCategory } from "./entities/menu-category.entity.js";
import { MenuItem } from "./entities/menu-item.entity.js";
import { MenuController } from "./menu.controller.js";
import { MenuService } from "./menu.service.js";

@Module({
  imports: [TypeOrmModule.forFeature([MenuCategory, MenuItem])],
  controllers: [MenuController],
  providers: [MenuService],
})
export class MenuModule {}
