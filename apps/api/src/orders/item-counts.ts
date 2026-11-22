import type { DataSource } from "typeorm";

/** Total item quantity per order, for order lists. Orders without items are left out. */
export async function countOrderItems(
  dataSource: DataSource,
  orderIds: number[],
): Promise<Map<number, number>> {
  if (orderIds.length === 0) {
    return new Map();
  }

  const rows: Array<{ orderId: number; count: number }> = await dataSource.query(
    `SELECT "order_id" AS "orderId", SUM("quantity") AS "count" FROM "order_items"
     WHERE "order_id" IN (${orderIds.map(() => "?").join(", ")})
     GROUP BY "order_id"`,
    orderIds,
  );

  return new Map(rows.map((row) => [Number(row.orderId), Number(row.count)]));
}
