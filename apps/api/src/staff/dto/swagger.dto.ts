import { ApiProperty } from "@nestjs/swagger";
import {
  ORDER_STATUSES,
  STAFF_BOARD_MAX_ORDERS,
  TABLE_STATUSES,
  type OrderStatus,
  type TableStatus,
} from "@dinego/shared";
import { StaffOrderDto } from "../../orders/dto/swagger.dto.js";
import { DiningTableDto } from "../../tables/dto/swagger.dto.js";

export class StaffBoardOrderDto extends StaffOrderDto {
  @ApiProperty({
    enum: [...ORDER_STATUSES],
    isArray: true,
    example: ["IN_PROGRESS", "READY"],
    description:
      "Statuses you may move this order to now, in flow order: the first is the usual next step. Empty when the order waits for someone else. Send one to PATCH /staff/orders/:id/status.",
  })
  actions!: OrderStatus[];
}

export class StaffBoardResponseDto {
  @ApiProperty({ type: [StaffBoardOrderDto], description: "Oldest first, with items." })
  orders!: StaffBoardOrderDto[];

  @ApiProperty({
    example: false,
    description: `True when more than ${STAFF_BOARD_MAX_ORDERS} orders are in scope; only the oldest were returned.`,
  })
  hasMore!: boolean;
}

export class StaffFloorOrderDto {
  @ApiProperty({ example: 42 })
  id!: number;

  @ApiProperty({ example: "DG-00042" })
  orderNo!: string;

  @ApiProperty({ enum: [...ORDER_STATUSES], example: "READY" })
  status!: OrderStatus;
}

export class StaffFloorTableDto extends DiningTableDto {
  @ApiProperty({
    type: [StaffFloorOrderDto],
    description: "Dine-in orders still open at this table, oldest first.",
  })
  openOrders!: StaffFloorOrderDto[];

  @ApiProperty({
    enum: [...TABLE_STATUSES],
    isArray: true,
    example: ["BILL_REQUESTED"],
    description:
      "Statuses the table may change to now. None when out of service; no CLEANING or FREE while it has open orders. Send one to PATCH /floor/tables/:id/status.",
  })
  actions!: TableStatus[];
}

export class StaffFloorResponseDto {
  @ApiProperty({ type: [StaffFloorTableDto] })
  tables!: StaffFloorTableDto[];
}
