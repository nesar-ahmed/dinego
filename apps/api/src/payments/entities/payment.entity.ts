import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { OrderType, PaymentMethod, PaymentStatus, Station } from "@dinego/shared";
import { Order } from "../../orders/entities/order.entity.js";
import { DiningTable } from "../../tables/entities/dining-table.entity.js";
import { User } from "../../users/entities/user.entity.js";

/** A priced cart line as it was paid for. Stored as JSON on the payment. */
export interface PaymentLineSnapshot {
  menuItemId: number;
  name: string;
  quantity: number;
  unitPriceCents: number;
  /** Tax percentage at payment time. Internal; not returned to customers. */
  taxRate: number;
  /** Kitchen station, copied to the order item. Missing in snapshots taken before orders. */
  station?: Station;
  lineTotalCents: number;
  taxCents: number;
}

/**
 * A charge. Checkout payments are taken before the order exists, so the payment stores the full
 * checkout snapshot and `orderId` stays null until the order is created from it.
 *
 * Financial records are never cascaded away: customers and tables with payments cannot be deleted.
 */
@Entity({ name: "payments" })
@Index("uq_payments_customer_idempotency_key", ["customerId", "idempotencyKey"], { unique: true })
@Index("uq_payments_open_checkout", ["customerId"], {
  unique: true,
  where: `"order_id" IS NULL AND "status" IN ('PENDING', 'SUCCEEDED')`,
})
@Index("idx_payments_order_id", ["orderId"])
@Index("idx_payments_table_id", ["tableId"])
@Check("chk_payments_order_type", `"order_type" IN ('DINE_IN', 'TAKEAWAY')`)
@Check(
  "chk_payments_table",
  `("order_type" = 'DINE_IN' AND "table_id" IS NOT NULL) OR ("order_type" = 'TAKEAWAY' AND "table_id" IS NULL)`,
)
@Check("chk_payments_method", `"method" IN ('CASH', 'CARD', 'ONLINE')`)
@Check(
  "chk_payments_status",
  `"status" IN ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED')`,
)
@Check(
  "chk_payments_amounts",
  `"subtotal_cents" >= 0 AND "tax_cents" >= 0 AND "tip_cents" >= 0 AND "amount_cents" > 0 AND "amount_cents" = "subtotal_cents" + "tax_cents" + "tip_cents"`,
)
@Check("chk_payments_lines", `json_valid("lines") AND json_type("lines") = 'array'`)
export class Payment {
  @PrimaryGeneratedColumn({ type: "integer" })
  id!: number;

  /** The order placed with this payment, set atomically when the payment succeeds. */
  @Column({ type: "integer", name: "order_id", nullable: true })
  orderId!: number | null;

  @ManyToOne(() => Order, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "order_id", foreignKeyConstraintName: "fk_payments_order" })
  order!: Order | null;

  @Column({ type: "integer", name: "customer_id", nullable: true })
  customerId!: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "customer_id", foreignKeyConstraintName: "fk_payments_customer" })
  customer!: User | null;

  /** Delivery mode chosen at checkout. */
  @Column({ type: "text", name: "order_type" })
  orderType!: OrderType;

  @Column({ type: "integer", name: "table_id", nullable: true })
  tableId!: number | null;

  @ManyToOne(() => DiningTable, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "table_id", foreignKeyConstraintName: "fk_payments_table" })
  table!: DiningTable | null;

  @Column({ type: "text" })
  method!: PaymentMethod;

  @Column({ type: "integer", name: "subtotal_cents" })
  subtotalCents!: number;

  @Column({ type: "integer", name: "tax_cents" })
  taxCents!: number;

  @Column({ type: "integer", name: "tip_cents" })
  tipCents!: number;

  @Column({ type: "integer", name: "amount_cents" })
  amountCents!: number;

  @Column({ type: "simple-json" })
  lines!: PaymentLineSnapshot[];

  @Column({ type: "text", default: "PENDING" })
  status!: PaymentStatus;

  @Column({ type: "text" })
  provider!: string;

  @Column({ type: "text", name: "provider_ref", nullable: true })
  providerRef!: string | null;

  @Column({ type: "text", name: "failure_code", nullable: true })
  failureCode!: string | null;

  @Column({ type: "text", name: "failure_message", nullable: true })
  failureMessage!: string | null;

  /** Client-supplied retry key, unique per customer. */
  @Column({ type: "text", name: "idempotency_key" })
  idempotencyKey!: string;

  /** Hash of the request body, so a reused key with a different request is rejected. */
  @Column({ type: "text", name: "request_hash" })
  requestHash!: string;

  @CreateDateColumn({ type: "datetime", name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "datetime", name: "updated_at" })
  updatedAt!: Date;
}
