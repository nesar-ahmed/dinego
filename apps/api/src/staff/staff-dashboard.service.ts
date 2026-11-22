import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, type FindOptionsWhere, type Repository } from "typeorm";
import {
  OPEN_TABLE_ORDER_STATUSES,
  ORDER_TYPES,
  orderActionsFor,
  STAFF_BOARD_MAX_ORDERS,
  STAFF_BOARD_SCOPES,
  tableActionsFor,
  type StaffBoardQuery,
  type StaffBoardResponse,
  type StaffFloorOrder,
  type StaffFloorResponse,
  type StaffRole,
} from "@dinego/shared";
import { Order } from "../orders/entities/order.entity.js";
import { toStaffOrder } from "../orders/orders.mapper.js";
import { DiningTable } from "../tables/entities/dining-table.entity.js";
import { compareTables, toTableDto } from "../tables/tables.mapper.js";

/**
 * Read models for the staff dashboards. Each returns everything a screen needs in one request:
 * the board (orders with items and what the caller may do next) and the floor (tables with their
 * open orders and allowed status changes). Changes still go through the staff order and floor
 * endpoints, which enforce the same rules.
 */
@Injectable()
export class StaffDashboardService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(DiningTable) private readonly tables: Repository<DiningTable>,
  ) {}

  /** The orders on `role`'s board (STAFF_BOARD_SCOPES), oldest first, with their actions. */
  async board(role: StaffRole, query: StaffBoardQuery): Promise<StaffBoardResponse> {
    const scope = STAFF_BOARD_SCOPES[role];
    const where: FindOptionsWhere<Order>[] = ORDER_TYPES.filter(
      (type) => (query.type === undefined || query.type === type) && (scope[type]?.length ?? 0) > 0,
    ).map((type) => ({ type, status: In([...scope[type]!]) }));

    if (where.length === 0) {
      return { orders: [], hasMore: false };
    }

    const orders = await this.orders.find({
      where,
      relations: { table: true, customer: true, items: true },
      order: { createdAt: "ASC", id: "ASC" },
      take: STAFF_BOARD_MAX_ORDERS + 1,
    });
    const shown = orders.slice(0, STAFF_BOARD_MAX_ORDERS);

    return {
      orders: shown.map((order) => ({
        ...toStaffOrder(order),
        actions: orderActionsFor(role, order.type, order.status),
      })),
      hasMore: orders.length > STAFF_BOARD_MAX_ORDERS,
    };
  }

  /** Every table in floor-plan order, with its open dine-in orders and allowed status changes. */
  async floor(): Promise<StaffFloorResponse> {
    const [tables, open] = await Promise.all([
      this.tables.find(),
      this.orders.find({
        select: { id: true, orderNo: true, status: true, tableId: true },
        where: { type: "DINE_IN", status: In([...OPEN_TABLE_ORDER_STATUSES]) },
        order: { id: "ASC" },
      }),
    ]);

    const byTable = new Map<number, StaffFloorOrder[]>();
    for (const order of open) {
      if (order.tableId === null) continue;
      const list = byTable.get(order.tableId) ?? [];
      list.push({ id: order.id, orderNo: order.orderNo, status: order.status });
      byTable.set(order.tableId, list);
    }

    return {
      tables: [...tables].sort(compareTables).map((table) => {
        const openOrders = byTable.get(table.id) ?? [];
        return {
          ...toTableDto(table),
          openOrders,
          actions: tableActionsFor(table.status, table.active, openOrders.length),
        };
      }),
    };
  }
}
