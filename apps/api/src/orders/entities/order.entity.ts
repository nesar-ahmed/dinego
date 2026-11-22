import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { OrderStatus, OrderType } from "@dinego/shared";
import { DiningTable } from "../../tables/entities/dining-table.entity.js";
import { User } from "../../users/entities/user.entity.js";
import { OrderItem } from "./order-item.entity.js";

/**
 * A placed order. Customer orders are created at checkout from a successful payment's snapshot,
 * so lines and totals always equal what was charged. Orders are never deleted.
 */
@Entity({ name: "orders" })
@Index("uq_orders_order_no", ["orderNo"], { unique: true })
@Index("idx_orders_customer_id", ["customerId"])
@Index("idx_orders_table_id", ["tableId"])
@Index("idx_orders_status", ["status"])
@Check("chk_orders_type", `"type" IN ('DINE_IN', 'TAKEAWAY')`)
@Check(
  "chk_orders_table",
  `("type" = 'DINE_IN' AND "table_id" IS NOT NULL) OR ("type" = 'TAKEAWAY' AND "table_id" IS NULL)`,
)
@Check(
  "chk_orders_status",
  `"status" IN ('OPEN', 'SENT', 'IN_PROGRESS', 'READY', 'SERVED', 'BILL_REQUESTED', 'PAID', 'CLOSED', 'PLACED', 'PAY_AT_PICKUP', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'COLLECTED', 'CANCELLED', 'REJECTED', 'NO_SHOW')`,
)
@Check(
  "chk_orders_amounts",
  `"subtotal_cents" >= 0 AND "tax_cents" >= 0 AND "tip_cents" >= 0 AND "total_cents" = "subtotal_cents" + "tax_cents" + "tip_cents"`,
)
export class Order {
  @PrimaryGeneratedColumn({ type: "integer" })
  id!: number;

  /** Human-friendly number, e.g. `DG-00042`. */
  @Column({ type: "text", name: "order_no" })
  orderNo!: string;

  @Column({ type: "text" })
  type!: OrderType;

  @Column({ type: "text" })
  status!: OrderStatus;

  @Column({ type: "integer", name: "table_id", nullable: true })
  tableId!: number | null;

  @ManyToOne(() => DiningTable, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "table_id", foreignKeyConstraintName: "fk_orders_table" })
  table!: DiningTable | null;

  @Column({ type: "integer", name: "customer_id", nullable: true })
  customerId!: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "customer_id", foreignKeyConstraintName: "fk_orders_customer" })
  customer!: User | null;

  /** Requested takeaway pickup time; null means as soon as possible. */
  @Column({ type: "datetime", name: "pickup_time", nullable: true })
  pickupTime!: Date | null;

  /** Takeaway only: short code the customer shows at pickup. */
  @Column({ type: "text", name: "pickup_code", nullable: true })
  pickupCode!: string | null;

  @Column({ type: "integer", name: "subtotal_cents" })
  subtotalCents!: number;

  @Column({ type: "integer", name: "tax_cents" })
  taxCents!: number;

  @Column({ type: "integer", name: "tip_cents" })
  tipCents!: number;

  @Column({ type: "integer", name: "total_cents" })
  totalCents!: number;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  /** Why staff rejected, cancelled, or marked the order as not collected. */
  @Column({ type: "text", name: "status_reason", nullable: true })
  statusReason!: string | null;

  /** Staff member who entered the order; null for customer self-checkout. */
  @Column({ type: "integer", name: "created_by", nullable: true })
  createdBy!: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "created_by", foreignKeyConstraintName: "fk_orders_created_by" })
  creator!: User | null;

  @OneToMany(() => OrderItem, (item) => item.order)
  items!: OrderItem[];

  @CreateDateColumn({ type: "datetime", name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "datetime", name: "updated_at" })
  updatedAt!: Date;
}
