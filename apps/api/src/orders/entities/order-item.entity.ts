import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { ItemStatus, Station } from "@dinego/shared";
import { MenuItem } from "../../menu/entities/menu-item.entity.js";
import { Order } from "./order.entity.js";

/** One ordered dish. Name and price are copied from the paid snapshot. */
@Entity({ name: "order_items" })
@Index("idx_order_items_order_id", ["orderId"])
@Index("idx_order_items_menu_item_id", ["menuItemId"])
@Check("chk_order_items_quantity", `"quantity" > 0`)
@Check("chk_order_items_unit_price_cents", `"unit_price_cents" >= 0`)
@Check(
  "chk_order_items_status",
  `"status" IN ('PENDING', 'FIRED', 'PREPARING', 'READY', 'SERVED', 'VOIDED')`,
)
@Check("chk_order_items_station", `"station" IN ('GRILL', 'COLD', 'BAR', 'DESSERT', 'OTHER')`)
export class OrderItem {
  @PrimaryGeneratedColumn({ type: "integer" })
  id!: number;

  @Column({ type: "integer", name: "order_id" })
  orderId!: number;

  @ManyToOne(() => Order, (order) => order.items, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "order_id", foreignKeyConstraintName: "fk_order_items_order" })
  order!: Order;

  @Column({ type: "integer", name: "menu_item_id" })
  menuItemId!: number;

  /** Menu items with order history cannot be deleted; mark them unavailable instead. */
  @ManyToOne(() => MenuItem, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "menu_item_id", foreignKeyConstraintName: "fk_order_items_menu_item" })
  menuItem!: MenuItem;

  @Column({ type: "text" })
  name!: string;

  @Column({ type: "integer" })
  quantity!: number;

  @Column({ type: "integer", name: "unit_price_cents" })
  unitPriceCents!: number;

  @Column({ type: "text", default: "PENDING" })
  status!: ItemStatus;

  /** Kitchen station that prepares the item. */
  @Column({ type: "text", default: "OTHER" })
  station!: Station;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @Column({ type: "datetime", name: "fired_at", nullable: true })
  firedAt!: Date | null;

  @Column({ type: "datetime", name: "ready_at", nullable: true })
  readyAt!: Date | null;

  @CreateDateColumn({ type: "datetime", name: "created_at" })
  createdAt!: Date;
}
