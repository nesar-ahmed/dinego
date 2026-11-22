import { HttpStatus, Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, type FindOptionsWhere, type Repository } from "typeorm";
import {
  canChangeOrderStatus,
  canSetOrderStatus,
  type OrderStatus,
  type OrderType,
  type StaffOrderErrorCode,
  type StaffOrderResponse,
  type StaffOrdersQuery,
  type StaffOrdersResponse,
  type UpdateOrderStatusInput,
  type UserRole,
} from "@dinego/shared";
import { runAtomically, type AtomicDatabase } from "../common/database/atomic.js";
import { apiError } from "../common/errors/api-error.js";
import { NotificationPublisher } from "../notifications/notification-publisher.js";
import { orderStatusNotifications } from "../notifications/notifications.catalog.js";
import { Order } from "./entities/order.entity.js";
import { countOrderItems } from "./item-counts.js";
import { toStaffOrder, toStaffOrderSummary } from "./orders.mapper.js";

const staffOrderError = (status: HttpStatus, code: StaffOrderErrorCode, message: string) =>
  apiError(status, code, message);

/**
 * What happens to the items when the order moves: the customer's order page shows each item's
 * kitchen status. Items already voided or served are never moved back. No-show changes nothing.
 */
const ITEM_UPDATES: Partial<Record<OrderStatus, string>> = {
  SENT: `UPDATE "order_items" SET "status" = 'FIRED', "fired_at" = COALESCE("fired_at", datetime('now'))
         WHERE "order_id" = ? AND "status" = 'PENDING'`,
  ACCEPTED: `UPDATE "order_items" SET "status" = 'FIRED', "fired_at" = COALESCE("fired_at", datetime('now'))
             WHERE "order_id" = ? AND "status" = 'PENDING'`,
  IN_PROGRESS: `UPDATE "order_items" SET "status" = 'PREPARING', "fired_at" = COALESCE("fired_at", datetime('now'))
                WHERE "order_id" = ? AND "status" IN ('PENDING', 'FIRED')`,
  PREPARING: `UPDATE "order_items" SET "status" = 'PREPARING', "fired_at" = COALESCE("fired_at", datetime('now'))
              WHERE "order_id" = ? AND "status" IN ('PENDING', 'FIRED')`,
  READY: `UPDATE "order_items" SET "status" = 'READY', "fired_at" = COALESCE("fired_at", datetime('now')),
            "ready_at" = COALESCE("ready_at", datetime('now'))
          WHERE "order_id" = ? AND "status" IN ('PENDING', 'FIRED', 'PREPARING')`,
  READY_FOR_PICKUP: `UPDATE "order_items" SET "status" = 'READY', "fired_at" = COALESCE("fired_at", datetime('now')),
                       "ready_at" = COALESCE("ready_at", datetime('now'))
                     WHERE "order_id" = ? AND "status" IN ('PENDING', 'FIRED', 'PREPARING')`,
  SERVED: `UPDATE "order_items" SET "status" = 'SERVED', "ready_at" = COALESCE("ready_at", datetime('now'))
           WHERE "order_id" = ? AND "status" IN ('PENDING', 'FIRED', 'PREPARING', 'READY')`,
  COLLECTED: `UPDATE "order_items" SET "status" = 'SERVED', "ready_at" = COALESCE("ready_at", datetime('now'))
              WHERE "order_id" = ? AND "status" IN ('PENDING', 'FIRED', 'PREPARING', 'READY')`,
  CLOSED: `UPDATE "order_items" SET "status" = 'SERVED', "ready_at" = COALESCE("ready_at", datetime('now'))
           WHERE "order_id" = ? AND "status" IN ('PENDING', 'FIRED', 'PREPARING', 'READY')`,
  REJECTED: `UPDATE "order_items" SET "status" = 'VOIDED'
             WHERE "order_id" = ? AND "status" IN ('PENDING', 'FIRED', 'PREPARING', 'READY')`,
  CANCELLED: `UPDATE "order_items" SET "status" = 'VOIDED'
              WHERE "order_id" = ? AND "status" IN ('PENDING', 'FIRED', 'PREPARING', 'READY')`,
};

interface OrderRow {
  id: number;
  order_no: string;
  type: OrderType;
  status: OrderStatus;
  customer_id: number | null;
  pickup_code: string | null;
  total_cents: number;
  table_label: string | null;
}

/**
 * Staff order handling: the order list and details for staff screens, and status changes that
 * move an order through the kitchen and hand-over (ORDER_STATUS_TRANSITIONS), each notifying the
 * customer and the staff who act next.
 */
@Injectable()
export class StaffOrdersService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly notifications: NotificationPublisher,
  ) {}

  /** Every order, newest first, optionally filtered by status and type. */
  async list(query: StaffOrdersQuery): Promise<StaffOrdersResponse> {
    const { page, pageSize } = query;
    const where: FindOptionsWhere<Order> = {};

    if (query.status !== undefined) where.status = In(query.status);
    if (query.type !== undefined) where.type = query.type;

    const [orders, total] = await this.orders.findAndCount({
      where,
      relations: { table: true, customer: true },
      order: { id: "DESC" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const counts = await countOrderItems(
      this.dataSource,
      orders.map((order) => order.id),
    );

    return {
      orders: orders.map((order) => toStaffOrderSummary(order, counts.get(order.id) ?? 0)),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async get(id: number): Promise<StaffOrderResponse> {
    const order = await this.orders.findOne({
      where: { id },
      relations: { table: true, items: true, customer: true },
    });

    if (!order) {
      throw staffOrderError(HttpStatus.NOT_FOUND, "ORDER_NOT_FOUND", "Order not found");
    }

    return { order: toStaffOrder(order) };
  }

  /**
   * Moves the order to a new status, in one synchronous transaction: the order, its items, and
   * the notifications. Repeating the current status is a no-op (safe double taps).
   */
  async changeStatus(
    actor: { id: number; role: UserRole },
    id: number,
    input: UpdateOrderStatusInput,
  ): Promise<StaffOrderResponse> {
    await runAtomically(this.dataSource, (db) => this.applyStatus(db, actor, id, input));
    return this.get(id);
  }

  private applyStatus(
    db: AtomicDatabase,
    actor: { id: number; role: UserRole },
    id: number,
    input: UpdateOrderStatusInput,
  ): void {
    const order = db
      .prepare(
        `SELECT o."id", o."order_no", o."type", o."status", o."customer_id", o."pickup_code",
                o."total_cents", t."label" AS "table_label"
         FROM "orders" AS o LEFT JOIN "dining_tables" AS t ON t."id" = o."table_id"
         WHERE o."id" = ?`,
      )
      .get(id) as OrderRow | undefined;

    if (!order) {
      throw staffOrderError(HttpStatus.NOT_FOUND, "ORDER_NOT_FOUND", "Order not found");
    }

    if (!canSetOrderStatus(actor.role, input.status)) {
      throw staffOrderError(
        HttpStatus.FORBIDDEN,
        "STATUS_NOT_ALLOWED_FOR_ROLE",
        `A ${actor.role} account cannot set an order to ${input.status}`,
      );
    }

    if (order.status === input.status) {
      return;
    }

    if (!canChangeOrderStatus(order.type, order.status, input.status)) {
      throw staffOrderError(
        HttpStatus.CONFLICT,
        "INVALID_STATUS_TRANSITION",
        `Order ${order.order_no} is ${order.status}; it cannot change to ${input.status}`,
      );
    }

    db.prepare(
      `UPDATE "orders" SET "status" = ?, "status_reason" = ?, "updated_at" = datetime('now')
       WHERE "id" = ? AND "status" = ?`,
    ).run(input.status, input.reason ?? null, id, order.status);

    const itemUpdate = ITEM_UPDATES[input.status];
    if (itemUpdate) db.prepare(itemUpdate).run(id);

    const { count } = db
      .prepare(
        `SELECT COALESCE(SUM("quantity"), 0) AS "count" FROM "order_items" WHERE "order_id" = ?`,
      )
      .get(id) as { count: number };

    this.notifications.writeAlongside(
      db,
      orderStatusNotifications.statusChanged({
        orderId: order.id,
        orderNo: order.order_no,
        type: order.type,
        customerId: order.customer_id,
        tableLabel: order.table_label,
        pickupCode: order.pickup_code,
        itemCount: Number(count),
        totalCents: order.total_cents,
        from: order.status,
        to: input.status,
        reason: input.reason ?? null,
        actorId: actor.id,
      }),
    );
  }
}
