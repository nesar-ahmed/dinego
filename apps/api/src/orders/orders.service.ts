import { randomInt } from "node:crypto";
import { HttpStatus, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, type Repository } from "typeorm";
import type {
  CheckoutInput,
  OrderErrorCode,
  OrderResponse,
  OrdersQuery,
  OrdersResponse,
  OrderStatus,
  PaymentMethod,
} from "@dinego/shared";
import { runAtomically, type AtomicDatabase } from "../common/database/atomic.js";
import { apiError } from "../common/errors/api-error.js";
import { NotificationPublisher } from "../notifications/notification-publisher.js";
import { checkoutNotifications } from "../notifications/notifications.catalog.js";
import { Payment, type PaymentLineSnapshot } from "../payments/entities/payment.entity.js";
import { PaymentsService } from "../payments/payments.service.js";
import { UsersService } from "../users/users.service.js";
import { Order } from "./entities/order.entity.js";
import { countOrderItems } from "./item-counts.js";
import { toCustomerOrder, toOrderSummary } from "./orders.mapper.js";

const orderError = (status: HttpStatus, code: OrderErrorCode, message: string) =>
  apiError(status, code, message);

/** First status of a customer order. Dine-in goes straight to the kitchen; takeaway waits to be accepted. */
const INITIAL_STATUS: Record<"DINE_IN" | "TAKEAWAY", OrderStatus> = {
  DINE_IN: "SENT",
  TAKEAWAY: "PLACED",
};

interface PaymentRow {
  id: number;
  order_id: number | null;
  customer_id: number | null;
  order_type: "DINE_IN" | "TAKEAWAY";
  table_id: number | null;
  method: PaymentMethod;
  status: string;
  subtotal_cents: number;
  tax_cents: number;
  tip_cents: number;
  amount_cents: number;
  lines: string;
}

/**
 * Customer orders.
 *
 * Checkout (`checkout`) is one request: validate the cart and delivery mode, charge the dummy
 * payment provider, then in ONE atomic transaction mark the payment SUCCEEDED, create the order
 * and its items from the payment's snapshot, link the payment, remove the ordered items from the
 * cart, and seat a FREE dine-in table. A payment can therefore never succeed without its order.
 * The same transaction notifies the customer (order placed) and the staff (new order), so those
 * notifications exist exactly when the order does, including orders placed by restart recovery.
 */
@Injectable()
export class OrdersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    private readonly paymentsService: PaymentsService,
    private readonly usersService: UsersService,
    private readonly notifications: NotificationPublisher,
  ) {}

  /** Pays for the cart and places the order. Safe to retry with the same Idempotency-Key. */
  async checkout(
    customerId: number,
    idempotencyKey: string,
    input: CheckoutInput,
  ): Promise<OrderResponse> {
    await this.usersService.assertActiveCustomer(customerId);

    const start = await this.paymentsService.startCheckout(customerId, idempotencyKey, input);

    if (start.kind === "replay") {
      return this.resumeFromPayment(customerId, start.payment);
    }

    const result = await this.paymentsService.charge(start.paymentId, input, start.priced);

    if (result.status === "FAILED") {
      throw await this.paymentsService.recordFailure(start.paymentId, result);
    }

    let orderId: number;

    try {
      orderId = await this.placeOrder(start.paymentId, result.providerRef);
    } catch (error) {
      // Nothing was written (the transaction rolled back). Dummy payments move no money, so the
      // attempt is recorded as failed and the customer can simply check out again.
      this.logger.error(`Payment ${start.paymentId}: order could not be placed`, error);
      throw await this.paymentsService.recordFailure(start.paymentId, {
        status: "FAILED",
        providerRef: result.providerRef,
        failureCode: "provider_error",
        failureMessage: "We could not place your order and you were not charged. Please try again.",
      });
    }

    return this.getOrder(customerId, orderId);
  }

  /** The customer's orders, newest first. */
  async list(customerId: number, query: OrdersQuery): Promise<OrdersResponse> {
    await this.usersService.assertActiveCustomer(customerId);

    const { page, pageSize } = query;
    const [orders, total] = await this.orders.findAndCount({
      where: { customerId },
      relations: { table: true },
      order: { id: "DESC" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const counts = await countOrderItems(
      this.dataSource,
      orders.map((order) => order.id),
    );

    return {
      orders: orders.map((order) => toOrderSummary(order, counts.get(order.id) ?? 0)),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  /** One of the customer's orders with items and payments. */
  async getOrder(customerId: number, orderId: number): Promise<OrderResponse> {
    await this.usersService.assertActiveCustomer(customerId);

    const order = await this.orders.findOne({
      where: { id: orderId, customerId },
      relations: { table: true, items: true },
    });

    if (!order) {
      throw orderError(HttpStatus.NOT_FOUND, "ORDER_NOT_FOUND", "Order not found");
    }

    const payments = await this.payments.find({ where: { orderId }, order: { id: "ASC" } });
    return { order: toCustomerOrder(order, payments) };
  }

  /**
   * Startup recovery for a restart in the middle of a checkout (the API is a single process):
   * PENDING payments are failed (nothing was charged by the dummy provider), and any SUCCEEDED
   * payment without an order gets its order.
   */
  async onApplicationBootstrap(): Promise<void> {
    const failed = await this.paymentsService.failInterruptedPayments();
    const orphans: Array<{ id: number; provider_ref: string | null }> = await this.dataSource.query(
      `SELECT "id", "provider_ref" FROM "payments" WHERE "status" = 'SUCCEEDED' AND "order_id" IS NULL`,
    );

    for (const orphan of orphans) {
      await this.placeOrder(orphan.id, orphan.provider_ref);
    }

    if (failed > 0 || orphans.length > 0) {
      this.logger.warn(
        `Recovered interrupted checkouts: ${failed} payment(s) failed, ${orphans.length} order(s) placed`,
      );
    }
  }

  /* -------------------------------- helpers ------------------------------- */

  /** A retried checkout: return the order, or the original outcome of the payment. */
  private async resumeFromPayment(customerId: number, payment: Payment): Promise<OrderResponse> {
    if (payment.orderId !== null) {
      return this.getOrder(customerId, payment.orderId);
    }

    switch (payment.status) {
      case "FAILED":
        throw this.paymentsService.failureError(payment);
      case "SUCCEEDED":
        return this.getOrder(customerId, await this.placeOrder(payment.id, payment.providerRef));
      default:
        throw this.paymentsService.inProgressError(payment.id);
    }
  }

  /**
   * Marks the payment SUCCEEDED and creates its order, in one synchronous transaction.
   * Idempotent: returns the existing order when the payment already has one.
   */
  private placeOrder(paymentId: number, providerRef: string | null): Promise<number> {
    return runAtomically(this.dataSource, (db) => {
      const payment = db
        .prepare(
          `SELECT "id", "order_id", "customer_id", "order_type", "table_id", "method", "status",
                  "subtotal_cents", "tax_cents", "tip_cents", "amount_cents", "lines"
           FROM "payments" WHERE "id" = ?`,
        )
        .get(paymentId) as PaymentRow | undefined;

      if (!payment) {
        throw new Error(`Payment ${paymentId} not found`);
      }

      if (payment.order_id !== null) {
        return payment.order_id;
      }

      if (payment.status === "PENDING") {
        db.prepare(
          `UPDATE "payments" SET "status" = 'SUCCEEDED', "provider_ref" = ?,
             "updated_at" = datetime('now') WHERE "id" = ?`,
        ).run(providerRef, paymentId);
      } else if (payment.status !== "SUCCEEDED") {
        throw new Error(`Payment ${paymentId} is ${payment.status}; no order can be placed`);
      }

      const orderId = this.insertOrder(db, payment);

      db.prepare(
        `UPDATE "payments" SET "order_id" = ?, "updated_at" = datetime('now') WHERE "id" = ?`,
      ).run(orderId, paymentId);

      return orderId;
    });
  }

  /**
   * Inserts the order and its items from the payment snapshot, updates cart and table, and
   * notifies the customer and the staff.
   */
  private insertOrder(db: AtomicDatabase, payment: PaymentRow): number {
    const dineIn = payment.order_type === "DINE_IN";
    const lines = JSON.parse(payment.lines) as PaymentLineSnapshot[];
    const pickupCode = dineIn ? null : String(randomInt(0, 10_000)).padStart(4, "0");

    const { id: orderId } = db
      .prepare(
        `INSERT INTO "orders" (
           "order_no", "type", "status", "table_id", "customer_id", "pickup_code",
           "subtotal_cents", "tax_cents", "tip_cents", "total_cents"
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING "id"`,
      )
      .get(
        `pending-${payment.id}`,
        payment.order_type,
        INITIAL_STATUS[payment.order_type],
        payment.table_id,
        payment.customer_id,
        pickupCode,
        payment.subtotal_cents,
        payment.tax_cents,
        payment.tip_cents,
        payment.amount_cents,
      ) as { id: number };

    const { order_no: orderNo } = db
      .prepare(
        `UPDATE "orders" SET "order_no" = printf('DG-%05d', "id") WHERE "id" = ? RETURNING "order_no"`,
      )
      .get(orderId) as { order_no: string };

    // Dine-in items go straight to the kitchen (FIRED); takeaway items wait for acceptance.
    const insertItem = db.prepare(
      `INSERT INTO "order_items" (
         "order_id", "menu_item_id", "name", "quantity", "unit_price_cents", "status", "station",
         "fired_at"
       ) VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN datetime('now') END)`,
    );
    for (const line of lines) {
      insertItem.run(
        orderId,
        line.menuItemId,
        line.name,
        line.quantity,
        line.unitPriceCents,
        dineIn ? "FIRED" : "PENDING",
        line.station ?? "OTHER",
        dineIn ? 1 : 0,
      );
    }

    this.removeOrderedFromCart(db, payment.customer_id, lines);

    let tableSeated = false;

    if (dineIn) {
      tableSeated =
        db
          .prepare(
            `UPDATE "dining_tables" SET "status" = 'OCCUPIED', "updated_at" = datetime('now')
             WHERE "id" = ? AND "status" = 'FREE' AND "active" = 1`,
          )
          .run(payment.table_id).changes === 1;
    }

    if (payment.customer_id !== null) {
      const table = dineIn
        ? (db
            .prepare(`SELECT "label" FROM "dining_tables" WHERE "id" = ?`)
            .get(payment.table_id) as { label: string } | undefined)
        : undefined;

      this.notifications.writeAlongside(
        db,
        checkoutNotifications.orderPlaced({
          orderId,
          orderNo,
          type: payment.order_type,
          customerId: payment.customer_id,
          tableLabel: table?.label ?? null,
          tableSeated,
          pickupCode,
          itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
          totalCents: payment.amount_cents,
          method: payment.method,
        }),
      );
    }

    return orderId;
  }

  /**
   * Subtracts the ordered quantities from the cart. Items added in another tab during checkout
   * stay in the cart.
   */
  private removeOrderedFromCart(
    db: AtomicDatabase,
    customerId: number | null,
    lines: PaymentLineSnapshot[],
  ): void {
    const cart = db.prepare(`SELECT "id" FROM "carts" WHERE "customer_id" = ?`).get(customerId) as
      { id: number } | undefined;

    if (!cart) {
      return;
    }

    const remove = db.prepare(
      `DELETE FROM "cart_items" WHERE "cart_id" = ? AND "menu_item_id" = ? AND "quantity" <= ?`,
    );
    const reduce = db.prepare(
      `UPDATE "cart_items" SET "quantity" = "quantity" - ?, "updated_at" = datetime('now')
       WHERE "cart_id" = ? AND "menu_item_id" = ? AND "quantity" > ?`,
    );

    for (const line of lines) {
      remove.run(cart.id, line.menuItemId, line.quantity);
      reduce.run(line.quantity, cart.id, line.menuItemId, line.quantity);
    }

    db.prepare(`UPDATE "carts" SET "updated_at" = datetime('now') WHERE "id" = ?`).run(cart.id);
  }
}
